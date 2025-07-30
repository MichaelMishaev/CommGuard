const db = require('./firebaseConfig');

console.log('Testing Firebase connection...');

// Try to write a test document
db.collection('test').doc('connection').set({
  timestamp: new Date().toISOString(),
  test: true,
  message: 'Firebase is connected!'
})
.then(() => {
  console.log('✅ Firebase connection successful!');
  console.log('✅ Successfully wrote to Firestore');
  
  // Try to read it back
  return db.collection('test').doc('connection').get();
})
.then(doc => {
  if (doc.exists) {
    console.log('✅ Successfully read from Firestore:', doc.data());
  }
  process.exit(0);
})
.catch(err => {
  console.error('❌ Firebase connection failed:', err.message);
  process.exit(1);
});