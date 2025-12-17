# Database Architecture - CommGuard Bot

## 🏗️ How the Bot Works - Complete Architecture

### Deployment Model

```
┌─────────────────────────────────────────────────────────┐
│  VPS Server: 209.38.231.184 (SSH)                      │
│  ├── Operating System: Linux                            │
│  ├── Process Manager: PM2 (commguard-bot)              │
│  ├── Bot Process: Node.js (index.js)                   │
│  │   ├── Baileys WebSocket Connection                  │
│  │   ├── WhatsApp Multi-Device Session                 │
│  │   └── Message Handlers & Services                   │
│  └── Auth State: /root/CommGuard/baileys_auth_info/    │
└─────────────────────────────────────────────────────────┘
                         ↓ ↓ ↓
    ┌──────────────┬─────────────┬──────────────────┐
    ↓              ↓             ↓                  ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│ Railway  │  │ Railway  │  │ Firebase │  │ Local Cache  │
│ Postgres │  │  Redis   │  │ Firestore│  │  (Memory)    │
│ shinkansen│  │ nozomi   │  │  Guard1  │  │              │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘
```

### Why This Architecture?

1. **VPS (209.38.231.184)** - Runs the bot process
   - ✅ Full control over bot process
   - ✅ Persistent WebSocket connection to WhatsApp
   - ✅ Stores WhatsApp session authentication
   - ✅ Low latency for message processing

2. **Railway Databases** - Managed database services
   - ✅ No database maintenance needed
   - ✅ Automatic backups and scaling
   - ✅ High availability (99.9% uptime)
   - ✅ Easy connection from VPS

3. **Firebase** - Optional legacy storage
   - ⚙️ Being phased out (still enabled for backwards compatibility)
   - Used for: whitelist, muted users, some blacklist data

### Message Processing Flow

```
WhatsApp User sends message
          ↓
Baileys WebSocket receives event
          ↓
index.js → handleMessage()
          ↓
    ┌─────┴──────┐
    ↓            ↓
Private Chat   Group Chat
    ↓            ↓
Command      Link Detection
Handler      & Auto-Kick
    ↓            ↓
    └─────┬──────┘
          ↓
Check Blacklist (Hybrid)
  1. Redis cache (0.095ms)
  2. PostgreSQL (0.65ms)
  3. Firebase (fallback)
          ↓
Execute Action
  - Delete message
  - Kick user
  - Send alert
  - Log to database
```

### Key Components

#### 1. **Main Bot Process** (`index.js`)
- Initializes WhatsApp connection via Baileys
- Handles QR code authentication
- Routes messages to appropriate handlers
- Manages reconnection logic
- Initializes all services on startup

#### 2. **Database Connections**
```javascript
// index.js:329-347
const { initDatabase } = require('./database/connection');
const { initRedis } = require('./services/redisService');

// Initialize PostgreSQL (Railway)
if (process.env.DATABASE_URL) {
    initDatabase(process.env.DATABASE_URL);
}

// Initialize Redis (Railway)
if (process.env.REDIS_URL) {
    initRedis(process.env.REDIS_URL);
}
```

#### 3. **Service Layer**
- `services/blacklistService.js` - Firebase blacklist management
- `services/whitelistService.js` - User whitelist management
- `services/muteService.js` - Mute timers and management
- `services/redisService.js` - Redis caching and rate limiting
- `services/commandHandler.js` - Admin command processing
- `database/groupService.js` - PostgreSQL CRUD operations

#### 4. **Command Processing**
```javascript
// User sends: "#kick" (reply to message)
commandHandler.handleCommand(msg, sock)
  ↓
commandHandler.kick()
  ↓
1. Verify admin privileges
2. Extract user from replied message
3. Check bot admin status
4. Execute kick via Baileys
5. Add to blacklist (PostgreSQL + Redis + Firebase)
6. Send confirmation message
7. Log action to audit_log table
```

### Bot Startup Sequence

When the bot starts (via `pm2 start` or `npm start`), it follows this initialization sequence:

