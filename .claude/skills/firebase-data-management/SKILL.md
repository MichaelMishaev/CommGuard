---
name: firebase-data-management
description: Firebase Firestore operations for bCommGuard - managing blacklist, whitelist, and muted users
tags: [firebase, firestore, database, blacklist, whitelist]
---

# Firebase Data Management Skill

This skill guides you through Firebase Firestore operations for managing user data in bCommGuard.

## Firebase Collections

### Core Collections
1. **blacklist** - Users banned from all managed groups
2. **whitelist** - Trusted users who bypass all restrictions
3. **muted** - Muted users and groups

### Data Structure

#### Blacklist Entry
```javascript
{
  phone: "972501234567",
  lid: "201769628000458@lid",  // Optional
  reason: "Shared WhatsApp invite link",
  addedAt: Timestamp,
  addedBy: "972509876543",
  groupId: "120363123456789@g.us"
}
```

#### Whitelist Entry
```javascript
{
  phone: "972501234567",
  lid: "171012763213843@lid",  // Optional
  reason: "Trusted admin",
  addedAt: Timestamp,
  addedBy: "972509876543"
}
```

#### Muted Entry
```javascript
{
  userId: "972501234567@s.whatsapp.net",
  groupId: "120363123456789@g.us",
  mutedUntil: Timestamp,  // null for permanent
  mutedBy: "972509876543",
  reason: "Spam messages"
}
```

## Service Layer APIs

### Blacklist Operations

#### Add to Blacklist
```javascript
const { addToBlacklist } = require('./services/blacklistService');

await addToBlacklist(
  phone,           // "972501234567"
  reason,          // "Shared invite link"
  addedBy,         // Admin phone
  groupId,         // Optional group ID
  lid              // Optional LID format
);
```

#### Remove from Blacklist
```javascript
const { removeFromBlacklist } = require('./services/blacklistService');

await removeFromBlacklist(phone);
// Returns: true if removed, false if not found
```

#### Check if Blacklisted
```javascript
const { isBlacklisted } = require('./services/blacklistService');

const blocked = await isBlacklisted(phone);
// Returns: true/false
```

#### List All Blacklisted
```javascript
const { listBlacklist } = require('./services/blacklistService');

const users = await listBlacklist();
// Returns: Array of blacklisted phone numbers
```

### Whitelist Operations

#### Add to Whitelist
```javascript
const { addToWhitelist } = require('./services/whitelistService');

await addToWhitelist(
  phone,           // "972501234567"
  reason,          // "Trusted admin"
  addedBy,         // Admin phone
  lid              // Optional LID format
);
```

#### Remove from Whitelist
```javascript
const { removeFromWhitelist } = require('./services/whitelistService');

await removeFromWhitelist(phone);
```

#### Check if Whitelisted
```javascript
const { isWhitelisted } = require('./services/whitelistService');

const trusted = await isWhitelisted(phone);
// Returns: true/false
```

#### List All Whitelisted
```javascript
const { listWhitelist } = require('./services/whitelistService');

const users = await listWhitelist();
// Returns: Array of whitelisted phone numbers
```

### Mute Operations

#### Mute User
```javascript
const { addMutedUser } = require('./services/muteService');

await addMutedUser(
  userId,          // "972501234567@s.whatsapp.net"
  groupId,         // "120363123456789@g.us"
  duration,        // Minutes (null = permanent)
  mutedBy,         // Admin phone
  reason           // Optional reason
);
```

#### Unmute User
```javascript
const { removeMutedUser } = require('./services/muteService');

await removeMutedUser(userId, groupId);
```

#### Check if Muted
```javascript
const { isMuted } = require('./services/muteService');

const muted = await isMuted(userId, groupId);
// Returns: true/false
```

#### List Muted Users
```javascript
const { getMutedUsers } = require('./services/muteService');

const mutedList = await getMutedUsers(groupId);
// Returns: Array of muted user IDs for that group
```

## Firebase Feature Toggle

Firebase integration is controlled by feature flag:

```javascript
// config.js
FEATURES: {
  FIREBASE_INTEGRATION: true  // Set false for memory-only mode
}
```

### Memory-Only Mode
When Firebase is disabled:
- All services gracefully degrade to in-memory storage
- Data persists only during bot runtime
- No Firebase credentials needed
- Perfect for testing/development

### Firebase Mode
When Firebase is enabled:
- Data persists across bot restarts
- Shared across multiple bot instances
- Requires `guard1-dbkey.json` service account key

## Testing Firebase Connection

```bash
# Test Firebase setup
node setupFirebase.js

# Expected output:
# ✅ Firebase initialized successfully
# ✅ Database connection verified
# ✅ Permissions validated
```

## Manual Firebase Operations

### Using Firebase Console

1. **Login**: https://console.firebase.google.com
2. **Select Project**: guard1
3. **Navigate to Firestore Database**

### Query Examples

#### Find User in Blacklist
```javascript
// Filter: phone == "972501234567"
```

#### Find Recent Blacklists
```javascript
// Order by: addedAt (desc)
// Limit: 10
```

