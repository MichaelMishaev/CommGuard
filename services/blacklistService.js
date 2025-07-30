const db = require('../firebaseConfig');

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
  
  // Fallback to Firebase if cache not loaded
  if (!db || db.collection === undefined) {
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
  
  // Add to Firebase if available
  if (!db || db.collection === undefined) {
    console.warn('⚠️ Firebase not available - user blacklisted in memory only');
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