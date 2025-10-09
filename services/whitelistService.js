const db = require('../firebaseConfig.js');
const { jidKey } = require('../utils/jidUtils');

// In-memory whitelist cache for fast access
const whitelistCache = new Set();

async function addToWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;

    if (whitelistCache.has(jid)) {
        return false; // Already whitelisted
    }

    // Add to cache (Firebase writes disabled for cost reduction)
    whitelistCache.add(jid);
    console.log(`✅ Added ${jid} to whitelist (memory-only)`);
    return true;

    /* FIREBASE WRITES DISABLED FOR WHITELIST - Cost reduction
    try {
        const docRef = db.collection('whitelist').doc(jid);
        const doc = await docRef.get();

        if (doc.exists) {
            return false; // Already whitelisted
        }

        await docRef.set({
            jid,
            addedAt: Date.now()
        });

        // Add to cache
        whitelistCache.add(jid);

        console.log(`✅ Added ${jid} to whitelist`);
        return true;
    } catch (error) {
        console.error('❌ Failed to add to whitelist:', error.message);
        return false;
    }
    */
}

async function removeFromWhitelist(phoneNumber) {
    const jid = jidKey(phoneNumber);
    if (!jid) return false;

    if (!whitelistCache.has(jid)) {
        return false; // Not whitelisted
    }

    // Remove from cache (Firebase deletes disabled for cost reduction)
    whitelistCache.delete(jid);
    console.log(`✅ Removed ${jid} from whitelist (memory-only)`);
    return true;

    /* FIREBASE DELETES DISABLED FOR WHITELIST - Cost reduction
    try {
        const docRef = db.collection('whitelist').doc(jid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return false; // Not whitelisted
        }

        await docRef.delete();

        // Remove from cache
        whitelistCache.delete(jid);

        console.log(`✅ Removed ${jid} from whitelist`);
        return true;
    } catch (error) {
        console.error('❌ Failed to remove from whitelist:', error.message);
        return false;
    }
    */
}

async function listWhitelist() {
    // Return from cache (Firebase reads disabled for cost reduction)
    return Array.from(whitelistCache);

    /* FIREBASE READS DISABLED FOR WHITELIST - Cost reduction
    try {
        const snapshot = await db.collection('whitelist').get();
        return snapshot.docs.map(doc => doc.id);
    } catch (error) {
        console.error('❌ Failed to list whitelist:', error.message);
        return [];
    }
    */
}

async function loadWhitelistCache() {
    // MEMORY-ONLY MODE - Firebase disabled for whitelist (cost reduction)
    console.log(`💾 Whitelist using memory-only cache (Firebase disabled) - ${whitelistCache.size} users`);
    return whitelistCache;

    /* FIREBASE READS DISABLED FOR WHITELIST - Cost reduction
    try {
        const snapshot = await db.collection('whitelist').get();
        whitelistCache.clear();

        snapshot.forEach(doc => {
            whitelistCache.add(doc.id);
        });

        console.log(`✅ Loaded ${whitelistCache.size} whitelisted users`);
        return whitelistCache;
    } catch (error) {
        console.error('❌ Failed to load whitelist cache:', error.message);
        return new Set();
    }
    */
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