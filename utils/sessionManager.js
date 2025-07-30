// Session management utilities for handling decryption errors
const { getTimestamp } = require('./logger');

// Track failed decryption attempts
const failedDecryptions = new Map();
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Track session errors per user
const sessionErrors = new Map();
const SESSION_ERROR_THRESHOLD = 5;

// Clean up old entries every hour
setInterval(() => {
    const hourAgo = Date.now() - 3600000;
    for (const [key, timestamp] of failedDecryptions.entries()) {
        if (timestamp < hourAgo) {
            failedDecryptions.delete(key);
        }
    }
    for (const [userId, errors] of sessionErrors.entries()) {
        const recentErrors = errors.filter(t => t > hourAgo);
        if (recentErrors.length === 0) {
            sessionErrors.delete(userId);
        } else {
            sessionErrors.set(userId, recentErrors);
        }
    }
}, 3600000);

// Track session error for a user
function trackSessionError(userId) {
    if (!sessionErrors.has(userId)) {
        sessionErrors.set(userId, []);
    }
    sessionErrors.get(userId).push(Date.now());
    
    // Check if user has too many errors
    const errors = sessionErrors.get(userId);
    if (errors.length >= SESSION_ERROR_THRESHOLD) {
        console.log(`⚠️ User ${userId} has ${errors.length} session errors - may need session reset`);
        return true; // Indicates problematic session
    }
    return false;
}

// Check if we should retry a failed message
function shouldRetryMessage(messageId, userId) {
    const key = `${messageId}_${userId}`;
    const attempts = failedDecryptions.get(key) || 0;
    
    if (attempts >= MAX_RETRIES) {
        return false;
    }
    
    failedDecryptions.set(key, attempts + 1);
    return true;
}

// Clear session errors for a user (after successful decryption)
function clearSessionErrors(userId) {
    sessionErrors.delete(userId);
    // Also clear failed decryptions for this user
    for (const [key] of failedDecryptions.entries()) {
        if (key.includes(userId)) {
            failedDecryptions.delete(key);
        }
    }
}

// Check if message might contain invite link (even if encrypted)
function mightContainInviteLink(msg) {
    // Check various message types that might contain links
    const messageTypes = [
        msg.message?.conversation,
        msg.message?.extendedTextMessage?.text,
        msg.message?.extendedTextMessage?.canonicalUrl,
        msg.message?.extendedTextMessage?.matchedText,
        msg.message?.imageMessage?.caption,
        msg.message?.videoMessage?.caption,
        msg.message?.documentMessage?.caption,
        msg.message?.buttonsMessage?.contentText,
        msg.message?.templateMessage?.hydratedTemplate?.hydratedContentText,
        msg.message?.listMessage?.description
    ];
    
    // Check if any field exists (might be encrypted)
    return messageTypes.some(field => field !== undefined);
}

// Get message text with fallback for encrypted messages
function extractMessageText(msg) {
    // Try all possible text locations
    return msg.message?.conversation || 
           msg.message?.extendedTextMessage?.text || 
           msg.message?.imageMessage?.caption ||
           msg.message?.videoMessage?.caption ||
           msg.message?.documentMessage?.caption ||
           msg.message?.buttonsMessage?.contentText ||
           msg.message?.templateMessage?.hydratedTemplate?.hydratedContentText ||
           msg.message?.listMessage?.description ||
           '';
}

// Handle session error with recovery
async function handleSessionError(sock, error, msg) {
    const userId = msg.key.participant || msg.key.remoteJid;
    const messageId = msg.key.id;
    
    console.log(`[${getTimestamp()}] 🔒 Session error for ${userId}: ${error.message}`);
    
    // Track the error
    const isProblematic = trackSessionError(userId);
    
    // Auto-reset session for users with excessive errors
    if (isProblematic) {
        console.log(`🔧 Attempting session reset for problematic user: ${userId}`);
        try {
            // Try to clear the specific user's session data
            if (sock.authState && sock.authState.keys) {
                const keys = sock.authState.keys;
                // Clear session data for this specific user
                if (keys.sessions && keys.sessions[userId]) {
                    delete keys.sessions[userId];
                    console.log(`✅ Cleared session data for ${userId}`);
                }
            }
        } catch (resetError) {
            console.error(`❌ Failed to reset session for ${userId}:`, resetError.message);
        }
    }
    
    // Check if we should retry
    if (shouldRetryMessage(messageId, userId)) {
        console.log(`🔄 Retrying message ${messageId} from ${userId}`);
        
        // For group messages with potential invite links, take immediate action
        if (msg.key.remoteJid.endsWith('@g.us') && isProblematic) {
            console.log(`⚠️ Suspicious activity from ${userId} - session errors + group message`);
            
            // Return a flag indicating potential security issue
            return {
                suspicious: true,
                userId: userId,
                groupId: msg.key.remoteJid,
                reason: 'Multiple session errors in group context'
            };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return { retry: true };
    }
    
    return { retry: false, suspicious: false };
}

module.exports = {
    trackSessionError,
    shouldRetryMessage,
    clearSessionErrors,
    mightContainInviteLink,
    extractMessageText,
    handleSessionError,
    sessionErrors,
    failedDecryptions
};