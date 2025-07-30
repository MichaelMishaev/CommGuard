// Correct bot admin detection for Baileys
const { getTimestamp } = require('./logger');

/**
 * Check if bot is admin in a group
 * @param {Object} sock - Baileys socket instance
 * @param {string} groupId - Group ID to check
 * @returns {Promise<boolean>} - True if bot is admin
 */
async function isBotAdmin(sock, groupId) {
    try {
        // Check if we should bypass the admin check
        const config = require('../config');
        if (config.FEATURES.BYPASS_BOT_ADMIN_CHECK) {
            console.log(`[${getTimestamp()}] ⚡ Bot admin check bypassed (config setting)`);
            return true; // Assume bot is admin
        }
        
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        
        // Get bot's ID - this is the correct way in Baileys
        const botId = sock.user.id;
        
        console.log(`[${getTimestamp()}] 🔍 Checking bot admin status:`);
        console.log(`   Bot ID: ${botId}`);
        console.log(`   Group: ${groupMetadata.subject}`);
        
        // Find bot in participants list - try multiple formats
        const botPhone = botId.split(':')[0].split('@')[0];
        
        // First, let's log what we're looking for
        console.log(`   Looking for bot with phone: ${botPhone}`);
        
        // IMPORTANT: For some bots, WhatsApp assigns a completely different LID
        // that has no relation to the phone number. In this case, we need to
        // check if the bot name matches or use the bypass feature.
        
        const botParticipant = groupMetadata.participants.find(p => {
            // Direct ID match
            if (p.id === botId) return true;
            
            // Extract phone from participant ID
            const participantPhone = p.id.split(':')[0].split('@')[0];
            
            // Phone number match
            if (participantPhone === botPhone) return true;
            
            // Check if participant ID contains our bot phone number
            if (p.id.includes(botPhone)) return true;
            
            // Alternative formats
            if (p.id === `${botPhone}@s.whatsapp.net`) return true;
            if (p.id === `${botPhone}@c.us`) return true;
            if (p.id === `${botPhone}@lid`) return true;
            
            // For LID format, the phone might be embedded differently
            // Sometimes WhatsApp uses a different ID format for bots
            // Let's check if the bot is the one who added participants
            if (p.id.startsWith(botPhone)) return true;
            
            // SPECIAL CASE: Known bot LIDs (add your bot's LID here)
            const knownBotLids = [
                '171012763213843@lid',  // Your bot's actual LID from debug
                // Add more known bot LIDs here if needed
            ];
            if (knownBotLids.includes(p.id)) {
                console.log(`   Found bot using known LID: ${p.id}`);
                return true;
            }
            
            return false;
        });
        
        if (!botParticipant) {
            console.log('❌ Bot not found in participants list');
            console.log(`   Looking for bot phone: ${botPhone}`);
            
            // Let's check if the bot might be in the list with a different format
            // Sometimes bots are added with their phone number as the LID
            const possibleBotLid = groupMetadata.participants.find(p => {
                const pId = p.id.split('@')[0];
                // Check if this could be our bot by checking admin status and reasonable ID
                return (p.admin === 'admin' || p.admin === 'superadmin') && 
                       (pId.length >= 10 && pId.length <= 15); // Phone numbers are typically 10-15 digits
            });
            
            if (possibleBotLid) {
                console.log('🤔 Found a possible bot candidate:', {
                    id: possibleBotLid.id,
                    admin: possibleBotLid.admin
                });
                console.log('⚠️ Bot may be using a different ID format. Please verify the bot account.');
            }
            
            // Only show first 10 participants to avoid spam
            console.log('📋 First 10 participants:', groupMetadata.participants.slice(0, 10).map(p => ({
                id: p.id,
                phone: p.id.split(':')[0].split('@')[0],
                admin: p.admin
            })));
            console.log(`   Total participants: ${groupMetadata.participants.length}`);
            return false;
        }
        
        // Check admin status - correct field names for Baileys
        const isAdmin = botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin';
        
        console.log(`   Bot participant found:`, {
            id: botParticipant.id,
            admin: botParticipant.admin,
            isAdmin: isAdmin
        });
        
        return isAdmin;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error checking bot admin status:`, error);
        return false;
    }
}

/**
 * Get detailed bot status in group
 * @param {Object} sock - Baileys socket instance
 * @param {string} groupId - Group ID to check
 * @returns {Promise<Object>} - Detailed status object
 */
async function getBotGroupStatus(sock, groupId) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const botId = sock.user.id;
        
        const botParticipant = groupMetadata.participants.find(p => p.id === botId);
        
        return {
            botId: botId,
            groupName: groupMetadata.subject,
            groupId: groupId,
            isInGroup: !!botParticipant,
            adminStatus: botParticipant?.admin || 'not_member',
            isAdmin: botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin',
            participantCount: groupMetadata.participants.length,
            adminCount: groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length
        };
    } catch (error) {
        return {
            error: error.message,
            botId: sock.user.id,
            groupId: groupId
        };
    }
}

/**
 * Debug function to show all bot ID formats
 * @param {Object} sock - Baileys socket instance
 */
function debugBotId(sock) {
    const botId = sock.user.id;
    const phone = sock.user.id.split(':')[0];
    
    console.log(`[${getTimestamp()}] 🤖 Bot ID Debug:`);
    console.log(`   Full ID: ${botId}`);
    console.log(`   Phone part: ${phone}`);
    console.log(`   Platform: ${sock.user.platform || 'Unknown'}`);
    console.log(`   Name: ${sock.user.name || 'Unknown'}`);
    
    return {
        fullId: botId,
        phone: phone,
        possibleFormats: [
            botId,
            `${phone}@s.whatsapp.net`,
            `${phone}@c.us`,
            `${phone}@lid`
        ]
    };
}

module.exports = {
    isBotAdmin,
    getBotGroupStatus,
    debugBotId
};