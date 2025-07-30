const admin = require('firebase-admin');
const path = require('path');

// Check if Firebase integration is enabled
let config;
try {
  config = require('./config');
} catch (err) {
  // If config can't be loaded, assume Firebase is disabled
  config = { FEATURES: { FIREBASE_INTEGRATION: false } };
}

// Only initialize Firebase if enabled
let db = null;

if (config.FEATURES.FIREBASE_INTEGRATION) {
  // Initialize Firebase Admin SDK if not already initialized
  if (!admin.apps.length) {
    let serviceAccount;
    let useServiceAccount = false;
    
    try {
      // Try current directory first, then parent directory
      try {
        serviceAccount = require(path.join(__dirname, 'guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json'));
        console.log('📍 Found key in bCommGuard directory');
      } catch (e) {
        console.log('📍 Looking for key in parent directory...');
        try {
          serviceAccount = require(path.join(__dirname, '..', 'guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json'));
          console.log('📍 Found key in parent directory');
        } catch (e2) {
          // Try old filename as fallback
          serviceAccount = require(path.join(__dirname, '..', 'guard1-dbkey.json'));
          console.log('📍 Found key with old filename in parent directory');
        }
      }
      
      // Validate that it's not a mock key
      if (serviceAccount.private_key && !serviceAccount.private_key.includes('MOCK_PRIVATE_KEY_CONTENT')) {
        useServiceAccount = true;
        console.log('✅ Firebase service account key loaded successfully');
      } else {
        console.warn('⚠️ Mock Firebase key detected - Firebase features will be disabled');
        serviceAccount = null;
      }
    } catch (err) {
      console.warn('⚠️ Firebase service account key not found:', err.message);
      console.warn('   Firebase features will be disabled. To enable:');
      console.warn('   1. Go to Firebase Console');
      console.warn('   2. Generate a service account key');
      console.warn('   3. Save it as guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json in bCommGuard directory');
    }

    try {
      if (useServiceAccount && serviceAccount.project_id) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        console.log('🔥 Firebase initialized with service account');
      } else {
        // Try to use environment variable for project ID
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'community-guard-bot';
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: projectId
        });
        console.log(`🔥 Firebase initialized with application default credentials (project: ${projectId})`);
      }
    } catch (err) {
      console.error('❌ Firebase initialization failed:', err.message);
      console.warn('   The bot will run with limited functionality');
      
      // Initialize with a mock app to prevent crashes
      admin.initializeApp({
        projectId: 'mock-project'
      });
    }
  }

  // Export Firestore with error handling
  try {
    db = admin.firestore();
  } catch (err) {
    console.error('❌ Firestore initialization failed:', err.message);
    // Mock Firestore methods to prevent crashes
    db = {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({ exists: false }),
          set: () => Promise.resolve(),
          update: () => Promise.resolve(),
          delete: () => Promise.resolve()
        }),
        get: () => Promise.resolve({ empty: true, docs: [] }),
        add: () => Promise.resolve(),
        where: () => ({
          get: () => Promise.resolve({ empty: true, docs: [] })
        })
      })
    };
  }
} else {
  console.log('📋 Firebase integration disabled in config');
  // Mock Firestore methods when Firebase is disabled
  db = {
    collection: () => ({
      doc: () => ({
        get: () => Promise.resolve({ exists: false }),
        set: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve()
      }),
      get: () => Promise.resolve({ empty: true, docs: [] }),
      add: () => Promise.resolve(),
      where: () => ({
        get: () => Promise.resolve({ empty: true, docs: [] })
      })
    })
  };
}

module.exports = db;
