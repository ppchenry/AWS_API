const { createErrorResponse } = require("../utils/response");
const { normalizeEmail } = require("../utils/validators");

const PRIVILEGED_ROLES = new Set(["admin", "developer"]);
const ORDER_OWNERSHIP_PROJECTION = "_id tempId email";

function createUnauthorizedResponse(event) {
  return createErrorResponse(403, "others.unauthorized", event);
}

function isPrivilegedCaller(event) {
  return PRIVILEGED_ROLES.has(event.userRole);
}

function getCallerEmail(event) {
  return normalizeEmail(event.userEmail || event.user?.userEmail || event.user?.email);
}

function validateOwnerEmail({ event, ownerEmail }) {
  if (isPrivilegedCaller(event)) {
    return { isValid: true };
  }

  const callerEmail = getCallerEmail(event);
  const normalizedOwnerEmail = normalizeEmail(ownerEmail);

  if (!callerEmail || !normalizedOwnerEmail || callerEmail !== normalizedOwnerEmail) {
    return {
      isValid: false,
      error: createUnauthorizedResponse(event),
    };
  }

  return { isValid: true };
}

/**
 * Loads an order by tempId and enforces caller ownership for non-privileged callers.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any>, Order: any, tempId: string, projection?: string }} args
 * @returns {Promise<{ isValid: boolean, error?: import("aws-lambda").APIGatewayProxyResult, order?: Record<string, any>|null }>}
 */
async function loadAuthorizedOrderByTempId({ event, Order, tempId, projection = ORDER_OWNERSHIP_PROJECTION }) {
  const order = await Order.findOne({ tempId }).select(projection).lean();
  if (!order) {
    return { isValid: true, order: null };
  }

  const validation = validateOwnerEmail({ event, ownerEmail: order.email });
  if (!validation.isValid) {
    return validation;
  }

  return {
    isValid: true,
    order,
  };
}

/**
 * Loads a supplier-facing order verification record and enforces caller ownership for non-privileged callers.
 *
 * @param {{ event: import("aws-lambda").APIGatewayProxyEvent & Record<string, any>, OrderVerification: any, Order: any, identifier: string, projection: string }} args
 * @returns {Promise<{ isValid: boolean, error?: import("aws-lambda").APIGatewayProxyResult, orderVerification?: Record<string, any>|null, order?: Record<string, any>|null }>}
 */
async function loadAuthorizedSupplierOrderVerification({ event, OrderVerification, Order, identifier, projection }) {
  let orderVerification = await OrderVerification.findOne({ orderId: identifier }).select(projection).lean();
  if (!orderVerification) orderVerification = await OrderVerification.findOne({ contact: identifier }).select(projection).lean();
  if (!orderVerification) orderVerification = await OrderVerification.findOne({ tagId: identifier }).select(projection).lean();

  if (!orderVerification) {
    return {
      isValid: true,
      orderVerification: null,
      order: null,
    };
  }

  if (isPrivilegedCaller(event)) {
    return {
      isValid: true,
      orderVerification,
      order: null,
    };
  }

  if (orderVerification.orderId) {
    const orderAuthorization = await loadAuthorizedOrderByTempId({
      event,
      Order,
      tempId: orderVerification.orderId,
    });
    if (!orderAuthorization.isValid) {
      return orderAuthorization;
    }

    if (orderAuthorization.order) {
      return {
        isValid: true,
        orderVerification,
        order: orderAuthorization.order,
      };
    }
  }

  const fallbackValidation = validateOwnerEmail({ event, ownerEmail: orderVerification.masterEmail });
  if (!fallbackValidation.isValid) {
    return fallbackValidation;
  }

  return {
    isValid: true,
    orderVerification,
    order: null,
  };
}

module.exports = {
  loadAuthorizedOrderByTempId,
  loadAuthorizedSupplierOrderVerification,
};