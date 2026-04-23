#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "dev_docs", "api_docs");

const DEFAULTS = {
  userId: process.env.TEST_OWNER_USER_ID || "65a4e7bdee769392c8327191",
  petID: process.env.TEST_PET_ID || "6871cb702211cfb6c4f357fa",
  petId: process.env.TEST_PET_ID || "6871cb702211cfb6c4f357fa",
  ngoId: process.env.TEST_NGO_ID || "686f3f6f2ad9f96799b53564",
  tagId: process.env.ORDER_VERIFICATION_TAG_ID || process.env.TEST_TAG_ID || "X9C5K9",
  tempId: process.env.ORDER_TEMP_ID || "CUS-6657596796",
  orderId: process.env.ORDER_ID || "CUS-6657596796",
  _id: process.env.ORDER_VERIFICATION_ID || "69cb56c394df34b3e97f1cd7",
};

const OBJECT_ID_FALLBACK = "000000000000000000000000";
const STRING_ID_FALLBACK = "route-check-id";
const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]);

function readMarkdownFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function sanitizePath(value) {
  if (!value) return null;
  const clean = value.replace(/`/g, "").trim();
  if (!clean.startsWith("/")) return null;
  return clean.replace(/\/+$/, "") || "/";
}

function parseEndpointRows(line) {
  if (!line.trim().startsWith("|")) return null;
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells.length < 3) return null;
  const method = (cells[1] || "").toUpperCase();
  const endpointPath = sanitizePath(cells[2]);
  if (!METHODS.has(method) || !endpointPath) return null;
  return { method, endpointPath };
}

function parseEndpointHeading(line) {
  const match = line.match(/^###\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s+(`?)(\/[^\s`]+)\2/i);
  if (!match) return null;
  return {
    method: match[1].toUpperCase(),
    endpointPath: sanitizePath(match[3]),
  };
}

function loadDocumentedEndpoints() {
  const files = readMarkdownFiles(DOCS_DIR);
  const seen = new Set();
  const endpoints = [];

  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const tableParsed = parseEndpointRows(line);
      const headingParsed = tableParsed ? null : parseEndpointHeading(line);
      const parsed = tableParsed || headingParsed;
      if (!parsed) continue;

      const key = `${parsed.method} ${parsed.endpointPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      endpoints.push({
        method: parsed.method,
        endpointPath: parsed.endpointPath,
        sourceFile: path.basename(file),
      });
    }
  }

  return endpoints.sort((a, b) => {
    const methodDiff = a.method.localeCompare(b.method);
    return methodDiff !== 0 ? methodDiff : a.endpointPath.localeCompare(b.endpointPath);
  });
}

function resolveParamValue(paramName) {
  const direct = DEFAULTS[paramName];
  if (direct) return direct;

  const lower = paramName.toLowerCase();
  if (lower.includes("userid")) return DEFAULTS.userId;
  if (lower.includes("petid")) return DEFAULTS.petID;
  if (lower.includes("ngoid")) return DEFAULTS.ngoId;
  if (lower.includes("tagid")) return DEFAULTS.tagId;
  if (lower.includes("tempid")) return DEFAULTS.tempId;
  if (lower.includes("orderid")) return DEFAULTS.orderId;
  if (lower === "_id") return DEFAULTS._id;

  if (lower.includes("id")) return OBJECT_ID_FALLBACK;
  return STRING_ID_FALLBACK;
}

function materializePath(endpointPath) {
  return endpointPath.replace(/\{([^}]+)\}/g, (_match, name) =>
    encodeURIComponent(resolveParamValue(name))
  );
}

function buildRequest(method) {
  const headers = {
    Accept: "application/json",
  };

  if (process.env.DEV_API_KEY) {
    headers["x-api-key"] = process.env.DEV_API_KEY;
  }

  const request = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "DELETE" && method !== "OPTIONS") {
    headers["Content-Type"] = "application/json";
    request.body = "{}";
  }

  if (method === "DELETE" || method === "PUT" || method === "PATCH") {
    headers.Authorization = "Bearer route-check-invalid-token";
  }

  return request;
}

