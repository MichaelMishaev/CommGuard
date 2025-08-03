#!/usr/bin/env node

/**
 * Firebase Index Setup for Unblacklist Request System
 * Creates necessary composite indexes for efficient queries
 */

const { getTimestamp } = require('./utils/logger');

console.log(`[${getTimestamp()}] 🔥 Firebase Index Setup for Unblacklist Requests\n`);

console.log('📋 Required Firebase Indexes:');
console.log('');

console.log('1. **Composite Index for Pending Requests Query**');
console.log('   Collection: unblacklist_requests');
console.log('   Fields:');
console.log('   - status (Ascending)');
console.log('   - requestedAt (Descending)');
console.log('');

console.log('🔗 Firebase Console Links:');
console.log('');

// The error message provides the direct link to create the index
const indexUrl = 'https://console.firebase.google.com/v1/r/project/guard1-d43a3/firestore/indexes?create_composite=Cllwcm9qZWN0cy9ndWFyZDEtZDQzYTMvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3VuYmxhY2tsaXN0X3JlcXVlc3RzL2luZGV4ZXMvXxABGgoKBnN0YXR1cxABGg8KC3JlcXVlc3RlZEF0EAIaDAoIX19uYW1lX18QAg';

console.log(`🎯 Auto-Generated Index Creation Link:`);
console.log(`   ${indexUrl}`);
console.log('');

console.log('📝 Manual Index Creation Steps:');
console.log('');
console.log('1. Go to Firebase Console → Firestore → Indexes');
console.log('2. Click "Create Index"');
console.log('3. Set Collection ID: unblacklist_requests');
console.log('4. Add fields:');
console.log('   - Field: status, Order: Ascending');
console.log('   - Field: requestedAt, Order: Descending');
console.log('5. Click "Create"');
console.log('6. Wait for index to build (usually 1-5 minutes)');
console.log('');

console.log('⚠️  Index Status Check:');
console.log('   After creating the index, test with:');
console.log('   node tests/testUnblacklistFlow.js');
console.log('');

console.log('🎉 Once indexes are created, the unblacklist system will be fully functional!');

// Try to test the index by making a simple query
async function testIndexes() {
    try {
        const db = require('./firebaseConfig.js');
        
        if (!db || !db.collection) {
            console.log('⚠️  Firebase not available for index testing');
            return;
        }
        
        console.log('🧪 Testing current index status...');
        
        // This query will fail if the index doesn't exist
        const snapshot = await db.collection('unblacklist_requests')
            .where('status', '==', 'pending')
            .orderBy('requestedAt', 'desc')
            .limit(1)
            .get();
        
        console.log('✅ Index test passed! Pending requests query working.');
        console.log(`   Found ${snapshot.size} pending requests`);
        
    } catch (error) {
        if (error.message.includes('requires an index')) {
            console.log('❌ Index not yet created. Please create the index using the link above.');
        } else if (error.message.includes('Collection') && error.message.includes('does not exist')) {
            console.log('ℹ️  Collection doesn\'t exist yet (will be created on first use)');
        } else {
            console.log('❌ Index test failed:', error.message);
        }
    }
}

if (require.main === module) {
    testIndexes().then(() => {
        console.log(`\n[${getTimestamp()}] 🏁 Index setup complete!`);
    });
}

module.exports = { testIndexes };