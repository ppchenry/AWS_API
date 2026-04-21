const https = require("https");
const querystring = require("querystring");

const { createRequestId, requestJson } = require("./sfShared");

const SF_OAUTH_URL = "https://sfapi.sf-express.com/oauth2/accessToken";
const SF_SERVICE_URL = "https://sfapi.sf-express.com/std/service";
const SF_CLOUD_PRINT_URL = "https://bspgw.sf-express.com/std/service";

async function getAccessToken() {
  const body = querystring.stringify({
    grantType: "password",
    secret: process.env.SF_PRODUCTION_CHECK_CODE,
    partnerID: process.env.SF_CUSTOMER_CODE,
  });

  const response = await requestJson({
    url: SF_OAUTH_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (response.status < 200 || response.status >= 300 || !response.body.accessToken) {
    throw new Error("Unable to fetch SF access token");
  }

  return response.body.accessToken;
}

async function callSfService({ serviceCode, msgData, accessToken, url = SF_SERVICE_URL }) {
  const body = querystring.stringify({
    partnerID: process.env.SF_CUSTOMER_CODE,
    requestID: createRequestId(),
    serviceCode,
    timestamp: Date.now().toString(),
    accessToken,
    msgData: JSON.stringify(msgData),
  });

  const response = await requestJson({
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error("sfExpress.errors.sfApiError");
  }

  if (response.body.apiResultCode !== "A1000") {
    throw new Error("sfExpress.errors.sfApiError");
  }

  try {
    return JSON.parse(response.body.apiResultData || "{}");
  } catch (_error) {
    throw new Error("sfExpress.errors.invalidSfResponse");
  }
}

async function downloadPdf(url, token) {
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: { "X-Auth-token": token },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("sfExpress.errors.sfApiError"));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on("error", reject);
    req.end();
  });
}

module.exports = {
  SF_CLOUD_PRINT_URL,
  callSfService,
  downloadPdf,
  getAccessToken,
};