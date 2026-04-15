/**
 * Removes internal/sensitive fields from a PetLost record before API response.
 *
 * @param {Record<string, any>|null|undefined} pet
 * @returns {Record<string, any>|null|undefined}
 */
function sanitizePetLost(pet) {
  if (!pet) return pet;
  const raw = typeof pet.toObject === "function" ? pet.toObject() : pet;
  const { __v, ...safe } = raw;
  return safe;
}

/**
 * Removes internal/sensitive fields from a PetFound record before API response.
 *
 * @param {Record<string, any>|null|undefined} pet
 * @returns {Record<string, any>|null|undefined}
 */
function sanitizePetFound(pet) {
  if (!pet) return pet;
  const raw = typeof pet.toObject === "function" ? pet.toObject() : pet;
  const { __v, ...safe } = raw;
  return safe;
}

/**
 * Removes internal/sensitive fields from a Notification record before API response.
 *
 * @param {Record<string, any>|null|undefined} notification
 * @returns {Record<string, any>|null|undefined}
 */
function sanitizeNotification(notification) {
  if (!notification) return notification;
  const raw = typeof notification.toObject === "function" ? notification.toObject() : notification;
  const { __v, ...safe } = raw;
  return safe;
}

module.exports = {
  sanitizePetLost,
  sanitizePetFound,
  sanitizeNotification,
};