#### Find Users by Admin
```javascript
// Filter: addedBy == "972509876543"
```

### Direct Firestore API

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

// Get all blacklisted users
const snapshot = await db.collection('blacklist').get();
const users = snapshot.docs.map(doc => doc.data());

// Add to blacklist
await db.collection('blacklist').doc(phone).set({
  phone,
  reason: "Manual addition",
  addedAt: admin.firestore.FieldValue.serverTimestamp(),
  addedBy: "admin"
});

// Remove from blacklist
await db.collection('blacklist').doc(phone).delete();
```

## Bot Commands for Data Management

### Blacklist Commands (Admin Only)
```bash
# Add to blacklist
#blacklist 972501234567

# Remove from blacklist
#unblacklist 972501234567

# List blacklisted users
#blacklst
```

### Whitelist Commands (Admin Only)
```bash
# Add to whitelist
#whitelist 972501234567

# Remove from whitelist
#unwhitelist 972501234567

# List whitelisted users
#whitelst
```

### Mute Commands (Group Admin)
```bash
# Mute user (reply to their message)
#mute user 30

# Mute entire group
#mute group 60

# Unmute user
#unmute user

# Unmute group
#unmute group
```

## Data Migration

### Export from Firebase
```javascript
const admin = require('firebase-admin');
const fs = require('fs');

async function exportBlacklist() {
  const db = admin.firestore();
  const snapshot = await db.collection('blacklist').get();
  const data = snapshot.docs.map(doc => doc.data());

  fs.writeFileSync('blacklist-export.json', JSON.stringify(data, null, 2));
  console.log(`Exported ${data.length} blacklisted users`);
}
```

### Import to Firebase
```javascript
const admin = require('firebase-admin');
const fs = require('fs');

async function importBlacklist() {
  const db = admin.firestore();
  const data = JSON.parse(fs.readFileSync('blacklist-export.json'));

  const batch = db.batch();
  data.forEach(user => {
    const ref = db.collection('blacklist').doc(user.phone);
    batch.set(ref, user);
  });

  await batch.commit();
  console.log(`Imported ${data.length} users to blacklist`);
}
```

## Critical Safety Rules

### ❌ NEVER:
- **Delete production data** without explicit permission
- **Modify data directly** in Firebase Console (use bot commands or services)
- **Share Firebase credentials** (guard1-dbkey.json)
- **Disable Firebase** in production without backup
- **Bulk delete** without confirmation

### ✅ ALWAYS:
- **Use service layer APIs** (blacklistService, whitelistService, muteService)
- **Test locally** before production operations
- **Export backup** before bulk operations
- **Verify changes** after operations
- **Log all operations** for audit trail

## Troubleshooting

### Firebase Connection Failed
```bash
# Check service account key exists
ls -la guard1-dbkey.json

# Verify permissions in Firebase Console
# IAM & Admin > Service Accounts > guard1@appspot.gserviceaccount.com
# Should have: Cloud Datastore User
```

### Permission Denied Error
```javascript
// Check Firebase rules in Console
// Firestore Database > Rules

// Should allow server-side access:
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Data Not Persisting
```bash
# Verify Firebase integration is enabled
grep -n "FIREBASE_INTEGRATION" config.js

# Should be: FIREBASE_INTEGRATION: true
```

### Service Not Initialized
```javascript
// Services auto-initialize on first use
// If issues, check initialization:
const blacklistService = require('./services/blacklistService');

// This triggers initialization
await blacklistService.isBlacklisted("test");
```

## Performance Considerations

### Caching Strategy
- Services cache data in memory after first read
- Cache invalidates on write operations
- Reduces Firebase API calls (cost savings)

### Batch Operations
```javascript
// Use batch writes for multiple operations
const admin = require('firebase-admin');
const db = admin.firestore();
const batch = db.batch();

users.forEach(phone => {
  const ref = db.collection('blacklist').doc(phone);
  batch.delete(ref);
});

await batch.commit();
```

### Rate Limiting
- Firebase has rate limits: 10,000 writes/sec
- Bot operations are well within limits
- Monitor usage in Firebase Console > Usage

## Monitoring

### Firebase Console Metrics
- **Reads/Writes**: Firestore Database > Usage
- **Storage**: Firestore Database > Data size
- **Errors**: Firestore Database > Errors

### Bot-Side Monitoring
```javascript
// Check service health
const { listBlacklist } = require('./services/blacklistService');

try {
  const users = await listBlacklist();
  console.log(`✅ Firebase operational: ${users.length} blacklisted users`);
} catch (error) {
  console.error('❌ Firebase error:', error);
}
```

## Best Practices

1. **Use Service APIs**: Always use blacklistService/whitelistService/muteService
2. **Handle Errors**: Wrap Firebase calls in try-catch
3. **Test Locally**: Use memory mode for development
4. **Backup Regularly**: Export critical data weekly
5. **Monitor Usage**: Check Firebase Console monthly
6. **Audit Logs**: Keep track of who added/removed users
7. **Secure Credentials**: Never commit guard1-dbkey.json to git
