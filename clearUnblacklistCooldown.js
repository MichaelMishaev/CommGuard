#!/usr/bin/env node

/**
 * Clear Unblacklist Request Cooldown
 * Removes unblacklist request record for a specific phone number
 * This allows them to immediately send #free command again
 */

const config = require('./config');
const { getTimestamp } = require('./utils/logger');

// Initialize Firebase using same pattern as services
const db = require('./firebaseConfig.js');

if (!db || db.collection === undefined) {
    console.error(`[${getTimestamp()}] ❌ Firebase not available - cannot clear cooldown`);
    process.exit(1);
} else {
    console.log(`[${getTimestamp()}] ✅ Firebase initialized successfully`);
}

// Function to normalize user ID (same as in unblacklistRequestService)
function normalizeUserId(userId) {
    if (!userId) return null;
    
    // Remove @s.whatsapp.net suffix if present
    let normalized = userId.replace('@s.whatsapp.net', '');
    
    // Handle LID format (like 972555030746:16@lid)
    if (normalized.includes('@lid')) {
        normalized = normalized.split(':')[0];
    }
    
    return normalized;
}

// Clear cooldown for specific user
async function clearUnblacklistCooldown(phoneNumber) {
    console.log(`[${getTimestamp()}] 🧹 Clearing unblacklist cooldown for ${phoneNumber}`);
    
    try {
        // Normalize the phone number
        const normalizedId = normalizeUserId(phoneNumber);
        console.log(`[${getTimestamp()}] 📞 Normalized phone: ${normalizedId}`);
        
        // Check if record exists
        const docRef = db.collection('unblacklist_requests').doc(normalizedId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`[${getTimestamp()}] 📋 Found existing record:`);
            console.log(`   Status: ${data.status}`);
            console.log(`   Requested at: ${data.requestedAt}`);
            console.log(`   Can request again: ${data.canRequestAgain}`);
            
            // Delete the record
            await docRef.delete();
            console.log(`[${getTimestamp()}] ✅ Successfully deleted cooldown record for ${phoneNumber}`);
            console.log(`[${getTimestamp()}] 🎯 User can now send #free command immediately`);
            
        } else {
            console.log(`[${getTimestamp()}] ℹ️  No cooldown record found for ${phoneNumber}`);
            console.log(`[${getTimestamp()}] 🎯 User can already send #free command`);
        }
        
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error clearing cooldown:`, error);
        throw error;
    }
}

// Main execution
async function main() {
    const phoneNumber = '+972555030746';
    
    console.log(`
╔════════════════════════════════════════════════════╗
║            🧹 Clear Unblacklist Cooldown            ║
║                                                    ║
║  Clearing cooldown for test number:                ║
║  ${phoneNumber.padEnd(48)} ║
╚════════════════════════════════════════════════════╝
    `);
    
    try {
        await clearUnblacklistCooldown(phoneNumber);
        
        console.log(`\n✅ OPERATION COMPLETED SUCCESSFULLY!\n`);
        console.log(`🎯 Next steps:`);
        console.log(`1. User ${phoneNumber} can now send #free command`);
        console.log(`2. They will get the success message with Hebrew translation`);
        console.log(`3. Admin will receive notification at alert phone`);
        
    } catch (error) {
        console.error(`\n❌ OPERATION FAILED:`, error.message);
        process.exit(1);
    }
}

// Execute the script
main().catch(console.error);