```
1. Load Environment Variables
   ├── DATABASE_URL (Railway Postgres)
   ├── REDIS_URL (Railway Redis)
   ├── ADMIN_PHONE
   └── ALERT_PHONE

2. Initialize Databases
   ├── PostgreSQL Connection Pool (database/connection.js)
   ├── Redis Client (services/redisService.js)
   └── Firebase Admin SDK (firebaseConfig.js)

3. Initialize Services
   ├── Blacklist Service (memory + Firebase)
   ├── Whitelist Service (memory + Firebase)
   ├── Mute Service (memory + Firebase)
   ├── Motivational Phrases (164 phrases loaded)
   ├── Kicked User Service (memory cache)
   └── Unblacklist Request Service (Firebase)

4. WhatsApp Connection
   ├── Load auth state from baileys_auth_info/
   ├── Connect to WhatsApp via WebSocket
   ├── If no session: Show QR code
   ├── If session exists: Auto-connect
   └── Wait for "connection.update" → "open"

5. Bot Online
   ├── Send startup message to admin
   ├── Log startup to bot_restarts table (PostgreSQL)
   ├── Start message handlers
   └── Begin monitoring all groups
```

**Typical startup time:** 3-5 seconds (with existing session)

### Bot Restart Tracking

All bot restarts are logged to PostgreSQL for monitoring:

```sql
-- bot_restarts table
CREATE TABLE bot_restarts (
    id SERIAL PRIMARY KEY,
    restart_timestamp TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20),              -- 'connecting', 'connected', 'error'
    qr_code_shown BOOLEAN,
    blacklist_count INTEGER,
    groups_count INTEGER,
    postgres_connected BOOLEAN,
    redis_connected BOOLEAN,
    error_message TEXT,
    connection_attempts INTEGER DEFAULT 0
);
```

**Usage:**
```javascript
// services/botRestartLogger.js
logBotRestart({
    status: 'connected',
    qrCodeShown: false,
    blacklistCount: 45,
    groupsCount: 180,
    postgresConnected: true,
    redisConnected: true
});
```

**View recent restarts:**
```sql
SELECT * FROM v_recent_bot_activity LIMIT 5;
```

### Deployment Process

#### Deploying Code Updates

```bash
# 1. Commit changes locally
git add .
git commit -m "Fix: your changes"

# 2. Push to GitHub (triggers no auto-deploy)
git push origin main

# 3. Deploy to production VPS
./DEPLOY_WHEN_ONLINE.sh
```

**What `DEPLOY_WHEN_ONLINE.sh` does:**
```bash
1. Push to GitHub
2. SSH into 209.38.231.184
3. cd /root/CommGuard
4. git pull origin main
5. Apply database migrations (if any)
6. pm2 restart commguard-bot
7. Show PM2 status + logs
```

#### Manual Deployment (SSH)

```bash
# SSH into production server
ssh root@209.38.231.184

# Navigate to bot directory
cd /root/CommGuard

# Pull latest code
git pull origin main

# Install dependencies (if package.json changed)
npm install

# Restart bot
pm2 restart commguard-bot

# Check status
pm2 status

# View logs
pm2 logs commguard-bot --lines 50
```

### Why Bot Restarts

Common reasons the bot restarts:

1. **Manual Restart** (Expected)
   - Code deployment via `pm2 restart commguard-bot`
   - Environment variable changes
   - System maintenance

2. **Automatic Restart by PM2** (Crash Recovery)
   - Unhandled exception in code
   - Memory limit exceeded (default: 1.5GB)
   - Connection errors reaching max attempts

3. **WhatsApp Session Issues** (Connection Problems)
   - Error 515 (Stream Error) - WhatsApp rate limiting
   - Error 408 (Connection Timeout) - Network issues
   - Error 428 (Connection Terminated) - Forced disconnect
   - Max reconnection attempts reached (10 attempts)

4. **Server Reboot** (Infrastructure)
   - VPS maintenance
   - Kernel updates
   - Power loss (rare)

**Current Status Check:**
```bash
# On production server
pm2 status                    # Check if bot is running
pm2 logs --lines 100          # View recent logs
node -e "console.log(process.uptime())"  # Check bot uptime
```

