const db = require('../firebaseConfig.js');
const { jidKey } = require('../utils/jidUtils');

// In-memory mute storage for fast access
const mutedUsers = new Map();
const mutedMessageCounts = new Map();

async function addMutedUser(userId, muteUntil) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        
        // Add to memory
        mutedUsers.set(jid, muteUntil);
        mutedMessageCounts.set(jid, 0);
        
        // Add to Firebase
        await db.collection('muted_users').doc(jid).set({ 
            muteUntil,
            createdAt: Date.now()
        });
        
        console.log(`✅ User ${jid} muted until ${new Date(muteUntil).toLocaleString()}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to add muted user:', error.message);
        return false;
    }
}

async function removeMutedUser(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;
        
        // Remove from memory
        mutedUsers.delete(jid);
        mutedMessageCounts.delete(jid);
        
        // Remove from Firebase
        await db.collection('muted_users').doc(jid).delete();
        
        console.log(`✅ User ${jid} unmuted`);
        return true;
    } catch (error) {
        console.error('❌ Failed to remove muted user:', error.message);
        return false;
    }
}

async function loadMutedUsers() {
    try {
        const snapshot = await db.collection('muted_users').get();
        const muted = new Map();
        const now = Date.now();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.muteUntil > now) {
                muted.set(doc.id, data.muteUntil);
                mutedMessageCounts.set(doc.id, 0);
            } else {
                // Remove expired mutes
                db.collection('muted_users').doc(doc.id).delete();
            }
        });
        
        // Update memory
        mutedUsers.clear();
        muted.forEach((muteUntil, userId) => {
            mutedUsers.set(userId, muteUntil);
        });
        
        console.log(`✅ Loaded ${muted.size} muted users`);
        return muted;
    } catch (error) {
        console.error('❌ Failed to load muted users:', error.message);
        return new Map();
    }
}

function isMuted(userId) {
    const jid = jidKey(userId);
    if (!jid) return false;
    
    const muteUntil = mutedUsers.get(jid);
    if (!muteUntil) return false;
    
    const now = Date.now();
    if (now >= muteUntil) {
        // Mute expired, remove it
        removeMutedUser(userId);
        return false;
    }
    
    return true;
}

function incrementMutedMessageCount(userId) {
    const jid = jidKey(userId);
    if (!jid) return 0;
    
    const count = (mutedMessageCounts.get(jid) || 0) + 1;
    mutedMessageCounts.set(jid, count);
    return count;
}

function getMutedMessageCount(userId) {
    const jid = jidKey(userId);
    return mutedMessageCounts.get(jid) || 0;
}

function getMutedUsers() {
    return new Map(mutedUsers);
}

function getRemainingMuteTime(userId) {
    const jid = jidKey(userId);
    if (!jid) return null;
    
    const muteUntil = mutedUsers.get(jid);
    if (!muteUntil) return null;
    
    const now = Date.now();
    if (now >= muteUntil) {
        return null; // Expired
    }
    
    const remainingMs = muteUntil - now;
    const minutes = Math.ceil(remainingMs / 60000);
    
    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours} hour${hours === 1 ? '' : 's'}`;
        } else {
            return `${hours}h ${remainingMinutes}m`;
        }
    }
}

module.exports = { 
    addMutedUser, 
    removeMutedUser, 
    loadMutedUsers, 
    isMuted,
    incrementMutedMessageCount,
    getMutedMessageCount,
    getMutedUsers,
    getRemainingMuteTime
};