const { getTimestamp } = require('./logger');

/**
 * Robust kick function with retry logic and timeout handling for large groups
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} groupId - Group JID
 * @param {string} userId - User JID to kick
 * @param {number} maxRetries - Maximum number of retry attempts (default 3)
 * @param {number} timeout - Timeout for each kick attempt in ms (default 10000)
 * @returns {Promise<{success: boolean, error?: Error, attempts: number}>}
 */
async function robustKick(sock, groupId, userId, maxRetries = 3, timeout = 10000) {
    let kickError = null;
    let attempts = 0;
    const retryDelay = 2000; // 2 seconds between retries
    
    console.log(`[${getTimestamp()}] 🦵 Starting robust kick for user ${userId} in group ${groupId}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attempts = attempt;
        
        try {
            console.log(`[${getTimestamp()}] 🔄 Kick attempt ${attempt}/${maxRetries}...`);
            
            // Create kick promise with timeout
            const kickPromise = sock.groupParticipantsUpdate(groupId, [userId], 'remove');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Kick operation timed out after ${timeout/1000} seconds`)), timeout)
            );
            
            // Race between kick and timeout
            await Promise.race([kickPromise, timeoutPromise]);
            
            console.log(`[${getTimestamp()}] ✅ Successfully kicked user on attempt ${attempt}`);
            return { success: true, attempts };
            
        } catch (error) {
            kickError = error;
            console.error(`[${getTimestamp()}] ❌ Kick attempt ${attempt} failed:`, error.message);
            
            // Check for specific error types
            if (error.message?.includes('not in group') || 
                error.message?.includes('not a participant') ||
                error.message?.includes('401')) {
                console.log(`[${getTimestamp()}] ℹ️ User not in group or already removed`);
                return { success: true, attempts, alreadyRemoved: true };
            }
            
            if (error.message?.includes('403') || 
                error.message?.includes('admin_required') ||
                error.message?.includes('not admin')) {
                console.error(`[${getTimestamp()}] 🚫 Bot lacks admin privileges`);
                return { success: false, error: new Error('Bot needs admin privileges'), attempts };
            }
            
            // If not the last attempt, wait and check if user is still in group
            if (attempt < maxRetries) {
                console.log(`[${getTimestamp()}] ⏳ Waiting ${retryDelay/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Verify if user is still in group before retrying
                try {
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const stillInGroup = groupMetadata.participants.some(p => p.id === userId);
                    
                    if (!stillInGroup) {
                        console.log(`[${getTimestamp()}] ✅ User no longer in group (removed successfully)`);
                        return { success: true, attempts, verifiedRemoval: true };
                    }
                    
                    console.log(`[${getTimestamp()}] ℹ️ User still in group, continuing with retry...`);
                } catch (metadataError) {
                    console.error(`[${getTimestamp()}] ⚠️ Could not verify group membership:`, metadataError.message);
                    // Continue with retry anyway
                }
                
                // Exponential backoff for large groups
                if (attempt === 2 && timeout < 20000) {
                    timeout = 20000; // Increase timeout for third attempt
                    console.log(`[${getTimestamp()}] ⏱️ Increased timeout to ${timeout/1000} seconds for large group`);
                }
            }
        }
    }
    
    console.error(`[${getTimestamp()}] ❌ Failed to kick user after ${maxRetries} attempts`);
    return { success: false, error: kickError, attempts };
}

/**
 * Batch kick multiple users with rate limiting
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} groupId - Group JID
 * @param {Array<string>} userIds - Array of user JIDs to kick
 * @param {number} delayBetween - Delay between kicks in ms (default 500)
 * @returns {Promise<{successful: Array, failed: Array}>}
 */
async function batchKick(sock, groupId, userIds, delayBetween = 500) {
    const successful = [];
    const failed = [];
    
    console.log(`[${getTimestamp()}] 🎯 Starting batch kick for ${userIds.length} users`);
    
    for (const userId of userIds) {
        const result = await robustKick(sock, groupId, userId);
        
        if (result.success) {
            successful.push(userId);
        } else {
            failed.push({ userId, error: result.error?.message });
        }
        
        // Rate limiting delay
        if (userIds.indexOf(userId) < userIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
    }
    
    console.log(`[${getTimestamp()}] 📊 Batch kick complete: ${successful.length} successful, ${failed.length} failed`);
    
    return { successful, failed };
}

module.exports = {
    robustKick,
    batchKick
};