### Production Server Details

**VPS Information:**
- **IP:** 209.38.231.184
- **Access:** `ssh root@209.38.231.184`
- **Bot Directory:** `/root/CommGuard`
- **PM2 Process Name:** `commguard-bot`
- **Node Version:** 20.x
- **OS:** Linux

**Important Files on Server:**
```
/root/CommGuard/
├── index.js                    # Main bot process
├── .env                        # Environment variables (DATABASE_URL, REDIS_URL)
├── baileys_auth_info/          # WhatsApp session authentication
├── services/                   # Bot services
├── database/                   # Database operations
└── package.json                # Dependencies
```

**PM2 Commands:**
```bash
pm2 start index.js --name commguard-bot    # Start bot
pm2 restart commguard-bot                  # Restart bot
pm2 stop commguard-bot                     # Stop bot
pm2 logs commguard-bot                     # View logs (live)
pm2 logs commguard-bot --lines 100         # View last 100 lines
pm2 delete commguard-bot                   # Remove from PM2
pm2 status                                 # Show all processes
```

---

## 📊 Database Architecture

### Overview

CommGuard uses a **hybrid database architecture** combining:
- **PostgreSQL 17.7** (Railway) - Permanent storage for users, groups, and relationships
- **Redis 8.2.1** (Railway) - Fast caching for blacklist checks, rate limiting, mute timers
- **Firebase Firestore** (Optional) - Legacy storage, being phased out

**Performance:** Redis delivers 85% faster reads (893K req/sec) compared to PostgreSQL (15K tx/sec).

**Cost:** ~$10/month total ($5 PostgreSQL + $5 Redis on Railway.com, first month free).

---

## Connection Details

### Environment Variables (in `.env`)

```bash
# PostgreSQL (Railway)
DATABASE_URL=postgresql://postgres:PlTptKgSDCyPPhXFbzFTMhilJWkqceTC@shinkansen.proxy.rlwy.net:16874/railway

# Redis (Railway)
REDIS_URL=redis://default:ZuAAJWNzQjMbUhVsOFcIjtDsnwlGGmfH@nozomi.proxy.rlwy.net:34159
```

**IMPORTANT:** These credentials are:
-  Stored in `.env` (git-ignored)
-  Deployed to production server via SSH (NOT pushed to GitHub)
-  Set up in Railway.com dashboard under "Variables"

### Connection Status

Test connections anytime with:
```bash
node test-connections.js
```

Expected output:
```
 PostgreSQL 17.7 connected
 Redis 8.2.1 connected
```

---

## PostgreSQL Schema

### Tables

#### 1. `users` - All unique phone numbers
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    lid VARCHAR(50) UNIQUE,                    -- WhatsApp LID (multi-device ID)
    country_code VARCHAR(10),                  -- e.g., '972', '1', '44'
    is_blacklisted BOOLEAN DEFAULT false,
    is_whitelisted BOOLEAN DEFAULT false,
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    total_groups INTEGER DEFAULT 0,
    INDEX idx_phone (phone_number),
    INDEX idx_blacklist (is_blacklisted),
    INDEX idx_country (country_code)
);
```

#### 2. `groups` - All WhatsApp groups
```sql
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    whatsapp_group_id VARCHAR(50) NOT NULL UNIQUE,  -- e.g., '120363123456789@g.us'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creation_timestamp BIGINT,                      -- Unix timestamp
    owner_phone VARCHAR(20),
    member_count INTEGER DEFAULT 0,
    admin_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMP DEFAULT NOW(),
    INDEX idx_group_id (whatsapp_group_id),
    INDEX idx_active (is_active)
);
```

#### 3. `group_members` - User-Group relationships (junction table)
```sql
CREATE TABLE group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT false,
    is_super_admin BOOLEAN DEFAULT false,
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT unique_user_per_group UNIQUE (group_id, user_id),
    INDEX idx_group_members (group_id, user_id),
    INDEX idx_active_members (is_active)
);
```

#### 4. `audit_log` - Action tracking
```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,                    -- 'kick', 'ban', 'blacklist', etc.
    group_id INTEGER REFERENCES groups(id),
    user_id INTEGER REFERENCES users(id),
    admin_phone VARCHAR(20),
    details JSONB,
    INDEX idx_timestamp (timestamp),
    INDEX idx_action (action)
);
```

### Views (Pre-computed Queries)

#### `v_active_group_members` - All current memberships
```sql
CREATE VIEW v_active_group_members AS
SELECT
    g.name as group_name,
    u.phone_number,
    u.country_code,
    gm.is_admin,
    gm.joined_at
