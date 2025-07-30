// jidUtils.js
// Utility functions for working with WhatsApp JIDs and the new @lid scheme

/**
 * Normalize any user reference (string, Contact, Participant, etc.) to a JID.
 *
 *
 * Rules:
 * 1. If the input already contains an "@" (e.g. "123456789@c.us" or "ABCDEF@lid"), it is
 *    assumed to be a JID. We strip any resource suffix (the part after a colon, if present)
 *    and return the lowercase form.
 * 2. If the input is a plain phone-number string (with or without +/spaces/dashes/RTL marks),
 *    we keep only digits and convert to the legacy `@c.us` JID format so that it can still
 *    match contacts that haven't migrated yet.
 * 3. If the input is a Contact / Participant / Message object from whatsapp-web.js, we try to
 *    read the `_serialized` field (e.g. contact.id._serialized) or the object itself if it
 *    already looks like a JID.
 *
 * This helper guarantees that the returned value can safely be used as Firestore document IDs
 * and map keys throughout the moderation logic.
 *
 * @param {string|object} ref – Anything that might represent a user.
 * @returns {string}        – Normalised JID like `123456789@c.us` or `ABCDEF@lid`.
 */
function jidKey(ref) {
  if (!ref) return '';

  // --- 1) If a string was provided -----------------------------------------
  if (typeof ref === 'string') {
    // Strip any resource part (WhatsApp sometimes appends ":16" etc.)
    let s = ref.split(':')[0].trim();

    // Has explicit domain (c.us / lid) → already a JID
    if (s.includes('@')) {
      return s.toLowerCase();
    }

    // Otherwise treat as phone number → keep digits only and convert
    const digits = s.replace(/[^0-9]/g, '');
    if (!digits) {
      // If no digits found but string exists, treat as potential username
      if (s.length > 0) {
        return `${s}@c.us`.toLowerCase();
      }
      return '';
    }
    return `${digits}@c.us`.toLowerCase();
  }

  // --- 2) If a whatsapp-web.js Contact / Participant -----------------------
  if (typeof ref === 'object') {
    // Most objects expose id._serialized
    if (ref.id?._serialized) {
      return ref.id._serialized.toLowerCase();
    }
    // Some objects ARE the id instance itself
    if (ref._serialized) {
      return ref._serialized.toLowerCase();
    }
    // Fallback: build from user/server keys if present
    if (ref.user && ref.server) {
      return `${ref.user}@${ref.server}`.toLowerCase();
    }
  }

  // If all else fails, return empty string so callers can handle gracefully
  return '';
}

module.exports = { jidKey }; 