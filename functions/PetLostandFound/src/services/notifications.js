const mongoose = require("mongoose");
const { createSuccessResponse, createErrorResponse } = require("../utils/response");
const { sanitizeNotification } = require("../utils/sanitize");
const { parseDDMMYYYY } = require("../utils/validators");
const { getFirstZodIssueMessage } = require("../utils/zod");
const { logError } = require("../utils/logger");
const { createNotificationSchema } = require("../zodSchema/notificationSchema");

/**
 * GET /v2/account/{userId}/notifications — List user notifications.
 */
async function listNotifications({ event }) {
  try {
    const userId = event.pathParameters?.userId;

    const Notifications = mongoose.model("Notifications");
    const notifications = await Notifications.find({ userId })
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    if (!notifications || notifications.length === 0) {
      return createSuccessResponse(200, event, {
        message: "No notifications found for this user",
        count: 0,
        notifications: [],
      });
    }

    return createSuccessResponse(200, event, {
      message: "Notifications retrieved successfully",
      count: notifications.length,
      notifications: notifications.map(sanitizeNotification),
    });
  } catch (error) {
    logError("Error listing notifications", {
      scope: "services.notifications.listNotifications",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * POST /v2/account/{userId}/notifications — Create a notification.
 */
async function createNotification({ event, body }) {
  try {
    const userId = event.pathParameters?.userId;

    // Zod validation
    const parseResult = createNotificationSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(400, getFirstZodIssueMessage(parseResult.error), event);
    }

    const data = parseResult.data;

    const Notifications = mongoose.model("Notifications");
    const newNotification = await Notifications.create({
      userId: userId,
      type: data.type,
      petId: data.petId || null,
      petName: data.petName,
      nextEventDate: data.nextEventDate ? parseDDMMYYYY(data.nextEventDate) : null,
      nearbyPetLost: data.nearbyPetLost,
    });

    return createSuccessResponse(200, event, {
      message: "Notification created successfully",
      notification: sanitizeNotification(newNotification),
      id: newNotification._id,
    });
  } catch (error) {
    logError("Error creating notification", {
      scope: "services.notifications.createNotification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

/**
 * PUT /v2/account/{userId}/notifications/{notificationId} — Archive a notification.
 */
async function archiveNotification({ event }) {
  try {
    const userId = event.pathParameters?.userId;
    const notificationId = event.pathParameters?.notificationId;

    if (!notificationId) {
      return createErrorResponse(400, "notifications.errors.notificationIdRequired", event);
    }

    const Notifications = mongoose.model("Notifications");
    const result = await Notifications.updateOne(
      { _id: notificationId, userId: userId },
      { $set: { isArchived: true } }
    );

    if (result.matchedCount === 0) {
      return createErrorResponse(404, "notifications.errors.notFound", event);
    }

    return createSuccessResponse(200, event, {
      message: "Notification archived successfully",
      notificationId,
    });
  } catch (error) {
    logError("Error archiving notification", {
      scope: "services.notifications.archiveNotification",
      event,
      error,
    });
    return createErrorResponse(500, "others.internalError", event);
  }
}

module.exports = {
  listNotifications,
  createNotification,
  archiveNotification,
};
