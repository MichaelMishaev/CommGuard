const admin = require('firebase-admin');
const config = require('./config');

// Initialize Firebase Admin SDK
const serviceAccount = require('./guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://guard1-d43a3-default-rtdb.firebaseio.com"
});

const db = admin.database();

async function checkBlacklist(userId) {
  try {
    console.log(`🔍 Checking blacklist for user: ${userId}`);
    
    // Check in blacklist
    const blacklistRef = db.ref('blacklist');
    const blacklistSnapshot = await blacklistRef.once('value');
    const blacklist = blacklistSnapshot.val();
    
    if (blacklist && blacklist[userId]) {
      console.log(`❌ User ${userId} is BLACKLISTED`);
      console.log(`📅 Blacklisted on: ${blacklist[userId].timestamp || 'Unknown'}`);
      console.log(`📝 Reason: ${blacklist[userId].reason || 'No reason provided'}`);
      return true;
    } else {
      console.log(`✅ User ${userId} is NOT blacklisted`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error checking blacklist:', error);
    return false;
  }
}

// Check the specific user
const userId = '130468791996475@c.us';
checkBlacklist(userId).then((isBlacklisted) => {
  console.log(`\n📊 Result: ${isBlacklisted ? 'BLACKLISTED' : 'NOT BLACKLISTED'}`);
  process.exit(0);
}).catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 