FROM group_members gm
JOIN groups g ON gm.group_id = g.id
JOIN users u ON gm.user_id = u.id
WHERE gm.is_active = true AND g.is_active = true;
```

#### `v_group_stats` - Group statistics
```sql
CREATE VIEW v_group_stats AS
SELECT
    g.name,
    g.member_count,
    g.admin_count,
    COUNT(CASE WHEN u.is_blacklisted THEN 1 END) as blacklisted_count,
    g.last_sync
FROM groups g
LEFT JOIN group_members gm ON g.id = gm.group_id
LEFT JOIN users u ON gm.user_id = u.id
WHERE g.is_active = true
GROUP BY g.id;
```

#### `v_user_activity` - User statistics
```sql
CREATE VIEW v_user_activity AS
SELECT
    u.phone_number,
    u.country_code,
    u.is_blacklisted,
    u.total_groups as group_count,
    COUNT(CASE WHEN gm.is_admin THEN 1 END) as admin_in_groups
FROM users u
LEFT JOIN group_members gm ON u.id = gm.user_id
WHERE gm.is_active = true
GROUP BY u.id;
```

### Auto-Updating Triggers

Member counts are automatically updated by triggers:
```sql
CREATE TRIGGER update_group_member_count
AFTER INSERT OR UPDATE OR DELETE ON group_members
FOR EACH ROW EXECUTE FUNCTION update_member_counts();
```

---

## Redis Cache Structure

### Key Patterns

#### Blacklist Cache (24-hour TTL)
```
blacklist:{phone_number} = "1"
Example: blacklist:972544345287 = "1"
```

#### Rate Limiting (60-second window)
```
ratelimit:{key} = counter (expires after 60s)
Example: ratelimit:user_972544345287_kick = 3
```

#### Kick Cooldowns (10-second TTL)
```
cooldown:kick:{userId} = timestamp
Example: cooldown:kick:972544345287@s.whatsapp.net = "1733082393000"
```

#### Mute Timers (variable TTL)
```
mute:{userId} = expiry_timestamp
Example: mute:972544345287@s.whatsapp.net = "1733085993000"
```

#### General Cache (5-minute TTL)
```
cache:{key} = JSON_stringified_data
Example: cache:group_stats = "{\"total\":180,\"active\":175}"
```

### Redis Functions

Located in `services/redisService.js`:

```javascript
// Blacklist cache
cacheBlacklistedUser(phoneNumber, ttl = 86400)
isBlacklistedCached(phoneNumber)
removeFromBlacklistCache(phoneNumber)

// Rate limiting
isRateLimited(key, limit = 5, windowSeconds = 60)
getRateLimitRemaining(key, limit = 5)

// Kick cooldowns
setKickCooldown(userId, seconds = 10)
isInKickCooldown(userId)

// Mute timers
setMuteTimer(userId, minutes = 30)
isMuted(userId)
unmute(userId)

// General cache
cache(key, value, ttl = 300)
getCached(key)
deleteCached(key)
```

---

## Database Setup (One-Time)

### 1. Create Schema (Already Done)

Schema was created on Railway PostgreSQL with:
```bash
node database/create-schema.js
```

This created all tables, indexes, views, and triggers.

### 2. Test Connections

```bash
node test-connections.js
```

Expected output:
```
 PostgreSQL 17.7 connected
 Redis 8.2.1 connected
