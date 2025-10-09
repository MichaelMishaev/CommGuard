const db = require('../firebaseConfig.js');

// Enhanced cache for blacklist with persistent storage
const blacklistCache = new Set();
let cacheLoaded = false;
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache
const MEMORY_CACHE_FILE = './blacklist_cache.json';

// Load cache from local file first (fastest)
function loadLocalCache() {
  try {
    const fs = require('fs');
    if (fs.existsSync(MEMORY_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_CACHE_FILE, 'utf8'));
      if (Date.now() - data.timestamp < CACHE_DURATION) {
        data.blacklist.forEach(id => blacklistCache.add(id));
        lastCacheUpdate = data.timestamp;
        cacheLoaded = true;
        console.log(`✅ Loaded ${blacklistCache.size} blacklisted users from local cache (no Firebase read)`);
        return true;
      }
    }
  } catch (error) {
    console.log('📋 No valid local cache found, will load from Firebase');
  }
  return false;
}

// Save cache to local file
function saveLocalCache() {
  try {
    const fs = require('fs');
    const data = {
      timestamp: Date.now(),
      blacklist: Array.from(blacklistCache)
    };
    fs.writeFileSync(MEMORY_CACHE_FILE, JSON.stringify(data), 'utf8');
  } catch (error) {
    console.warn('⚠️ Failed to save local cache:', error.message);
  }
}

// Load blacklist from Firebase into cache
async function loadBlacklistCache() {
  // Try local cache first (no Firebase read needed)
  if (loadLocalCache()) {
    return; // Successfully loaded from local cache
  }

  // MEMORY-ONLY MODE - Firebase disabled for blacklist (cost reduction)
  console.log('💾 Blacklist using memory-only cache (Firebase disabled)');
  cacheLoaded = true;

  /* FIREBASE READS DISABLED FOR BLACKLIST - Cost reduction
  if (!db || db.collection === undefined || global.FIREBASE_QUOTA_EXHAUSTED) {
    console.warn('⚠️ Firebase not available - blacklist features disabled');
    return;
  }

  try {
    console.log('📋 Loading blacklist from Firebase (local cache expired)...');
    const snapshot = await db.collection('blacklist').get();
    blacklistCache.clear();

    snapshot.forEach(doc => {
      blacklistCache.add(doc.id);
    });

    lastCacheUpdate = Date.now();
    cacheLoaded = true;

    // Save to local cache to avoid future Firebase reads
    saveLocalCache();

    console.log(`✅ Loaded ${blacklistCache.size} blacklisted users from Firebase and cached locally`);
  } catch (error) {
    console.error('❌ Error loading blacklist cache:', error.message);

    // Handle Firebase quota exhausted error
    if (error.message && error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('🚨 Firebase quota exhausted - using local cache only');
      global.FIREBASE_QUOTA_EXHAUSTED = true;
    }
  }
  */
}

// Check if a user is blacklisted
async function isBlacklisted(userId) {
  // Normalize the user ID
  const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');
  
  // Check cache first
  if (cacheLoaded) {
    return blacklistCache.has(normalizedId) || 
           blacklistCache.has(userId) ||
           blacklistCache.has(`${normalizedId}@c.us`) ||
           blacklistCache.has(`${normalizedId}@s.whatsapp.net`);
  }
  
  // Fallback to Firebase if cache not loaded and quota not exhausted
  if (!db || db.collection === undefined || global.FIREBASE_QUOTA_EXHAUSTED) {
    return false;
  }
  
  try {
    const doc = await db.collection('blacklist').doc(normalizedId).get();
    return doc.exists;
  } catch (error) {
    console.error('❌ Error checking blacklist:', error.message);
    return false;
  }
}

// Add user to blacklist
async function addToBlacklist(userId, reason = '') {
  const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');
  
  // Add to cache
  blacklistCache.add(normalizedId);
  blacklistCache.add(userId);
  
  // Save to local cache file (Firebase writes disabled for cost reduction)
  saveLocalCache();
  console.log(`✅ Added ${normalizedId} to blacklist (memory-only)`);
  return true;

  /* FIREBASE WRITES DISABLED FOR BLACKLIST - Cost reduction
  if (!db || db.collection === undefined || global.FIREBASE_QUOTA_EXHAUSTED) {
    const reason = global.FIREBASE_QUOTA_EXHAUSTED ? '⚠️ Firebase quota exhausted' : '⚠️ Firebase not available';
    console.warn(`${reason} - user blacklisted in memory only`);
    return true;
  }

  try {
    await db.collection('blacklist').doc(normalizedId).set({
      addedAt: new Date().toISOString(),
      reason: reason,
      originalId: userId
    });

    // Update local cache immediately after successful Firebase write
    saveLocalCache();

    console.log(`✅ Added ${normalizedId} to blacklist and updated cache`);
    return true;
  } catch (error) {
    console.error('❌ Error adding to blacklist:', error.message);

    // Handle quota exhausted error
    if (error.message && error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('🚨 Firebase quota exhausted during blacklist operation');
      global.FIREBASE_QUOTA_EXHAUSTED = true;

      // Still update local cache since user is in memory
      saveLocalCache();
      console.log('✅ User remains blacklisted in memory cache');
      return true;
    }

    return false;
  }
  */
}

// Remove user from blacklist
async function removeFromBlacklist(userId) {
  const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');
  
  // Remove from cache
  blacklistCache.delete(normalizedId);
  blacklistCache.delete(userId);
  blacklistCache.delete(`${normalizedId}@c.us`);
  blacklistCache.delete(`${normalizedId}@s.whatsapp.net`);

  // Save to local cache file (Firebase deletes disabled for cost reduction)
  saveLocalCache();
  console.log(`✅ Removed ${normalizedId} from blacklist (memory-only)`);

  // Enable rejoin for this user
  try {
    const { kickedUserService } = require('./kickedUserService');
    await kickedUserService.enableRejoin(userId);
    console.log(`✅ Enabled rejoin links for ${normalizedId}`);
  } catch (error) {
    console.warn('⚠️ Failed to enable rejoin:', error.message);
  }

  return true;

  /* FIREBASE DELETES DISABLED FOR BLACKLIST - Cost reduction
  if (!db || db.collection === undefined) {
    console.warn('⚠️ Firebase not available - removed from memory only');
    return true;
  }

  try {
    await db.collection('blacklist').doc(normalizedId).delete();
    console.log(`✅ Removed ${normalizedId} from blacklist`);

    // Enable rejoin for this user
    try {
      const { kickedUserService } = require('./kickedUserService');
      await kickedUserService.enableRejoin(userId);
      console.log(`✅ Enabled rejoin links for ${normalizedId}`);
    } catch (error) {
      console.warn('⚠️ Failed to enable rejoin:', error.message);
    }

    return true;
  } catch (error) {
    console.error('❌ Error removing from blacklist:', error.message);
    return false;
  }
  */
}

module.exports = {
  loadBlacklistCache,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  blacklistCache
};