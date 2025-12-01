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

/**
 * Decode LID (Link ID) to real phone number using Baileys signal repository.
 *
 * @param {object} sock - The Baileys socket instance
 * @param {string} userId - Full user ID like "77709346664559@lid"
 * @returns {Promise<string|null>} - Real phone number or null if decoding fails
 */
async function decodeLIDToPhone(sock, userId) {
  if (!userId || !userId.endsWith('@lid')) {
    return null; // Not a LID format
  }

  const lidNumber = userId.split('@')[0];

  // Try using Baileys API
  if (sock?.signalRepository?.lidMapping) {
    try {
      const decoded = await sock.signalRepository.lidMapping.getPNForLID(lidNumber);
      if (decoded) {
        console.log(`✅ Decoded LID ${lidNumber} → ${decoded}`);
        return decoded;
      }
    } catch (error) {
      console.log(`⚠️ Failed to decode LID via API: ${lidNumber}`, error.message);
    }
  }

  // Fallback: Try reading from file system
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'baileys_auth_info', `lid-mapping-${lidNumber}_reverse.json`);

    if (fs.existsSync(filePath)) {
      const phoneData = fs.readFileSync(filePath, 'utf8');
      const phone = phoneData.replace(/['"]/g, '').trim();
      if (phone) {
        console.log(`✅ Decoded LID ${lidNumber} → ${phone} (from file)`);
        return phone;
      }
    }
  } catch (error) {
    console.log(`⚠️ Failed to decode LID via file: ${lidNumber}`, error.message);
  }

  console.log(`❌ Could not decode LID: ${lidNumber} (no mapping found)`);
  return null;
}

module.exports = { jidKey, decodeLIDToPhone }; 