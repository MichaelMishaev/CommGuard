const config = require('../config');
const { getTimestamp } = require('./logger');

/**
 * Alert Service - Send notifications to alert phone
 */

function formatPhoneForAlert(phone) {
    return `${config.ALERT_PHONE}@s.whatsapp.net`;
}

async function sendAlert(sock, message) {
    if (!sock || !config.ALERT_PHONE) {
        console.log(`[${getTimestamp()}] ⚠️ Alert service not available - missing sock or alert phone`);
        return false;
    }

    try {
        const alertJid = formatPhoneForAlert(config.ALERT_PHONE);
        await sock.sendMessage(alertJid, { text: message });
        console.log(`[${getTimestamp()}] 🚨 Alert sent to ${config.ALERT_PHONE}`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to send alert:`, error.message);
        return false;
    }
}

async function sendKickAlert(sock, { userPhone, userName, groupName, groupId, reason, additionalInfo = '', spamLink = '', groupInviteLink = '', userId = '' }) {
    // Get group invite link if not provided
    if (!groupInviteLink || groupInviteLink === 'N/A') {
        try {
            const inviteCode = await sock.groupInviteCode(groupId);
            groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        } catch (err) {
            groupInviteLink = 'N/A';
        }
    }
    const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Check if LID format
    const isLidFormat = userId && userId.endsWith('@lid');
    const phoneDisplay = isLidFormat ? `${userPhone} (LID - Encrypted ID)` : userPhone;

    let alertTitle = '🚨 WhatsApp Invite Spam - IMMEDIATE ACTION';
    let kickedUserJid = userId || `${userPhone}@s.whatsapp.net`;
    
    // For invite link spam, use the specific format from screenshot
    if (reason === 'invite_link') {
        const alertMessage =
            `${alertTitle}\n\n` +
            `👤 User: ${kickedUserJid}\n` +
            `📍 Group: ${groupName || 'Unknown Group'}\n` +
            `🔗 Group URL: ${groupInviteLink || 'N/A'}\n` +
            `⏰ Time: ${timestamp.replace(/\//g, '/').replace(',', ',')}\n` +
            `👢 Kicked: ${kickedUserJid}\n` +
            `📞 Phone: ${phoneDisplay}\n` +
            `🗃️ Blacklisted: ${userPhone}\n` +
            `📧 Spam Link Sent: ${spamLink || 'N/A'}\n` +
            `🚫 User was removed and blacklisted.\n\n` +
            `🔄 To unblacklist this user, copy the command below:`;

        // Send the main alert
        await sendAlert(sock, alertMessage);

        // Send the unblacklist command as a separate message
        const unblacklistCommand = `#unblacklist ${userPhone}`;
        await sendAlert(sock, unblacklistCommand);

        return true;
    }

    // For other reasons, use a similar detailed format
    let reasonTitle = '';
    let reasonEmoji = '👢';
    
    switch (reason) {
        case 'muted_excessive':
            reasonTitle = '🔇 Muted User Excessive Messages - ACTION TAKEN';
            reasonEmoji = '🔇';
            break;
        case 'blacklisted':
            reasonTitle = '🚫 Blacklisted User Auto-Kick - ACTION TAKEN';
            reasonEmoji = '🚫';
            break;
        case 'country_code':
            reasonTitle = '🌍 Country Code Restriction - ACTION TAKEN';
            reasonEmoji = '🌍';
            break;
        case 'admin_command':
            reasonTitle = '👮‍♂️ Admin Command Execution - ACTION TAKEN';
            reasonEmoji = '👮‍♂️';
            break;
        default:
            reasonTitle = '⚠️ User Removal - ACTION TAKEN';
            reasonEmoji = '⚠️';
    }

    const alertMessage =
        `${reasonTitle}\n\n` +
        `👤 User: ${kickedUserJid}\n` +
        `📍 Group: ${groupName || 'Unknown Group'}\n` +
        `🔗 Group URL: ${groupInviteLink || 'N/A'}\n` +
        `⏰ Time: ${timestamp.replace(/\//g, '/').replace(',', ',')}\n` +
        `👢 Kicked: ${kickedUserJid}\n` +
        `📞 Phone: ${phoneDisplay}\n` +
        `🗃️ Blacklisted: ${userPhone}\n` +
        (additionalInfo ? `ℹ️ Details: ${additionalInfo}\n` : '') +
        `🚫 User was removed and blacklisted.\n\n` +
        `🔄 To unblacklist this user, copy the command below:`;

    // Send the main alert
    await sendAlert(sock, alertMessage);

    // Send the unblacklist command as a separate message
    const unblacklistCommand = `#unblacklist ${userPhone}`;
    await sendAlert(sock, unblacklistCommand);
    
    return true;
}

async function sendSecurityAlert(sock, { type, details, groupName, groupId }) {
    const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const alertMessage = 
        `🛡️ SECURITY ALERT\n` +
        `⚠️ Type: ${type.toUpperCase()}\n\n` +
        `📝 Details: ${details}\n` +
        `👥 Group: ${groupName || 'Unknown Group'}\n` +
        `📋 Group ID: ${groupId}\n` +
        `⏰ Time: ${timestamp}\n` +
        `\n🤖 CommGuard Bot Alert`;

    return await sendAlert(sock, alertMessage);
}

module.exports = {
    sendAlert,
    sendKickAlert,
    sendSecurityAlert,
    formatPhoneForAlert
};