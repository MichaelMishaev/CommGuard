// utils/blacklistPendingRequests.js
// Store pending blacklist requests from alerts (message ID → phone number mapping)
// Persisted to disk so requests survive bot restarts

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'pending_requests.json');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const pendingBlacklistRequests = new Map();

function _save() {
    const obj = {};
    for (const [id, data] of pendingBlacklistRequests) {
        obj[id] = data;
    }
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
        console.error('[PendingRequests] Failed to save:', e.message);
    }
}

function _load() {
    try {
        if (!fs.existsSync(STORE_FILE)) return;
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        const now = Date.now();
        for (const [id, data] of Object.entries(raw)) {
            if (now - data.timestamp < TTL_MS) {
                pendingBlacklistRequests.set(id, data);
            }
        }
        console.log(`[PendingRequests] Loaded ${pendingBlacklistRequests.size} pending requests from disk`);
    } catch (e) {
        console.error('[PendingRequests] Failed to load:', e.message);
    }
}

// Load on startup
_load();

function storePendingRequest(messageId, phoneNumber, userId, reason, groupId = null) {
    pendingBlacklistRequests.set(messageId, {
        phoneNumber,
        userId,
        reason,
        groupId,
        timestamp: Date.now()
    });
    _save();
}

function getPendingRequest(messageId) {
    const data = pendingBlacklistRequests.get(messageId);
    if (!data) return null;
    // Expire stale entries on read
    if (Date.now() - data.timestamp >= TTL_MS) {
        pendingBlacklistRequests.delete(messageId);
        _save();
        return null;
    }
    return data;
}

function removePendingRequest(messageId) {
    pendingBlacklistRequests.delete(messageId);
    _save();
}

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
