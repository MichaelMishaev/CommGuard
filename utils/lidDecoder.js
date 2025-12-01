// LID Decoder Utility
// Decodes WhatsApp LID (Link ID) to actual phone number

const fs = require('fs');
const path = require('path');

/**
 * Decode LID to phone number from mapping files
 * @param {string} lid - WhatsApp LID
 * @returns {string|null} Phone number or null
 */
function decodeLID(lid) {
    try {
        const mappingFile = path.join(__dirname, '../baileys_auth_info', `lid-mapping-${lid}_reverse.json`);
        if (fs.existsSync(mappingFile)) {
            const phoneNumber = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
            return phoneNumber;
        }
    } catch (error) {
        // LID mapping not found
    }
    return null;
}

/**
 * Extract real phone number from WhatsApp ID (handles both regular and LID format)
 * @param {string} whatsappId - WhatsApp ID (e.g., "972544345287@s.whatsapp.net" or "171012763213843@lid")
 * @returns {string} Phone number
 */
function extractPhoneNumber(whatsappId) {
    if (!whatsappId) return null;

    const rawId = whatsappId.split('@')[0];
    const isLID = whatsappId.endsWith('@lid');

    if (isLID) {
        // Try to decode LID to phone number
        const decodedPhone = decodeLID(rawId);
        if (decodedPhone) {
            return decodedPhone;
        }
        // If can't decode, return the LID itself
        return rawId;
    }

    // Regular format - just return the phone number part
    return rawId;
}

module.exports = {
    decodeLID,
    extractPhoneNumber
};
