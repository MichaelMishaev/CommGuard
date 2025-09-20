const db = require('../firebaseConfig.js');

// Cache for blacklist
const blacklistCache = new Set();
let cacheLoaded = false;

// Load blacklist from Firebase into cache
async function loadBlacklistCache() {
  if (!db || db.collection === undefined) {
    console.warn('⚠️ Firebase not available - blacklist features disabled');
    return;
  }

  try {
    const snapshot = await db.collection('blacklist').get();
    blacklistCache.clear();
    
    snapshot.forEach(doc => {
      blacklistCache.add(doc.id);
    });
    
    cacheLoaded = true;
    console.log(`✅ Loaded ${blacklistCache.size} blacklisted users into cache`);
  } catch (error) {
    console.error('❌ Error loading blacklist cache:', error.message);

    // Handle Firebase quota exhausted error
    if (error.message && error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('🚨 Firebase quota exhausted - switching to memory-only mode');
      console.log('⚠️ Blacklist data will not persist across restarts until quota resets');

      // Set flag to disable Firebase operations temporarily
      global.FIREBASE_QUOTA_EXHAUSTED = true;
    }
  }
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
  
  // Add to Firebase if available and quota not exhausted
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
    
    console.log(`✅ Added ${normalizedId} to blacklist`);
    return true;
  } catch (error) {
    console.error('❌ Error adding to blacklist:', error.message);

    // Handle quota exhausted error
    if (error.message && error.message.includes('RESOURCE_EXHAUSTED')) {
      console.log('🚨 Firebase quota exhausted during blacklist operation');
      global.FIREBASE_QUOTA_EXHAUSTED = true;

      // User is still in memory cache, so operation partially succeeded
      console.log('✅ User remains blacklisted in memory cache');
      return true;
    }

    return false;
  }
}

// Remove user from blacklist
async function removeFromBlacklist(userId) {
  const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');
  
  // Remove from cache
  blacklistCache.delete(normalizedId);
  blacklistCache.delete(userId);
  blacklistCache.delete(`${normalizedId}@c.us`);
  blacklistCache.delete(`${normalizedId}@s.whatsapp.net`);
  
  // Remove from Firebase if available
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
}

module.exports = {
  loadBlacklistCache,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  blacklistCache
};