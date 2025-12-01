// utils/blacklistPendingRequests.js
// Store pending blacklist requests from alerts (message ID → phone number mapping)

const pendingBlacklistRequests = new Map();

/**
 * Store a pending blacklist request
 * @param {string} messageId - Alert message ID
 * @param {string} phoneNumber - User phone number
 * @param {string} userId - Full WhatsApp user ID
 * @param {string} reason - Violation type ('invite_link', 'kicked_by_admin')
 */
function storePendingRequest(messageId, phoneNumber, userId, reason) {
    pendingBlacklistRequests.set(messageId, {
        phoneNumber,
        userId,
        reason,
        timestamp: Date.now()
    });

    // Auto-expire after 24 hours
    setTimeout(() => {
        pendingBlacklistRequests.delete(messageId);
    }, 24 * 60 * 60 * 1000);
}

/**
 * Get pending request by message ID
 * @param {string} messageId - Alert message ID
 * @returns {Object|null} Request data or null
 */
function getPendingRequest(messageId) {
    return pendingBlacklistRequests.get(messageId) || null;
}

/**
 * Remove pending request after processing
 * @param {string} messageId - Alert message ID
 */
function removePendingRequest(messageId) {
    pendingBlacklistRequests.delete(messageId);
}

/**
 * Get all pending requests (for debugging)
 * @returns {Array} Array of pending requests
 */
function getAllPendingRequests() {
    return Array.from(pendingBlacklistRequests.entries()).map(([messageId, data]) => ({
        messageId,
        ...data
    }));
}

module.exports = {
    storePendingRequest,
    getPendingRequest,
    removePendingRequest,
    getAllPendingRequests
};
