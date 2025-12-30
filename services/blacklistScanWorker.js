// Background worker for scanning groups for blacklisted users
const { getTimestamp } = require('../utils/logger');
const { getUserByPhone } = require('../database/groupService');
const {
    getNextScan,
    updateScanProgress,
    clearScanProgress,
    cacheUserStatus,
    getCachedUserStatus,
    isGodNumber,
    GOD_NUMBER,
    GOD_NUMBER_INTL
} = require('./scanQueueService');

let isProcessing = false;
let currentScanInterval = null;

/**
 * Extract phone number from WhatsApp JID
 */
function extractPhoneNumber(jid) {
    if (!jid) return null;
    // Remove WhatsApp suffixes
    const cleaned = jid.replace('@s.whatsapp.net', '')
                       .replace('@c.us', '')
                       .replace('@lid', '')
                       .replace('@g.us', '');
    // Extract just the number part
    return cleaned.split(':')[0];
}

/**
 * Calculate total violations from violations object
 */
function getTotalViolations(violations) {
    if (!violations || typeof violations !== 'object') return 0;

    return Object.values(violations).reduce((sum, count) => {
        return sum + (parseInt(count) || 0);
    }, 0);
}

/**
 * Send notification to god number
 */
async function notifyGod(sock, message) {
    try {
        const godJid = `${GOD_NUMBER_INTL}@s.whatsapp.net`;
        await sock.sendMessage(godJid, { text: message });
        console.log(`[${getTimestamp()}] 📱 Notified god number: ${message.substring(0, 50)}...`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to notify god number:`, error.message);
    }
}

/**
 * Process a single user in the scan
 */
async function processUser(sock, groupId, participantJid, scanStats) {
    const phoneNumber = extractPhoneNumber(participantJid);
    if (!phoneNumber) {
        console.log(`[${getTimestamp()}] ⚠️ Could not extract phone from ${participantJid}`);
        return;
    }

    // GOD NUMBER PROTECTION - Skip immediately, don't even log
    if (isGodNumber(phoneNumber)) {
        return;
    }

    scanStats.processed++;

    try {
        // Check cache first
        let userData = await getCachedUserStatus(phoneNumber);

        if (!userData) {
            // Query database
            userData = await getUserByPhone(phoneNumber);

            // Cache the result
            if (userData) {
                await cacheUserStatus(phoneNumber, userData);
            }
        }

        // Check if blacklisted
        if (!userData || !userData.is_blacklisted) {
            return; // User is clean
        }

        // Calculate total violations
        const totalViolations = getTotalViolations(userData.violations);

        console.log(`[${getTimestamp()}] 🚨 Found blacklisted user: ${phoneNumber} (${totalViolations} violations)`);

        // Threshold check: violations > 1
        if (totalViolations > 1) {
            // KICK USER
            try {
                await sock.groupParticipantsUpdate(groupId, [participantJid], 'remove');
                scanStats.kicked++;

                const violationDetails = Object.entries(userData.violations || {})
                    .map(([type, count]) => `${type} (${count}x)`)
                    .join(', ');

                const kickMsg = `🚫 Kicked +${phoneNumber} from group\n` +
                               `Violations: ${violationDetails}\n` +
                               `Total: ${totalViolations} violations`;

                await notifyGod(sock, kickMsg);
                console.log(`[${getTimestamp()}] ✅ Kicked ${phoneNumber} (${totalViolations} violations)`);
            } catch (error) {
                console.error(`[${getTimestamp()}] ❌ Failed to kick ${phoneNumber}:`, error.message);
            }
        } else {
            // Alert only (violations ≤ 1)
            scanStats.alerted++;

            const violationDetails = Object.entries(userData.violations || {})
                .map(([type, count]) => `${type} (${count}x)`)
                .join(', ');

            const alertMsg = `⚠️ Low-risk blacklisted user in group\n` +
                           `Number: ${phoneNumber}\n` +
                           `Violations: ${violationDetails}\n` +
                           `Total: ${totalViolations}\n` +
                           `NOT kicked (threshold: violations > 1)\n` +
                           `Reply #kick to remove manually`;

            await notifyGod(sock, alertMsg);
            console.log(`[${getTimestamp()}] ⚠️ Alerted about ${phoneNumber} (${totalViolations} violations - below threshold)`);
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error processing user ${phoneNumber}:`, error.message);
    }
}

/**
 * Process a single scan job
 */
async function processScan(sock, scanJob) {
    const { groupId, memberCount, queuedAt } = scanJob;
    const queueTime = Math.floor((Date.now() - queuedAt) / 1000);

    console.log(`[${getTimestamp()}] 🔍 Starting scan of ${groupId} (${memberCount} members, queued ${queueTime}s ago)`);

    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        const participants = groupMetadata.participants.map(p => p.id);

        const scanStats = {
            total: participants.length,
            processed: 0,
            kicked: 0,
            alerted: 0,
            startedAt: Date.now()
        };

        // Notify scan start
        await notifyGod(sock, `✅ Starting scan of ${groupMetadata.subject}\nMembers: ${participants.length}\nEstimated time: ${Math.ceil(participants.length * 2 / 60)} minutes`);

        // Process users one by one (2 seconds delay between each)
        for (const participantJid of participants) {
            await processUser(sock, groupId, participantJid, scanStats);

            // Update progress in Redis
            await updateScanProgress(groupId, scanStats);

            // Wait 2 seconds before next user (0.5 queries/second max)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Send completion report
        const duration = Math.floor((Date.now() - scanStats.startedAt) / 1000);
        const completionMsg = `✅ Scan completed for ${groupMetadata.subject}\n` +
                             `Scanned: ${scanStats.processed} members in ${Math.floor(duration / 60)}m ${duration % 60}s\n` +
                             `🚫 Kicked: ${scanStats.kicked} users\n` +
                             `⚠️ Alerted: ${scanStats.alerted} users (low violations)`;

        await notifyGod(sock, completionMsg);
        console.log(`[${getTimestamp()}] ${completionMsg.replace(/\n/g, ' | ')}`);

        // Clear progress
        await clearScanProgress(groupId);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Scan failed for ${groupId}:`, error.message);
        await notifyGod(sock, `❌ Scan failed for group ${groupId}: ${error.message}`);
        await clearScanProgress(groupId);
    }
}

/**
 * Start the background scan worker
 */
async function startScanWorker(sock) {
    if (isProcessing) {
        console.log(`[${getTimestamp()}] ⚠️ Scan worker already running`);
        return;
    }

    console.log(`[${getTimestamp()}] 🚀 Starting blacklist scan worker`);
    isProcessing = true;

    // Process queue every 5 seconds
    currentScanInterval = setInterval(async () => {
        try {
            const scanJob = await getNextScan();
            if (scanJob) {
                await processScan(sock, scanJob);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Worker error:`, error.message);
        }
    }, 5000);
}

/**
 * Stop the background scan worker
 */
function stopScanWorker() {
    if (currentScanInterval) {
        clearInterval(currentScanInterval);
        currentScanInterval = null;
        isProcessing = false;
        console.log(`[${getTimestamp()}] 🛑 Scan worker stopped`);
    }
}

module.exports = {
    startScanWorker,
    stopScanWorker
};
