const { jidKey } = require('../utils/jidUtils');

// In-memory whitelist cache for fast access
const whitelistCache = new Set();

async function addToWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;

    if (whitelistCache.has(jid)) {
        return false; // Already whitelisted
    }

    // Add to cache
    whitelistCache.add(jid);
    console.log(`✅ Added ${jid} to whitelist [memory-only]`);
    return true;
}

async function removeFromWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;

    if (!whitelistCache.has(jid)) {
        return false; // Not whitelisted
    }

    // Remove from cache
    whitelistCache.delete(jid);
    console.log(`✅ Removed ${jid} from whitelist [memory-only]`);
    return true;
}

async function listWhitelist() {
    return Array.from(whitelistCache);
}

async function loadWhitelistCache() {
    // Memory-only mode
    console.log(`💾 Whitelist using memory-only cache - ${whitelistCache.size} users`);
    return whitelistCache;
}

function isWhitelisted(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;

    // Check cache first
    if (whitelistCache.has(jid)) {
        return true;
    }

    // Legacy support for raw phone ids
    const legacyId = jid.includes('@') ? jid.split('@')[0] : jid;
    if (legacyId !== jid && whitelistCache.has(legacyId)) {
        return true;
    }

    return false;
}

function getWhitelistCache() {
    return new Set(whitelistCache);
}

module.exports = {
    addToWhitelist,
    removeFromWhitelist,
    listWhitelist,
    isWhitelisted,
    loadWhitelistCache,
    getWhitelistCache
};
