// Session management utilities for handling decryption errors
const { getTimestamp, advancedLogger } = require('./logger');

// Track failed decryption attempts
const failedDecryptions = new Map();
const MAX_RETRIES = 2; // Reduced from 3 to 2
const RETRY_DELAY = 500; // Reduced from 2000ms to 500ms

// Track session errors per user
const sessionErrors = new Map();
const SESSION_ERROR_THRESHOLD = 3; // Reduced from 5 to 3

// Startup session optimization
const STARTUP_TIMEOUT = 15000; // 15 seconds max for session issues during startup
const PROBLEMATIC_USERS = new Set(); // Track users to skip during startup
const LID_STARTUP_BLOCK = true; // Emergency: Block ALL @lid users during startup to prevent delays

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
function trackSessionError(userId, isStartup = false) {
    if (!sessionErrors.has(userId)) {
        sessionErrors.set(userId, []);
    }
    sessionErrors.get(userId).push(Date.now());
    
    // Check if user has too many errors
    const errors = sessionErrors.get(userId);
    const threshold = isStartup ? 1 : SESSION_ERROR_THRESHOLD; // More aggressive during startup
    
    if (errors.length >= threshold) {
        console.log(`⚠️ User ${userId} has ${errors.length} session errors - ${isStartup ? 'marking as problematic for startup' : 'may need session reset'}`);
        if (isStartup) {
            PROBLEMATIC_USERS.add(userId);
        }
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
    // Debug: Log full message structure for text messages to understand new WhatsApp format
    if (msg.message && (msg.message.conversation || msg.message.extendedTextMessage)) {
        console.log(`[DEBUG] TEXT MESSAGE STRUCTURE:`, JSON.stringify(msg.message, null, 2));
    }

    // Try all possible text locations
    const text = msg.message?.conversation ||
           msg.message?.extendedTextMessage?.text ||
           msg.message?.imageMessage?.caption ||
           msg.message?.videoMessage?.caption ||
           msg.message?.documentMessage?.caption ||
           msg.message?.buttonsMessage?.contentText ||
           msg.message?.templateMessage?.hydratedTemplate?.hydratedContentText ||
           msg.message?.listMessage?.description ||
           msg.message?.ephemeralMessage?.message?.conversation ||
           msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
           msg.message?.viewOnceMessage?.message?.imageMessage?.caption ||
           msg.message?.viewOnceMessage?.message?.videoMessage?.caption ||
           msg.message?.viewOnceMessageV2?.message?.imageMessage?.caption ||
           msg.message?.viewOnceMessageV2?.message?.videoMessage?.caption ||
           msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
           msg.message?.editedMessage?.message?.protocolMessage?.editedMessage?.conversation ||
           msg.message?.editedMessage?.message?.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
           '';

    // Enhanced debug logging - log ANY message that might contain text but we can't extract
    if (!text && msg.message) {
        const messageTypes = Object.keys(msg.message);

        // Check if message contains WhatsApp links even if we can't extract text normally
        const messageJson = JSON.stringify(msg.message);
        if (messageJson.includes('whatsapp.com') || messageJson.includes('chat.whatsapp')) {
            console.log(`[DEBUG] 🚨 INVITE LINK IN RAW MESSAGE BUT TEXT NOT EXTRACTED:`, JSON.stringify(msg.message, null, 2));
        }

        // Only log if this looks like it should have text content
        if (messageTypes.includes('messageContextInfo') && messageTypes.length > 1) {
            console.log(`[DEBUG] POTENTIAL TEXT MESSAGE NOT EXTRACTED:`, JSON.stringify(msg.message, null, 2));
        }

        // Filter out metadata types that don't contain text
        const contentTypes = messageTypes.filter(type =>
            !['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'].includes(type)
        );
        if (contentTypes.length > 0) {
            console.log(`[DEBUG] Unhandled message type: ${contentTypes.join(', ')}`);
        }
    }

    return text;
}

// NEW: Check if a sticker/reaction message is a command reply
function checkStickerCommand(msg) {
    // Check if this is a sticker with context info (reply)
    if (msg.message?.stickerMessage && msg.message?.messageContextInfo) {
        console.log(`[DEBUG] STICKER WITH CONTEXT DETECTED - checking for command intent`);

        // Return context info if it exists - indicating this is a reply
        return {
            isCommand: true,
            type: 'sticker_reply',
            contextInfo: msg.message.messageContextInfo,
            participant: msg.message.messageContextInfo.participant,
            stanzaId: msg.message.messageContextInfo.stanzaId || msg.message.messageContextInfo.quotedMessageId
        };
    }

    // Check for reaction messages (some users might react with specific emojis as commands)
    if (msg.message?.reactionMessage) {
        console.log(`[DEBUG] REACTION MESSAGE DETECTED - text: "${msg.message.reactionMessage.text}"`);

        // Check for kick-related reactions
        const kickEmojis = ['❌', '🚫', '👎', '🔴', '⛔', '🗑️', '💀'];
        if (kickEmojis.includes(msg.message.reactionMessage.text)) {
            return {
                isCommand: true,
                type: 'reaction_kick',
                emoji: msg.message.reactionMessage.text,
                targetKey: msg.message.reactionMessage.key
            };
        }
    }

    return { isCommand: false };
}

// Check if user should be skipped during startup
function shouldSkipUser(userId, isStartup = false) {
    // Emergency: Block ALL @lid users during startup to prevent massive decryption delays
    if (LID_STARTUP_BLOCK && isStartup && userId && userId.includes('@lid')) {
        console.log(`🚫 Emergency blocking @lid user during startup: ${userId.substring(0, 20)}...`);
        return true;
    }
    
    return PROBLEMATIC_USERS.has(userId);
}

// Clear problematic users after successful startup
function clearProblematicUsers() {
    const count = PROBLEMATIC_USERS.size;
    PROBLEMATIC_USERS.clear();
    if (count > 0) {
        console.log(`[${getTimestamp()}] 🧹 Cleared ${count} problematic users from startup blacklist`);
    }
}

// Handle session error with fast recovery
async function handleSessionError(sock, error, msg, isStartup = false) {
    const userId = msg.key.participant || msg.key.remoteJid;
    const messageId = msg.key.id;
    
    // Skip @lid users during startup - they're problematic
    if (isStartup && userId && userId.includes('@lid')) {
        return { skip: true, userId: userId };
    }
    
    // Log session error with advanced logger
    advancedLogger.logSessionError(error, {
        userId: userId,
        messageId: messageId,
        groupId: msg.key.remoteJid?.endsWith('@g.us') ? msg.key.remoteJid : null,
        isStartup: isStartup
    });
    
    
    // Track the error
    const isProblematic = trackSessionError(userId, isStartup);
    
    // During startup, skip problematic users immediately
    if (isStartup && isProblematic) {
        console.log(`🚫 Skipping problematic user during startup: ${userId}`);
        return { skip: true, userId: userId };
    }
    
    // Auto-reset session for users with excessive errors
    if (isProblematic && !isStartup) {
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
    
    // Check if we should retry (no retries during startup)
    if (!isStartup && shouldRetryMessage(messageId, userId)) {
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
        
        // Wait before retry (shorter delay)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return { retry: true };
    }
    
    return { retry: false, suspicious: false, skip: isStartup };
}

module.exports = {
    trackSessionError,
    shouldRetryMessage,
    clearSessionErrors,
    mightContainInviteLink,
    extractMessageText,
    checkStickerCommand,
    handleSessionError,
    shouldSkipUser,
    clearProblematicUsers,
    sessionErrors,
    failedDecryptions,
    PROBLEMATIC_USERS,
    STARTUP_TIMEOUT
};