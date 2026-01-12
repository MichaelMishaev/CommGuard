---
name: bot-command-development
description: Patterns and best practices for adding new bot commands to bCommGuard
tags: [development, commands, whatsapp, patterns]
---

# Bot Command Development Skill

This skill guides you through adding new commands to bCommGuard following established patterns.

## Command Architecture

### Command Handler Location
All commands are processed in: `services/commandHandler.js`

### Command Flow
1. **Message Reception** → `index.js` → `handleMessage()`
2. **Command Detection** → Check for `#` prefix
3. **Admin Verification** → Check if user is admin/superadmin
4. **Command Routing** → `commandHandler.handleCommand()`
5. **Command Execution** → Specific command handler method
6. **Response** → Send reply to user

## Command Types

### 1. Group Commands (Admin Only)
- Require group context
- Require admin privileges
- Examples: `#kick`, `#ban`, `#mute`, `#warn`

### 2. Private Commands (Admin Only)
- Work in private chat only
- Require admin privileges
- Examples: `#blacklist`, `#whitelist`, `#status`

### 3. Universal Commands
- Work in both group and private
- May or may not require admin
- Examples: `#help`, `#stats`

## Adding a New Group Command

### Step 1: Define Command Handler Method

In `services/commandHandler.js`, add new method:

```javascript
async handleNewCommand(msg, args, isAdmin, isSuperAdmin) {
    // 1. Verify group context
    if (this.isPrivateChat(msg)) {
        await this.sendGroupOnlyMessage(msg, '#newcommand');
        return;
    }

    // 2. Verify admin privileges
    if (!isAdmin) {
        const sassyResponse = this.getRandomSassyResponse();
        await this.sock.sendMessage(msg.key.remoteJid, { text: sassyResponse });
        return;
    }

    // 3. Parse arguments
    const param1 = args[0];
    const param2 = args[1];

    if (!param1) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Usage: #newcommand <param1> [param2]'
        });
        return;
    }

    // 4. Get group metadata
    const groupId = msg.key.remoteJid;
    try {
        const groupMetadata = await this.getCachedGroupMetadata(groupId);

        // 5. Perform command logic
        // ... your command implementation ...

        // 6. Send success response
        await this.sock.sendMessage(groupId, {
            text: `✅ Command executed successfully`
        });

    } catch (error) {
        console.error(`Error in #newcommand:`, error);
        await this.sock.sendMessage(groupId, {
            text: `❌ Error: ${error.message}`
        });
    }
}
```

### Step 2: Add to Command Router

In `handleCommand()` method, add case:

```javascript
async handleCommand(msg, command, args, isAdmin, isSuperAdmin) {
    const cmd = command.toLowerCase();

    // ... existing cases ...

    switch (cmd) {
        // ... existing commands ...

        case '#newcommand':
            await this.handleNewCommand(msg, args, isAdmin, isSuperAdmin);
            break;

        // ... rest of commands ...
    }
}
```

### Step 3: Update Help Text

Add command to help documentation:

```javascript
// In help text for group commands
הפקודות הזמינות בקבוצה:
...
• #newcommand <param1> - תיאור הפקודה
```

## Adding a New Private Command

### Step 1: Define Handler Method

```javascript
async handlePrivateNewCommand(msg, args, isAdmin) {
    // 1. Verify private context
    if (!this.isPrivateChat(msg)) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ This command only works in private chat'
        });
        return;
    }

    // 2. Verify admin privileges
    if (!isAdmin) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Admin only command'
        });
        return;
    }

    // 3. Parse arguments
    const phone = args[0];

    if (!phone) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Usage: #newprivatecommand <phone>'
        });
        return;
    }

    // 4. Perform operation
    try {
        // ... your logic ...

        await this.sock.sendMessage(msg.key.remoteJid, {
            text: `✅ Operation completed for ${phone}`
        });

    } catch (error) {
        console.error('Error:', error);
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: `❌ Error: ${error.message}`
        });
    }
}
```

### Step 2: Add to Router

```javascript
case '#newprivatecommand':
    await this.handlePrivateNewCommand(msg, args, isAdmin);
    break;
```

## Command Patterns

### Pattern 1: Reply-Based Commands

For commands that act on replied messages:

```javascript
async handleReplyCommand(msg, args, isAdmin) {
    // Get quoted message
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Reply to a message to use this command'
        });
        return;
    }

    // Get target user ID
    const targetUser = msg.message.extendedTextMessage.contextInfo.participant;

    // Perform action on target user
    // ...
}
```

**Used by**: `#kick`, `#ban`, `#warn`

### Pattern 2: Timed Commands

For commands with duration parameters:

```javascript
async handleTimedCommand(msg, args, isAdmin) {
    const duration = parseInt(args[0]) || 30; // Default 30 minutes

    if (duration < 1 || duration > 1440) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '⚠️ Duration must be 1-1440 minutes'
        });
        return;
    }

    const expiresAt = Date.now() + (duration * 60 * 1000);

    // Store with expiration
    // ...
}
```

**Used by**: `#mute`

### Pattern 3: List Commands

For commands that display lists:

```javascript
async handleListCommand(msg, args, isAdmin) {
    const items = await getItems(); // Get data

    if (items.length === 0) {
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '📋 List is empty'
        });
        return;
    }

    const list = items.map((item, i) => `${i + 1}. ${item}`).join('\n');

    await this.sock.sendMessage(msg.key.remoteJid, {
        text: `📋 Items (${items.length}):\n\n${list}`
    });
}
```

