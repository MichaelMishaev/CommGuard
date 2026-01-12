---
name: redis-bug-tracking
description: Bug tracking system using Redis for bCommGuard - find, fix, and mark bugs reported with # prefix
tags: [redis, bug-tracking, debugging, user-feedback]
---

# Redis Bug Tracking Skill

This skill guides you through the Redis-based bug tracking system where users report bugs with `#` prefix in WhatsApp.

## How the System Works

1. **User Reports Bug**: User sends message starting with `#` (e.g., "#bug - show only future events")
2. **Auto-Saved to Redis**: Message instantly saved to `user_messages` list with `status: "pending"`
3. **Claude Finds Bugs**: When user says "fix all # bugs", search Redis for pending bugs only
4. **Mark as Fixed**: After fixing, update status to `"fixed"` with timestamp and commit hash
5. **Next Session**: Only pending bugs are shown, fixed bugs are ignored

## Data Structure

```json
{
  "timestamp": "2025-10-17T09:08:00Z",
  "messageText": "#bug - show only future events",
  "userId": "972501234567@s.whatsapp.net",
  "phone": "972501234567",
  "direction": "incoming",
  "status": "pending"  // or "fixed"
}
```

## Finding Pending Bugs

### Command Pattern
```javascript
// Get all user messages from Redis
const messages = await redis.lrange('user_messages', 0, -1);

// Parse and filter for pending bugs
const pendingBugs = messages
  .map(msg => JSON.parse(msg))
  .filter(msg =>
    msg.messageText.startsWith('#') &&
    msg.status === 'pending'
  );

// Sort by timestamp (oldest first)
pendingBugs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
```

### Expected Output Format
```
Found 3 pending bugs:

1. [2026-01-10 09:15] #bug - mute command not working
   User: 972501234567

2. [2026-01-11 14:32] #clear command fails to delete messages
   User: 972509876543

3. [2026-01-12 08:45] #enhancement - clear should delete last 10 messages
   User: 972501234567
```

## Fixing Workflow

### Step 1: List All Pending Bugs
```bash
# Connect to Redis (if running locally)
redis-cli

# Or use Node.js script
node check-prod-redis.js
```

### Step 2: Work on Each Bug
For each bug:

1. **Understand the issue**:
   - Read bug description carefully
   - Check related code files
   - Reproduce if possible

2. **Implement fix**:
   - Make code changes
   - Test thoroughly
   - Commit to git

3. **Mark as fixed**:
   ```javascript
   // After fixing bug #1
   const bugIndex = 0; // First bug in the list
   const bug = pendingBugs[bugIndex];

   // Update status
   bug.status = "fixed";
   bug.fixedAt = new Date().toISOString();
   bug.commitHash = "a41e6c8"; // From git log
   bug.fixDescription = "Fixed admin status check in commandHandler.js:245";

   // Save back to Redis
   await redis.lset('user_messages', originalIndex, JSON.stringify(bug));
   ```

### Step 3: Verify Fix Works
```bash
# Run relevant tests
npm test
node tests/comprehensiveQA.js

# Deploy to production
# (Use whatsapp-bot-deployment skill)
```

### Step 4: Notify User (Optional)
Send WhatsApp message to user confirming fix:
```
✅ Bug fixed: [bug description]
Commit: a41e6c8
Deployed: 2026-01-12 15:30
```

## Redis Commands Reference

### View All Messages
```bash
# Get total count
redis-cli LLEN user_messages

# Get all messages
redis-cli LRANGE user_messages 0 -1

# Get last 10 messages
redis-cli LRANGE user_messages -10 -1
```

### Search for Bugs
```bash
# Get all and filter manually
redis-cli LRANGE user_messages 0 -1 | grep "#"
```

### Update Bug Status
```javascript
// Node.js example
const Redis = require('ioredis');
const redis = new Redis();

async function markBugFixed(bugIndex, commitHash, description) {
  const messages = await redis.lrange('user_messages', 0, -1);
  const bug = JSON.parse(messages[bugIndex]);

  bug.status = 'fixed';
  bug.fixedAt = new Date().toISOString();
  bug.commitHash = commitHash;
  bug.fixDescription = description;

  await redis.lset('user_messages', bugIndex, JSON.stringify(bug));
  console.log(`✅ Marked bug as fixed: ${bug.messageText}`);
}
```