```

### 3. Run Migration (When Ready)

**IMPORTANT:** Migration must run on production server (209.38.231.184) where bot has active WhatsApp session.

```bash
ssh root@209.38.231.184
cd /root/CommGuard
npm run migrate
```

This will:
1. Connect to WhatsApp (requires active bot session)
2. Fetch all ~180 groups via `sock.groupFetchAllParticipating()`
3. Decode LID to phone numbers using `baileys_auth_info/lid-mapping-{LID}_reverse.json`
4. Insert users, groups, and memberships into PostgreSQL
5. Show statistics (total users, groups, memberships)

Expected migration time: **5-10 minutes** for 180 groups.

---

## Database Service Functions

Located in `database/groupService.js`:

### Group Operations
```javascript
getAllGroups()                          // Get all groups
getGroupByWhatsAppId(whatsappGroupId)   // Get single group
getGroupMembers(whatsappGroupId)        // Get members of group
```

### User Operations
```javascript
getUserByPhone(phoneNumber)             // Get user by phone
getUserGroups(phoneNumber)              // Get groups user is in
getUsersByCountry(countryCode)          // Get users by country
searchUsers(pattern)                    // Search users by phone pattern
exportAllPhoneNumbers()                 // Export all phone numbers
```

### Blacklist/Whitelist
```javascript
blacklistUser(phoneNumber, reason)      // Add to blacklist
unblacklistUser(phoneNumber)            // Remove from blacklist
getBlacklistedUsers()                   // Get all blacklisted users
```

### Analytics
```javascript
getDatabaseStats()                      // Get database statistics
getPowerUsers(limit = 10)               // Get most active users
```

### Audit Logging
```javascript
logAudit(action, details)               // Log admin action
```

---

## Usage Examples

### Example 1: Check if User is Blacklisted (Hybrid Approach)

```javascript
const { isBlacklistedCached } = require('./services/redisService');
const { getUserByPhone } = require('./database/groupService');

async function isUserBlacklisted(phoneNumber) {
    // 1. Check Redis cache first (fast)
    const cached = await isBlacklistedCached(phoneNumber);
    if (cached) return true;

    // 2. Check PostgreSQL (slower but authoritative)
    const user = await getUserByPhone(phoneNumber);

    // 3. Cache result if blacklisted
    if (user && user.is_blacklisted) {
        await cacheBlacklistedUser(phoneNumber);
        return true;
    }

    return false;
}
```

### Example 2: Get Group Statistics

```javascript
const { query } = require('./database/connection');

async function getGroupStats(whatsappGroupId) {
    const result = await query(`
        SELECT * FROM v_group_stats
        WHERE whatsapp_group_id = $1
    `, [whatsappGroupId]);

    return result.rows[0];
}
```

### Example 3: Rate Limit User Actions

```javascript
const { isRateLimited } = require('./services/redisService');

async function handleUserCommand(userId, command) {
    // Allow 5 commands per minute per user
    if (await isRateLimited(`user_${userId}_command`, 5, 60)) {
        return { error: 'Rate limit exceeded. Try again in 1 minute.' };
    }

    // Process command...
}
```

### Example 4: Export All Israeli Numbers

```javascript
const { getUsersByCountry } = require('./database/groupService');

async function exportIsraeliNumbers() {
    const users = await getUsersByCountry('972');
    return users.map(u => u.phone_number);
}
```

### Example 5: Log Admin Action

```javascript
const { logAudit } = require('./database/groupService');

async function kickUser(groupId, userId, adminPhone) {
    // Kick user logic...

    // Log the action
    await logAudit('kick', {
        group_id: groupId,
        user_id: userId,
        admin_phone: adminPhone,
        details: { reason: 'Posted invite link' }
    });
}
```

---

## Performance Optimization

### Query Optimization Tips

1. **Use Redis for frequent reads**
   - Blacklist checks: Redis (0.095ms) vs PostgreSQL (0.65ms)
   - Rate limiting: Always use Redis

2. **Use Views for complex queries**
   - `v_group_stats` - Pre-computed group statistics
   - `v_user_activity` - Pre-computed user statistics

3. **Use Indexes**
   - All foreign keys indexed
   - Phone numbers, WhatsApp IDs indexed
   - Blacklist status indexed

4. **Use Transactions for multi-step operations**
   ```javascript
   await transaction(async (client) => {
       await client.query('INSERT INTO users...');
       await client.query('INSERT INTO group_members...');
   });
   ```

### Cache Strategy

- **Blacklist**: Cache for 24 hours (rarely changes)
- **Rate limits**: Cache for 60 seconds (short-lived)
- **Mute timers**: Cache until expiry (self-cleaning)
- **Group stats**: Cache for 5 minutes (moderate updates)

---

## Monitoring and Maintenance

### Check Database Health

```javascript
const { getDatabaseStats } = require('./database/groupService');
const { getRedisStats } = require('./services/redisService');

