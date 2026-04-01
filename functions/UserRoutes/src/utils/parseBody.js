/**
 * Safe JSON parse for API Gateway bodies (avoids throwing on malformed JSON).
 *
 * @param {import("aws-lambda").APIGatewayProxyEvent} event
 * @returns {{ ok: true, body: Record<string, any> } | { ok: false }}
 */
function tryParseJsonBody(event) {
  try {
    return { ok: true, body: event.body ? JSON.parse(event.body) : {} };
  } catch {
    return { ok: false };
  }
}

module.exports = { tryParseJsonBody };