## Important Rules

### ✅ DO:
- **Always check `status !== 'fixed'`** when searching for bugs
- **Always mark bugs as fixed** after implementing the solution
- **Include commit hash** when marking fixed (for traceability)
- **Test fixes thoroughly** before marking as fixed
- **Document fix** in commit message

### ❌ DON'T:
- **Never work on already-fixed bugs** (status="fixed")
- **Never delete bug records** from Redis
- **Never mark as fixed** without testing
- **Never skip commit hash** when marking fixed
- **Never change bug message text** (preserve original)

## Bug Categorization

### Bug Types
- `#bug` - Something broken that needs fixing
- `#enhancement` - Feature improvement request
- `#feature` - New feature request
- `#question` - User question (may not be bug)

### Priority Levels (Inferred)
1. **Critical**: Bot crashes, data loss, security issues
2. **High**: Core features broken (#kick, #mute, link detection)
3. **Medium**: Secondary features not working (#clear, #stats)
4. **Low**: UI/UX improvements, nice-to-haves

## Automation Script

Create a helper script `check-pending-bugs.js`:

```javascript
const Redis = require('ioredis');
const redis = new Redis();

async function checkPendingBugs() {
  const messages = await redis.lrange('user_messages', 0, -1);
  const bugs = messages
    .map((msg, index) => ({ ...JSON.parse(msg), originalIndex: index }))
    .filter(msg => msg.messageText.startsWith('#') && msg.status === 'pending')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log(`\n📋 Found ${bugs.length} pending bugs:\n`);

  bugs.forEach((bug, i) => {
    const date = new Date(bug.timestamp).toLocaleString();
    console.log(`${i + 1}. [${date}] ${bug.messageText}`);
    console.log(`   User: ${bug.phone}`);
    console.log(`   Index: ${bug.originalIndex}\n`);
  });

  await redis.quit();
}

checkPendingBugs().catch(console.error);
```

## Production Redis Access

```bash
# SSH to production server
ssh root@209.38.231.184

# Check Redis is running
redis-cli ping

# View pending bugs
node check-pending-bugs.js
```

## Reporting Bug Fix Summary

After fixing session, create summary:

```markdown
## Bug Fix Session - 2026-01-12

### Fixed (3 bugs):
1. ✅ #bug - mute command not working
   - Commit: a41e6c8
   - Fix: Added bot admin status check
   - File: services/commandHandler.js:245

2. ✅ #clear command fails to delete messages
   - Commit: b52f7d9
   - Fix: Implemented proper message deletion
   - File: services/commandHandler.js:567

3. ✅ #enhancement - clear deletes last 10 messages
   - Commit: c63e8a0
   - Fix: Added message limit parameter
   - File: services/commandHandler.js:570

### Pending (2 bugs):
1. ⏳ #bug - link sharing needs PHONE_ALERT
2. ⏳ #feature - add auto-translate Russian
```

## Best Practices

1. **Batch Processing**: Fix multiple related bugs in same session
2. **Test Each Fix**: Don't mark as fixed until tested
3. **Git Commit per Bug**: One bug = one commit (easy rollback)
4. **Document Well**: Clear commit messages with bug reference
5. **Update CLAUDE.local.md**: Remove fixed bugs from known issues
6. **Monitor Production**: Verify fixes work after deployment

## Troubleshooting

### Redis Connection Failed
```bash
# Check Redis is running
redis-cli ping

# Restart Redis if needed
sudo service redis restart
```

### Cannot Find Bugs
```bash
# Verify data exists
redis-cli LLEN user_messages

# Check data format
redis-cli LINDEX user_messages 0
```

### Wrong Index After Filter
```javascript
// Always store original index during filter
const bugs = messages
  .map((msg, index) => ({ ...JSON.parse(msg), originalIndex: index }))
  .filter(msg => msg.messageText.startsWith('#'));

// Use originalIndex when updating
await redis.lset('user_messages', bug.originalIndex, JSON.stringify(bug));
```