async function checkHealth() {
    const pgStats = await getDatabaseStats();
    const redisStats = await getRedisStats();

    console.log('PostgreSQL:', pgStats);
    console.log('Redis:', redisStats);
}
```

### Common Queries

```sql
-- Total users by country
SELECT country_code, COUNT(*)
FROM users
GROUP BY country_code
ORDER BY COUNT(*) DESC;

-- Most popular groups
SELECT name, member_count
FROM groups
WHERE is_active = true
ORDER BY member_count DESC
LIMIT 10;

-- Blacklisted users
SELECT phone_number, country_code
FROM users
WHERE is_blacklisted = true;

-- Power users (in most groups)
SELECT * FROM v_user_activity
ORDER BY group_count DESC
LIMIT 10;

-- Recent admin actions
SELECT timestamp, action, admin_phone
FROM audit_log
ORDER BY timestamp DESC
LIMIT 50;
```

---

## Migration Notes

### LID Decoding

WhatsApp uses LID (Link ID) format for multi-device accounts:
- Format: `63278273298566@lid` (vs `972555020829@s.whatsapp.net`)
- Baileys stores mappings in `baileys_auth_info/lid-mapping-{LID}_reverse.json`
- Migration script automatically decodes LID � phone number
- See `docs/decodePhoneNUmber.md` for full details

### Migration Script Behavior

Located at `database/migrate-groups-to-db.js`:

1. Connects to WhatsApp (requires active session)
2. Fetches all groups: `sock.groupFetchAllParticipating()`
3. For each group:
   - Fetches full metadata: `sock.groupMetadata(groupId)`
   - Processes all participants
   - Decodes LID to phone numbers
   - Inserts to PostgreSQL (users � groups � memberships)
4. Shows final statistics

**Time estimate:** 5-10 minutes for 180 groups (500ms delay between groups).

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Test connection
psql "postgresql://postgres:PlTptKgSDCyPPhXFbzFTMhilJWkqceTC@shinkansen.proxy.rlwy.net:16874/railway"

# Check if DATABASE_URL is set
echo $DATABASE_URL
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -u redis://default:ZuAAJWNzQjMbUhVsOFcIjtDsnwlGGmfH@nozomi.proxy.rlwy.net:34159 ping

# Check if REDIS_URL is set
echo $REDIS_URL
```

### Migration Issues

**Error:** "WhatsApp connection timeout"
- **Cause:** Bot not running or already connected elsewhere
- **Solution:** Stop bot, run migration, restart bot

**Error:** "Could not decode LID"
- **Cause:** LID mapping file missing
- **Solution:** Migration stores LID as-is, will decode when mapping available

**Error:** "Duplicate key violation"
- **Cause:** User or group already exists
- **Solution:** Migration uses `ON CONFLICT DO UPDATE` (upsert), safe to re-run

---

## File Locations

```
bCommGuard/
   database/
      schema.sql                    # PostgreSQL schema (tables, views, triggers)
      connection.js                 # PostgreSQL connection pool manager
      groupService.js               # Database CRUD operations
      migrate-groups-to-db.js       # Migration script (WhatsApp � PostgreSQL)
      create-schema.js              # Schema creation script
      SETUP_GUIDE.md                # PostgreSQL setup walkthrough
      REDIS_SETUP.md                # Redis setup walkthrough
   services/
      redisService.js               # Redis caching, rate limiting, mute timers
   docs/
      databases.md                  # This file
      decodePhoneNUmber.md          # LID decoding guide
   test-connections.js               # Connection testing script
   .env                              # Environment variables (git-ignored)
```