**Used by**: `#blacklst`, `#whitelst`

### Pattern 4: Interactive Commands

For commands with multi-step interaction:

```javascript
async handleInteractiveCommand(msg, args, isAdmin) {
    const step = this.interactionState.get(userId) || 1;

    switch (step) {
        case 1:
            // Ask for first input
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: '📝 Please provide [input]:'
            });
            this.interactionState.set(userId, 2);
            break;

        case 2:
            // Process first input, ask for second
            const input1 = msg.message.conversation;
            // ... process ...
            this.interactionState.set(userId, 3);
            break;

        case 3:
            // Complete interaction
            this.interactionState.delete(userId);
            break;
    }
}
```

**Used by**: Global ban with group selection

## Best Practices

### 1. Error Handling
```javascript
try {
    // Command logic
} catch (error) {
    console.error(`Error in #command:`, error);
    await this.sock.sendMessage(msg.key.remoteJid, {
        text: `❌ Error: ${error.message}`
    });
}
```

### 2. Input Validation
```javascript
// Always validate arguments
if (!args[0] || args[0].length < 3) {
    await this.sock.sendMessage(msg.key.remoteJid, {
        text: '⚠️ Invalid input'
    });
    return;
}
```

### 3. Permission Checks
```javascript
// Check admin status
if (!isAdmin) {
    const sassyResponse = this.getRandomSassyResponse();
    await this.sock.sendMessage(msg.key.remoteJid, { text: sassyResponse });
    return;
}

// Check superadmin for critical operations
if (!isSuperAdmin && criticalOperation) {
    await this.sock.sendMessage(msg.key.remoteJid, {
        text: '⚠️ Superadmin only'
    });
    return;
}
```

### 4. Rate Limiting
```javascript
const lastUse = this.commandCooldowns.get(`${userId}_${command}`) || 0;
const cooldown = 5000; // 5 seconds

if (Date.now() - lastUse < cooldown) {
    await this.sock.sendMessage(msg.key.remoteJid, {
        text: '⏳ Please wait before using this command again'
    });
    return;
}

this.commandCooldowns.set(`${userId}_${command}`, Date.now());
```

### 5. Hebrew Responses
```javascript
// Use Hebrew for user-facing messages
await this.sock.sendMessage(msg.key.remoteJid, {
    text: '✅ הפעולה בוצעה בהצלחה'
});
```

### 6. Logging
```javascript
console.log(`${getTimestamp()} #command executed by ${senderPhone} in ${groupId}`);
```

## Testing New Commands

### 1. Create Test File

Create `tests/testNewCommand.js`:

```javascript
const config = require('../config');

async function testNewCommand() {
    console.log('Testing #newcommand...');

    // Simulate message
    const mockMsg = {
        key: {
            remoteJid: '120363123456789@g.us',
            fromMe: false
        },
        message: {
            conversation: '#newcommand test'
        }
    };

    // Test with admin
    const isAdmin = true;
    const isSuperAdmin = false;
    const args = ['test'];

    // Create command handler instance
    const mockSock = {
        sendMessage: async (jid, content) => {
            console.log(`Message to ${jid}:`, content.text);
        },
        groupMetadata: async (groupId) => ({
            id: groupId,
            subject: 'Test Group',
            participants: []
        })
    };

    const CommandHandler = require('../services/commandHandler');
    const handler = new CommandHandler(mockSock);

    // Execute command
    try {
        await handler.handleNewCommand(mockMsg, args, isAdmin, isSuperAdmin);
        console.log('✅ Test passed');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testNewCommand().catch(console.error);
```

### 2. Run Test
```bash
node tests/testNewCommand.js
```

### 3. Add to Comprehensive QA
Add test case to `tests/comprehensiveQA.js`

## Common Mistakes to Avoid

### ❌ Don't:
1. **Skip error handling** - Always wrap in try-catch
2. **Forget admin checks** - Verify permissions first
3. **Hardcode group IDs** - Use msg.key.remoteJid
4. **Ignore context** - Check if private/group chat
5. **Missing input validation** - Always validate args
6. **Forget logging** - Log all command executions
7. **Skip testing** - Test before deploying

### ✅ Do:
1. **Follow existing patterns** - Use established command structure
2. **Handle all errors** - Graceful error messages
3. **Validate permissions** - Check admin/superadmin
4. **Validate inputs** - Check args before using
5. **Test thoroughly** - Create test file
6. **Document usage** - Update help text
7. **Log operations** - Track command usage

## Command Naming Conventions

### Naming Rules
- Start with `#` prefix
- Use lowercase
- Use descriptive names
- Keep short (1-2 words)

### Examples
- ✅ `#kick`, `#mute`, `#stats`
- ❌ `kickUser`, `MuteCommand`, `show_statistics`

## Deployment Checklist

Before deploying new command:

- [ ] Command handler method created
- [ ] Router case added
- [ ] Help text updated
- [ ] Test file created
- [ ] Tested locally
- [ ] Error handling implemented
- [ ] Permission checks added
- [ ] Input validation added
- [ ] Logging added
- [ ] Code reviewed
- [ ] Committed to git
- [ ] Deployed to production
- [ ] Verified in production

## Documentation

After adding command, document in:

1. **CLAUDE.md** - Add to bot commands section
2. **Help text** - Update in commandHandler.js
3. **README** - Update features list (if applicable)
4. **CHANGELOG** - Add to version history
