const admin = require('firebase-admin');
const path = require('path');

console.log('🔧 Firebase Setup Diagnostic Tool');
console.log('================================');

// Load service account
let serviceAccount;
try {
    serviceAccount = require('./guard1-dbkey.json');
    console.log('✅ Service account key loaded');
    console.log(`📋 Project ID: ${serviceAccount.project_id}`);
    console.log(`📧 Service Account: ${serviceAccount.client_email}`);
} catch (err) {
    console.error('❌ Failed to load service account:', err.message);
    process.exit(1);
}

// Initialize Firebase
let app;
try {
    app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase app initialized');
} catch (err) {
    console.error('❌ Failed to initialize Firebase:', err.message);
    process.exit(1);
}

// Test Firestore
async function testFirestore() {
    try {
        const db = admin.firestore();
        console.log('✅ Firestore initialized');
        
        // Test write
        const testDoc = db.collection('test').doc('setup-test');
        await testDoc.set({
            timestamp: new Date().toISOString(),
            message: 'Firebase setup test'
        });
        console.log('✅ Write test successful');
        
        // Test read
        const doc = await testDoc.get();
        if (doc.exists) {
            console.log('✅ Read test successful');
        } else {
            console.log('❌ Read test failed');
        }
        
        // Clean up
        await testDoc.delete();
        console.log('✅ Cleanup successful');
        
        // Test collections
        const collections = ['blacklist', 'whitelist', 'muted'];
        for (const collectionName of collections) {
            try {
                const snapshot = await db.collection(collectionName).get();
                console.log(`✅ Collection '${collectionName}' accessible (${snapshot.size} documents)`);
            } catch (err) {
                console.log(`⚠️ Collection '${collectionName}' not accessible: ${err.message}`);
            }
        }
        
    } catch (err) {
        console.error('❌ Firestore test failed:', err.message);
        
        if (err.message.includes('PERMISSION_DENIED')) {
            console.log('\n🔧 Solutions:');
            console.log('1. Enable Firestore Database in Firebase Console');
            console.log('2. Go to: https://console.firebase.google.com/project/guard1-d43a3/firestore');
            console.log('3. Click "Create Database" if not exists');
            console.log('4. Set security rules to allow read/write');
        }
        
        if (err.message.includes('UNAUTHENTICATED')) {
            console.log('\n🔧 Solutions:');
            console.log('1. Check if service account has proper permissions');
            console.log('2. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts');
            console.log('3. Find: firebase-adminsdk-fbsvc@guard1-d43a3.iam.gserviceaccount.com');
            console.log('4. Add "Firebase Admin" role');
        }
    }
}

// Test Authentication
async function testAuth() {
    try {
        const auth = admin.auth();
        console.log('✅ Firebase Auth initialized');
        
        // List users (should work with admin SDK)
        const listUsersResult = await auth.listUsers(1);
        console.log(`✅ Auth test successful (${listUsersResult.users.length} users found)`);
        
    } catch (err) {
        console.error('❌ Auth test failed:', err.message);
    }
}

// Run tests
async function runTests() {
    console.log('\n🧪 Running Firebase tests...\n');
    
    await testFirestore();
    console.log('\n');
    await testAuth();
    
    console.log('\n✅ Firebase setup diagnostic complete!');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
}); 