---

## 📝 Summary for New AI Sessions

### Quick Architecture Reference

**Deployment Model:**
```
Bot Process (VPS 209.38.231.184)
    ↓
Railway Postgres + Railway Redis + Firebase
```

**Key Facts:**

1. **Bot Location:** VPS Server (209.38.231.184) via SSH
   - Process Manager: PM2 (`commguard-bot`)
   - Directory: `/root/CommGuard`
   - Auth: `/root/CommGuard/baileys_auth_info/`

2. **Database Architecture:**
   - **PostgreSQL 17.7** (Railway - shinkansen.proxy.rlwy.net)
   - **Redis 8.2.1** (Railway - nozomi.proxy.rlwy.net)
   - **Firebase Firestore** (Legacy - being phased out)

3. **Connection:** Set in `.env` on VPS
   - `DATABASE_URL=postgresql://...@shinkansen.proxy.rlwy.net`
   - `REDIS_URL=redis://...@nozomi.proxy.rlwy.net`

4. **Database Schema:**
   - 5 tables: `users`, `groups`, `group_members`, `audit_log`, `bot_restarts`
   - 3 views: `v_active_group_members`, `v_group_stats`, `v_user_activity`
   - Auto-updating triggers for member counts

5. **Services:**
   - `database/connection.js` - PostgreSQL connection pool
   - `services/redisService.js` - Redis caching & rate limiting
   - `database/groupService.js` - PostgreSQL CRUD operations
   - `services/commandHandler.js` - Admin command processing

6. **Deployment:**
   ```bash
   # Local machine
   ./DEPLOY_WHEN_ONLINE.sh

   # Or manual SSH
   ssh root@209.38.231.184
   cd /root/CommGuard
   git pull origin main
   pm2 restart commguard-bot
   ```

7. **Testing:**
   ```bash
   node test-connections.js    # Test Postgres + Redis
   pm2 logs commguard-bot      # View bot logs
   pm2 status                  # Check bot status
   ```

**Key Concepts:**
- **LID Decoding:** WhatsApp multi-device IDs decoded to phone numbers
- **Hybrid Architecture:** PostgreSQL (permanent) + Redis (cache)
- **Auto-Migration:** Script imports all groups and members from WhatsApp
- **Performance:** Redis 85% faster than PostgreSQL for frequent reads

**Current Status:**
-  Schema created in Railway PostgreSQL
-  Both databases connected and tested
-  Code deployed to production server
- � Migration pending (waiting for user confirmation)

### Key Concepts

- **Hybrid Architecture:** VPS (bot) + Railway (databases) + Firebase (legacy)
- **LID Decoding:** WhatsApp multi-device IDs decoded to phone numbers
- **Triple Redundancy:** PostgreSQL (permanent) + Redis (cache) + Firebase (fallback)
- **Performance:** Redis 85% faster than PostgreSQL (893K vs 15K req/sec)
- **Bot Restart Tracking:** All restarts logged to `bot_restarts` table
- **Message Flow:** WhatsApp → Baileys → handleMessage() → Redis → PostgreSQL → Firebase

### Why This Matters

1. **Bot runs on VPS, NOT Railway** - Railway only hosts databases
2. **Three database layers** - Each serves different purposes  
3. **Deployment is manual** - No auto-deploy from GitHub
4. **Session state on VPS** - WhatsApp auth stored locally
5. **Monitoring via PostgreSQL** - All actions logged and queryable

### Quick Troubleshooting

**Bot not responding?**
```bash
ssh root@209.38.231.184
pm2 status
pm2 logs commguard-bot --lines 100
```

**Database connection issues?**
```bash
node test-connections.js
```

**Need to restart bot?**
```bash
./DEPLOY_WHEN_ONLINE.sh
# or
ssh root@209.38.231.184 "cd /root/CommGuard && pm2 restart commguard-bot"
```

**Check recent bot restarts?**
```sql
SELECT * FROM bot_restarts ORDER BY restart_timestamp DESC LIMIT 10;
```
