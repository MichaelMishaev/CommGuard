const config = require('../config');
const { getTimestamp } = require('./logger');
const { decodeLIDToPhone } = require('./jidUtils');

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

async function sendKickAlert(sock, { userPhone, userName, groupName, groupId, reason, additionalInfo = '', spamLink = '', groupInviteLink = '', userId = '', violations = {}, autoBlacklisted = false }) {
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

    // Check if LID format and try to decode
    const isLidFormat = userId && userId.endsWith('@lid');
    let phoneDisplay = userPhone;
    let realPhone = userPhone;

    if (isLidFormat) {
        const decoded = await decodeLIDToPhone(sock, userId);
        if (decoded) {
            realPhone = decoded;
            phoneDisplay = decoded; // Show real number
        } else {
            phoneDisplay = `${userPhone} (LID - Encrypted ID)`; // Fallback if decoding fails
        }
    }

    // Format violations for display
    const { formatViolations } = require('../database/groupService');
    const violationsText = formatViolations(violations);

    let alertTitle = '🚨 WhatsApp Invite Spam - ACTION REQUIRED';
    let kickedUserJid = userId || `${userPhone}@s.whatsapp.net`;

    // For invite link spam with NEW flow (ask admin before blacklisting)
    if (reason === 'invite_link') {
        const alertMessage =
            `${alertTitle}\n\n` +
            `👤 User: ${kickedUserJid}\n` +
            `📞 Phone: +${phoneDisplay}\n` +
            `📍 Group: ${groupName || 'Unknown Group'}\n` +
            `🔗 Group URL: ${groupInviteLink || 'N/A'}\n` +
            `⏰ Time: ${timestamp}\n` +
            `📧 Spam Link: ${spamLink || 'N/A'}\n` +
            `⚠️ Violations: ${violationsText}\n\n` +
            `✅ User was kicked from this group\n\n` +
            `❓ Choose action:\n` +
            `Reply with:\n` +
            `  1️⃣ = Blacklist Only (prevent rejoin)\n` +
            `  2️⃣ = Global Ban Only (kick from all your groups)\n` +
            `  3️⃣ = Blacklist + Global Ban (both!)\n` +
            `  0️⃣ = Ignore (do nothing)`;

        // Send alert and return the message info for reply handling
        return await sock.sendMessage(formatPhoneForAlert(config.ALERT_PHONE), { text: alertMessage });
    }

    // For admin kick command (#kick)
    if (reason === 'kicked_by_admin') {
        const alertMessage =
            `👮‍♂️ Admin Command - User Kicked\n\n` +
            `👤 User: ${kickedUserJid}\n` +
            `📞 Phone: +${phoneDisplay}\n` +
            `📍 Group: ${groupName || 'Unknown Group'}\n` +
            `🔗 Group URL: ${groupInviteLink || 'N/A'}\n` +
            `⏰ Time: ${timestamp}\n` +
            `⚠️ Violations: ${violationsText}\n\n` +
            `✅ User was kicked from this group\n\n` +
            `❓ Choose action:\n` +
            `Reply with:\n` +
            `  1️⃣ = Blacklist Only (prevent rejoin)\n` +
            `  2️⃣ = Global Ban Only (kick from all your groups)\n` +
            `  3️⃣ = Blacklist + Global Ban (both!)\n` +
            `  0️⃣ = Ignore (do nothing)`;

        return await sock.sendMessage(formatPhoneForAlert(config.ALERT_PHONE), { text: alertMessage });
    }

    // For other reasons (auto-blacklist cases like country code, already blacklisted)
    let reasonTitle = '';

    switch (reason) {
        case 'blacklisted':
            reasonTitle = '🚫 Blacklisted User Auto-Kick';
            break;
        case 'country_code':
            reasonTitle = '🌍 Country Code Restriction';
            break;
        default:
            reasonTitle = '⚠️ User Removal';
    }

    const alertMessage =
        `${reasonTitle}\n\n` +
        `👤 User: ${kickedUserJid}\n` +
        `📞 Phone: +${phoneDisplay}\n` +
        `📍 Group: ${groupName || 'Unknown Group'}\n` +
        `🔗 Group URL: ${groupInviteLink || 'N/A'}\n` +
        `⏰ Time: ${timestamp}\n` +
        (additionalInfo ? `ℹ️ Details: ${additionalInfo}\n` : '') +
        `⚠️ Violations: ${violationsText}\n\n` +
        `✅ User was automatically removed`;

    await sendAlert(sock, alertMessage);
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

async function sendBlacklistRejoinAlert(sock, { userPhone, userId, groupName, groupId, violations = {} }) {
    const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Decode LID if needed
    const isLidFormat = userId && userId.endsWith('@lid');
    let phoneDisplay = userPhone;

    if (isLidFormat) {
        const decoded = await decodeLIDToPhone(sock, userId);
        if (decoded) {
            phoneDisplay = decoded;
        } else {
            phoneDisplay = `${userPhone} (LID)`;
        }
    }

    // Format violations
    const { formatViolations } = require('../database/groupService');
    const violationsText = formatViolations(violations);

    // Get group invite link
    let groupInviteLink = 'N/A';
    try {
        const inviteCode = await sock.groupInviteCode(groupId);
        groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
    } catch (err) {
        // Can't get invite link
    }

    const alertMessage =
        `🚫 BLACKLISTED USER REJOIN ATTEMPT\n\n` +
        `👤 User: ${userId || `${userPhone}@s.whatsapp.net`}\n` +
        `📞 Phone: +${phoneDisplay}\n` +
        `📍 Group: ${groupName || 'Unknown Group'}\n` +
        `🔗 Group URL: ${groupInviteLink}\n` +
        `⏰ Time: ${timestamp}\n` +
        `⚠️ Violations: ${violationsText}\n\n` +
        `✅ User was automatically kicked (blacklisted)\n\n` +
        `❓ Unblacklist this user?\n` +
        `Reply with:\n` +
        `  #ub = Yes, remove from blacklist\n` +
        `  (Ignore to keep blocked)`;

    // Send alert and return message info for reply handling
    return await sock.sendMessage(formatPhoneForAlert(config.ALERT_PHONE), { text: alertMessage });
}

module.exports = {
    sendAlert,
    sendKickAlert,
    sendSecurityAlert,
    sendBlacklistRejoinAlert,
    formatPhoneForAlert
};