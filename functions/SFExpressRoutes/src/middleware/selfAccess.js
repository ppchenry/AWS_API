const { createErrorResponse } = require("../utils/response");
const { logError } = require("../utils/logger");

const PRIVILEGED_ORDER_ROLES = new Set(["admin", "ngo", "staff", "developer"]);

const SELF_ACCESS_POLICIES = {
  "POST /sf-express-routes/create-order": "orderTempIdsOwnedOrPrivileged",
};

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

async function loadAuthorizedOrdersForMutation({ event, body, orderReadModel }) {
  const routeKey = `${event.httpMethod} ${event.resource}`;
  const policy = SELF_ACCESS_POLICIES[routeKey];

  if (!policy) {
    return { isValid: true, orders: [] };
  }

  const requestedTempIds = Array.from(new Set([
    ...(Array.isArray(body?.tempIdList) ? body.tempIdList : []),
    ...(body?.tempId ? [body.tempId] : []),
  ].filter(Boolean)));

  if (requestedTempIds.length === 0) {
    return { isValid: true, orders: [] };
  }

  const orders = await orderReadModel
    .find({ tempId: { $in: requestedTempIds } })
    .select("_id tempId email")
    .lean();

  if (orders.length === 0) {
    return { isValid: true, orders: [] };
  }

  if (policy === "orderTempIdsOwnedOrPrivileged" && PRIVILEGED_ORDER_ROLES.has(event.userRole)) {
    return { isValid: true, orders };
  }

  const callerEmail = normalizeEmail(event.userEmail);
  if (!callerEmail) {
    logError("Caller email missing for order ownership check", {
      scope: "middleware.selfAccess.loadAuthorizedOrdersForMutation",
      event,
      extra: { tempIds: requestedTempIds },
    });

    return {
      isValid: false,
      error: createErrorResponse(403, "common.unauthorized", event),
    };
  }

  const unauthorizedOrder = orders.find((order) => normalizeEmail(order.email) !== callerEmail);
  if (unauthorizedOrder) {
    logError("Order ownership check failed", {
      scope: "middleware.selfAccess.loadAuthorizedOrdersForMutation",
      event,
      extra: {
        tempId: unauthorizedOrder.tempId,
        orderEmail: unauthorizedOrder.email,
      },
    });

    return {
      isValid: false,
      error: createErrorResponse(403, "common.unauthorized", event),
    };
  }

  return { isValid: true, orders };
}

module.exports = {
  loadAuthorizedOrdersForMutation,
};