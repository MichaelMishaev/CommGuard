const { getTimestamp } = require('../utils/logger');

// Cache for active unblacklist requests
const requestCache = new Map();
let cacheLoaded = false;

/**
 * Unblacklist Request Service
 * Manages self-service unblacklist requests with 24-hour cooldowns and admin approval
 * Memory-only storage
 */

// Load unblacklist requests into cache
async function loadRequestCache() {
    // Memory-only mode
    cacheLoaded = true;
    console.log(`💾 Unblacklist request service using memory-only cache - ${requestCache.size} requests`);
}

// Normalize user ID for consistent handling
function normalizeUserId(userId) {
    if (typeof userId !== 'string') {
        console.error('❌ normalizeUserId called with non-string userId:', userId);
        return '';
    }
    return userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
}

// Check if user can make a new request (24-hour cooldown)
async function canMakeRequest(userId) {
    const normalizedId = normalizeUserId(userId);

    // Check cache
    if (cacheLoaded && requestCache.has(normalizedId)) {
        const request = requestCache.get(normalizedId);
        const now = Date.now();
        const canRequestAgain = new Date(request.canRequestAgain).getTime();

        if (now < canRequestAgain) {
            const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
            return {
                canRequest: false,
                hoursLeft: hoursLeft,
                reason: `You can request again in ${hoursLeft} hours.`
            };
        }
    }

    return { canRequest: true };
}

// Create a new unblacklist request
async function createRequest(userId) {
    const normalizedId = normalizeUserId(userId);
    const now = new Date();
    const canRequestAgain = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now

    const requestData = {
        userId: normalizedId,
        originalId: userId,
        requestedAt: now.toISOString(),
        status: 'pending',
        canRequestAgain: canRequestAgain.toISOString(),
        requestCount: 1,
        adminResponse: null,
        respondedAt: null,
        respondedBy: null
    };

    // Check if this is a repeat request
    if (cacheLoaded && requestCache.has(normalizedId)) {
        const existingRequest = requestCache.get(normalizedId);
        requestData.requestCount = (existingRequest.requestCount || 0) + 1;
    }

    // Update cache
    requestCache.set(normalizedId, requestData);

    console.log(`✅ Created unblacklist request for ${normalizedId} (attempt #${requestData.requestCount})`);
    return true;
}

// Get pending requests for admin review
async function getPendingRequests() {
    const pending = [];
    for (const [userId, request] of requestCache.entries()) {
        if (request.status === 'pending') {
            pending.push({ userId, ...request });
        }
    }
    return pending;
}

// Process admin response (approve or deny)
async function processAdminResponse(userId, decision, adminPhone) {
    const normalizedId = normalizeUserId(userId);
    const now = new Date();

    const updateData = {
        status: decision === 'yes' ? 'approved' : 'denied',
        adminResponse: decision,
        respondedAt: now.toISOString(),
        respondedBy: adminPhone
    };

    // Update cache
    if (requestCache.has(normalizedId)) {
        const existing = requestCache.get(normalizedId);
        requestCache.set(normalizedId, { ...existing, ...updateData });
    }

    console.log(`✅ Processed admin response for ${normalizedId}: ${decision}`);
    return true;
}

// Get request details for a specific user
async function getRequestDetails(userId) {
    const normalizedId = normalizeUserId(userId);

    if (cacheLoaded && requestCache.has(normalizedId)) {
        return requestCache.get(normalizedId);
    }

    return null;
}

// Clean up old resolved requests (for maintenance)
async function cleanupOldRequests(daysOld = 30) {
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    let cleaned = 0;

    for (const [userId, request] of requestCache.entries()) {
        if (request.respondedAt) {
            const respondedDate = new Date(request.respondedAt);
            if (respondedDate < cutoffDate) {
                requestCache.delete(userId);
                cleaned++;
            }
        }
    }

    if (cleaned > 0) {
        console.log(`✅ Cleaned up ${cleaned} old unblacklist requests`);
    }
}

module.exports = {
    loadRequestCache,
    canMakeRequest,
    createRequest,
    getPendingRequests,
    processAdminResponse,
    getRequestDetails,
    cleanupOldRequests,
    normalizeUserId
};
