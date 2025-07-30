# Blacklist Comparison and Kicking Guide

## How to Compare Users Against Blacklist and Kick

### 1. Manual Commands (Available Now)

#### A. Check Individual User
```javascript
// In private message to bot from admin:
#blacklst                    // List all blacklisted users
#blacklist 972555123456      // Add specific number to blacklist
#unblacklist 972555123456    // Remove from blacklist
```

#### B. Scan Group for Blacklisted Users
```javascript
// In group chat (admin only):
#botkick                     // Scans entire group and kicks all blacklisted users
```

### 2. Automatic Blacklist Enforcement

#### A. New User Joins Group
- **Location**: `index.js` lines 467-491
- **Function**: `handleGroupJoin()`
- **Process**:
  1. User joins group
  2. Bot checks if user is blacklisted using `isBlacklisted(participantId)`
  3. If blacklisted → automatically kicks user
  4. Sends alert to admin with group link

#### B. Invite Link Spam Detection
- **Location**: `index.js` lines 388-417
- **Process**:
  1. User posts invite link
  2. Bot deletes message
  3. Adds user to blacklist using `addToBlacklist(senderId, 'Sent invite link spam')`
  4. Kicks user from group

### 3. Blacklist Functions Available

#### Core Functions (from blacklistService.js):

```javascript
const { isBlacklisted, addToBlacklist, removeFromBlacklist, blacklistCache } = require('./services/blacklistService');

// Check if user is blacklisted
const userIsBlacklisted = await isBlacklisted(userId);

// Add to blacklist
await addToBlacklist(userId, 'Reason for blacklisting');

// Remove from blacklist  
await removeFromBlacklist(userId);

// Get all blacklisted users (from cache)
const allBlacklisted = Array.from(blacklistCache);
```

### 4. User ID Formats Supported

The blacklist system handles multiple WhatsApp ID formats:

```javascript
// Regular format
"972555123456@s.whatsapp.net"

// LID format (newer WhatsApp)
"169050567106697@lid"

// Phone number only
"972555123456"

// Old format
"972555123456@c.us"
```

### 5. How to Implement Custom Blacklist Check & Kick

#### Example: Check All Group Members and Kick Blacklisted Users

```javascript
async function scanAndKickBlacklisted(sock, groupId) {
    try {
        // Get group metadata
        const groupMetadata = await sock.groupMetadata(groupId);
        const participants = groupMetadata.participants;
        
        console.log(`🔍 Scanning ${participants.length} members for blacklisted users...`);
        
        const blacklistedUsers = [];
        
        // Check each participant
        for (const participant of participants) {
            const userId = participant.id;
            const phoneNumber = userId.split('@')[0];
            
            // Skip admins and bot
            if (participant.admin === 'admin' || participant.admin === 'superadmin') {
                continue;
            }
            
            // Check if blacklisted
            if (await isBlacklisted(userId)) {
                blacklistedUsers.push({
                    id: userId,
                    phone: phoneNumber
                });
                console.log(`🚫 Found blacklisted user: ${phoneNumber}`);
            }
        }
        
        // Kick blacklisted users
        for (const user of blacklistedUsers) {
            try {
                await sock.groupParticipantsUpdate(groupId, [user.id], 'remove');
                console.log(`✅ Kicked blacklisted user: ${user.phone}`);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`❌ Failed to kick ${user.phone}:`, error.message);
            }
        }
        
        return blacklistedUsers.length;
    } catch (error) {
        console.error('❌ Error scanning for blacklisted users:', error);
        return 0;
    }
}
```

### 6. Current Working Commands

#### In Private Chat (Admin Only):
- `#help` - Shows all available commands (secret)
- `#blacklist 972555123456` - Add number to blacklist
- `#unblacklist 972555123456` - Remove from blacklist  
- `#blacklst` - List all blacklisted users
- `#stats` - Show blacklist statistics

#### In Group Chat (Admin Only):
- `#botkick` - Scan group and kick all blacklisted users
- `#kick` - Reply to message + kick user (also adds to blacklist)
- `#ban` - Reply to message + ban user (adds to blacklist)

### 7. Firebase Integration

#### Data Structure:
```
blacklist/
  ├── 972555123456
  │   ├── addedAt: "2025-07-27T12:00:00.000Z"
  │   ├── reason: "Sent invite link spam"
  │   └── originalId: "972555123456@s.whatsapp.net"
  └── 169050567106697
      ├── addedAt: "2025-07-27T15:57:03.000Z"
      ├── reason: "Sent invite link spam"
      └── originalId: "169050567106697@lid"
```

### 8. Testing Blacklist Functions

#### Test Script:
```bash
# Test Firebase connection
node testFirebase.js

# Test blacklist functions directly
node -e "
const { isBlacklisted, addToBlacklist } = require('./services/blacklistService');
(async () => {
  console.log('Testing blacklist...');
  await addToBlacklist('test123', 'Testing');
  const result = await isBlacklisted('test123');
  console.log('Is blacklisted:', result);
})();
"
```

### 9. Alert Messages Include Group Links

When blacklisted users are detected/kicked, admin receives:
```
🚨 Blacklisted User Auto-Kicked

📍 Group: Group Name
🔗 Group Link: https://chat.whatsapp.com/ABC123DEF456
👤 User: 169050567106697@lid
⏰ Time: 27/07/2025 15:57:03
```

### 10. Important Notes

- ✅ **Automatic**: Bot automatically kicks blacklisted users who join groups
- ✅ **Real-time**: Uses in-memory cache for fast blacklist checks
- ✅ **Persistent**: All blacklist data stored in Firebase
- ✅ **Multiple formats**: Supports all WhatsApp ID formats (regular, LID, phone)
- ✅ **Admin protection**: Cannot blacklist or kick group admins
- ✅ **Rate limiting**: Delays between kicks to avoid WhatsApp limits
- ✅ **Alerts**: Admin gets notifications with clickable group links

### 11. Quick Commands Reference

| Command | Location | Function |
|---------|----------|----------|
| `#botkick` | Group | Scan & kick all blacklisted users |
| `#blacklist [number]` | Private/Group | Add to blacklist |
| `#unblacklist [number]` | Private/Group | Remove from blacklist |
| `#blacklst` | Private/Group | List blacklisted users |
| `#kick` (reply) | Group | Kick user & add to blacklist |
| `#ban` (reply) | Group | Ban user (same as kick + blacklist) |

The blacklist system is fully functional and ready to use! 🛡️