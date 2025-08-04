const db = require('../firebaseConfig.js');
const { getTimestamp } = require('../utils/logger');

// Cache for active unblacklist requests
const requestCache = new Map();
let cacheLoaded = false;

/**
 * Unblacklist Request Service
 * Manages self-service unblacklist requests with 24-hour cooldowns and admin approval
 */

// Load unblacklist requests from Firebase into cache
async function loadRequestCache() {
    if (!db || db.collection === undefined) {
        console.warn('⚠️ Firebase not available - unblacklist request features disabled');
        return;
    }

    try {
        const snapshot = await db.collection('unblacklist_requests').get();
        requestCache.clear();
        
        snapshot.forEach(doc => {
            requestCache.set(doc.id, doc.data());
        });
        
        cacheLoaded = true;
        console.log(`✅ Loaded ${requestCache.size} unblacklist requests into cache`);
    } catch (error) {
        console.error('❌ Error loading unblacklist request cache:', error.message);
    }
}

// Normalize user ID for consistent handling
function normalizeUserId(userId) {
    return userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
}

// Check if user can make a new request (24-hour cooldown)
async function canMakeRequest(userId) {
    const normalizedId = normalizeUserId(userId);
    
    // All users now follow the same cooldown rules - no special privileges
    
    // Check cache first
    if (cacheLoaded && requestCache.has(normalizedId)) {
        const request = requestCache.get(normalizedId);
        const now = Date.now();
        const canRequestAgain = new Date(request.canRequestAgain).getTime();
        
        if (now < canRequestAgain) {
            const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
            return {
                canRequest: false,
                hoursLeft: hoursLeft,
                reason: `⏰ You can request again in ${hoursLeft} hours.\n\n⏰ אתה יכול לבקש שוב בעוד ${hoursLeft} שעות.`
            };
        }
    }
    
    // Fallback to Firebase if cache not loaded
    if (!db || db.collection === undefined) {
        return { canRequest: true }; // Allow if Firebase unavailable
    }
    
    try {
        const doc = await db.collection('unblacklist_requests').doc(normalizedId).get();
        if (doc.exists) {
            const data = doc.data();
            const now = Date.now();
            const canRequestAgain = new Date(data.canRequestAgain).getTime();
            
            if (now < canRequestAgain) {
                const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
                return {
                    canRequest: false,
                    hoursLeft: hoursLeft,
                    reason: `⏰ You can request again in ${hoursLeft} hours.\n\n⏰ אתה יכול לבקש שוב בעוד ${hoursLeft} שעות.`
                };
            }
        }
        
        return { canRequest: true };
    } catch (error) {
        console.error('❌ Error checking request eligibility:', error.message);
        return { canRequest: true }; // Allow on error
    }
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
    
    // Save to Firebase if available
    if (!db || db.collection === undefined) {
        console.warn('⚠️ Firebase not available - request created in memory only');
        return true;
    }
    
    try {
        await db.collection('unblacklist_requests').doc(normalizedId).set(requestData);
        console.log(`✅ Created unblacklist request for ${normalizedId} (attempt #${requestData.requestCount})`);
        return true;
    } catch (error) {
        console.error('❌ Error creating unblacklist request:', error.message);
        return false;
    }
}

// Get pending requests for admin review
async function getPendingRequests() {
    if (!db || db.collection === undefined) {
        // Return from cache if Firebase unavailable
        const pending = [];
        for (const [userId, request] of requestCache.entries()) {
            if (request.status === 'pending') {
                pending.push({ userId, ...request });
            }
        }
        return pending;
    }
    
    try {
        const snapshot = await db.collection('unblacklist_requests')
            .where('status', '==', 'pending')
            .orderBy('requestedAt', 'desc')
            .get();
        
        const pending = [];
        snapshot.forEach(doc => {
            pending.push({ userId: doc.id, ...doc.data() });
        });
        
        return pending;
    } catch (error) {
        console.error('❌ Error fetching pending requests:', error.message);
        return [];
    }
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
    
    // Update Firebase if available
    if (!db || db.collection === undefined) {
        console.warn('⚠️ Firebase not available - response recorded in memory only');
        return true;
    }
    
    try {
        await db.collection('unblacklist_requests').doc(normalizedId).update(updateData);
        console.log(`✅ Processed admin response for ${normalizedId}: ${decision}`);
        return true;
    } catch (error) {
        console.error('❌ Error processing admin response:', error.message);
        return false;
    }
}

// Get request details for a specific user
async function getRequestDetails(userId) {
    const normalizedId = normalizeUserId(userId);
    
    // Check cache first
    if (cacheLoaded && requestCache.has(normalizedId)) {
        return requestCache.get(normalizedId);
    }
    
    // Fallback to Firebase
    if (!db || db.collection === undefined) {
        return null;
    }
    
    try {
        const doc = await db.collection('unblacklist_requests').doc(normalizedId).get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error('❌ Error fetching request details:', error.message);
        return null;
    }
}

// Clean up old resolved requests (for maintenance)
async function cleanupOldRequests(daysOld = 30) {
    if (!db || db.collection === undefined) {
        console.warn('⚠️ Firebase not available - cleanup skipped');
        return;
    }
    
    try {
        const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
        const snapshot = await db.collection('unblacklist_requests')
            .where('respondedAt', '<', cutoffDate.toISOString())
            .get();
        
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`✅ Cleaned up ${snapshot.size} old unblacklist requests`);
    } catch (error) {
        console.error('❌ Error cleaning up old requests:', error.message);
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