async function fetchWithTimeout(url, init, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function detectGatewayMissingRoute(status, headers, bodyText) {
  const errType = (headers.get("x-amzn-errortype") || "").toLowerCase();
  if (errType.includes("missingauthenticationtokenexception")) return true;

  if (status !== 403 && status !== 404) return false;

  const body = (bodyText || "").trim();
  if (!body) return false;

  const asJson = tryParseJson(body);
  const message =
    asJson && typeof asJson.message === "string" ? asJson.message.toLowerCase() : "";

  if (message.includes("missing authentication token")) return true;
  if (body.toLowerCase().includes("missing authentication token")) return true;
  return false;
}

function printResult(result) {
  const status = result.error ? "ERR" : String(result.status);
  console.log(`[route-check] ${status.padStart(3, " ")} ${result.method} ${result.endpointPath}`);
}

async function run() {
  const baseUrl = process.env.DEV_BASE_URL;
  if (!baseUrl) {
    console.error("[route-check] DEV_BASE_URL is missing. Set it in .env.");
    process.exit(1);
  }

  const endpoints = loadDocumentedEndpoints();
  if (endpoints.length === 0) {
    console.error("[route-check] No endpoints found in dev_docs/api_docs.");
    process.exit(1);
  }

  console.log(`[route-check] Checking ${endpoints.length} documented endpoints from dev_docs/api_docs`);

  const results = [];
  for (const endpoint of endpoints) {
    const resolvedPath = materializePath(endpoint.endpointPath);
    const url = `${baseUrl}${resolvedPath}`;
    try {
      const { response, body } = await fetchWithTimeout(url, buildRequest(endpoint.method));
      const gatewayMissingRoute = detectGatewayMissingRoute(
        response.status,
        response.headers,
        body
      );
      const result = {
        ...endpoint,
        resolvedPath,
        status: response.status,
        is405: response.status === 405,
        gatewayMissingRoute,
        responseSnippet: body ? body.slice(0, 240).replace(/\s+/g, " ").trim() : "",
      };
      results.push(result);
      printResult(result);
    } catch (error) {
      const result = {
        ...endpoint,
        resolvedPath,
        status: null,
        error: error && error.message ? error.message : String(error),
        is405: false,
      };
      results.push(result);
      printResult(result);
    }
  }

  const status405 = results.filter((result) => result.is405);
  const gatewayMissingRoute = results.filter((result) => result.gatewayMissingRoute);
  const errors = results.filter((result) => result.error);
  const non405 = results.length - status405.length;

  console.log("");
  console.log(
    `[route-check] Summary: total=${results.length}, non405=${non405}, status405=${status405.length}, gatewayMissingRoute=${gatewayMissingRoute.length}, errors=${errors.length}`
  );

  if (status405.length > 0) {
    console.log("[route-check] Endpoints returning 405:");
    for (const item of status405) {
      console.log(`- ${item.method} ${item.endpointPath} (${item.sourceFile})`);
    }
    process.exitCode = 1;
  }

  if (errors.length > 0) {
    console.log("[route-check] Endpoint request errors:");
    for (const item of errors) {
      console.log(`- ${item.method} ${item.endpointPath} (${item.sourceFile}): ${item.error}`);
    }
    process.exitCode = 1;
  }

  if (gatewayMissingRoute.length > 0) {
    console.log("[route-check] Endpoints rejected early by API Gateway (possible missing route/method deployment):");
    for (const item of gatewayMissingRoute) {
      const suffix = item.responseSnippet ? ` | body: ${item.responseSnippet}` : "";
      console.log(`- ${item.method} ${item.endpointPath} (${item.sourceFile}) -> ${item.status}${suffix}`);
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[route-check] Fatal error:", error);
  process.exit(1);
});
