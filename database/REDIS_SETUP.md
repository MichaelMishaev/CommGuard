# Redis Setup Guide for bCommGuard

## Why Redis?

Redis is **85% faster** than PostgreSQL for reads and handles **893,000 requests/second**. For WhatsApp bots, Redis is essential for:

- ✅ **Rate limiting** (prevent spam)
- ✅ **Session caching** (fast WhatsApp session lookups)
- ✅ **Blacklist cache** (instant user checks)
- ✅ **Mute timers** (automatic expiration)
- ✅ **Cooldowns** (prevent rapid re-kicks)
- ✅ **Message queue** (handle concurrent messages)
- ✅ **PostgreSQL cache** (speed up database queries)

---

## Installation (Production Server)

### Step 1: Install Redis

```bash
# SSH to server
ssh root@209.38.231.184

# Update packages
apt update

# Install Redis
apt install redis-server -y

# Check installation
redis-cli --version
# Output: redis-cli 6.x.x or 7.x.x
```

### Step 2: Configure Redis (Set Memory Limit)

**IMPORTANT**: Set memory limit to prevent Redis from using all RAM!

```bash
# Edit Redis configuration
nano /etc/redis/redis.conf

# Find these lines and change:

# Line ~410-420: Set memory limit
maxmemory 100mb

# Line ~430: Set eviction policy (remove least recently used keys)
maxmemory-policy allkeys-lru

# Optional: Disable persistence (faster, but data lost on restart)
# Line ~200: Comment out or change:
# save 900 1
# save 300 10
# save 60 10000
save ""

# Save and exit
# Ctrl + X, then Y, then Enter
```

### Step 3: Restart and Enable Redis

```bash
# Restart Redis with new config
systemctl restart redis-server

# Enable Redis to start on boot
systemctl enable redis-server

# Check status
systemctl status redis-server
# Should show: active (running)
```

### Step 4: Test Redis

```bash
# Test connection
redis-cli ping
# Output: PONG

# Check memory usage
redis-cli INFO memory | grep used_memory_human
# Output: used_memory_human:1.00M

# Test set/get
redis-cli SET testkey "Hello Redis"
redis-cli GET testkey
# Output: "Hello Redis"

# Delete test key
redis-cli DEL testkey
```

---

## Installation (Node.js Dependencies)

### Install Redis Client Libraries

```bash
# Local development
cd /Users/michaelmishayev/Desktop/CommGuard/bCommGuard
npm install ioredis redis

# Production server
ssh root@209.38.231.184
cd /root/CommGuard
npm install ioredis redis
```

---

## Configuration (.env)

Add Redis configuration to your `.env` file:

```bash
# Local .env
nano .env

# Add these lines:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

For **production**, Redis runs on the same server, so use `localhost`.

---

## Usage in Your Bot

### Initialize Redis

```javascript
// In index.js or startup file
const { initRedis } = require('./services/redisService');

// Initialize Redis on startup
initRedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
});
```

### Example 1: Check Blacklist (Cached)

```javascript
const { isBlacklistedCached, cacheBlacklistedUser } = require('./services/redisService');

// Fast blacklist check (from Redis cache)
const isBlacklisted = await isBlacklistedCached('972555030766');

if (isBlacklisted) {
    console.log('User is blacklisted!');
    // Kick user immediately
}

// Cache blacklisted user (24 hour TTL)
await cacheBlacklistedUser('972555030766', 86400);
```

### Example 2: Rate Limiting

```javascript
const { isRateLimited } = require('./services/redisService');

// Limit to 5 kicks per minute per admin
const limited = await isRateLimited(`admin:${adminPhone}:kick`, 5, 60);

if (limited) {
    await sock.sendMessage(groupId, {
        text: '⏱️ Rate limit exceeded. Wait 1 minute.'
    });
    return;
}

// Proceed with kick
```

### Example 3: Kick Cooldown

```javascript
const { isInKickCooldown, setKickCooldown } = require('./services/redisService');

// Check if user was recently kicked
if (await isInKickCooldown(userId)) {
    console.log('User in cooldown, skipping kick');
    return;
}

// Kick user
await sock.groupParticipantsUpdate(groupId, [userId], 'remove');

// Set 10 second cooldown
await setKickCooldown(userId, 10);
```

### Example 4: Mute Timer

```javascript
const { setMuteTimer, isMuted, unmute } = require('./services/redisService');

// Mute user for 30 minutes
await setMuteTimer(userId, 30);

// Check if user is muted
if (await isMuted(userId)) {
    // Delete message from muted user
    await sock.sendMessage(groupId, { delete: msg.key });
    return;
}

// Unmute user manually
await unmute(userId);
```

### Example 5: Cache PostgreSQL Query

```javascript
const { cache, getCached } = require('./services/redisService');
const { getGroupMembers } = require('./database/groupService');

// Try cache first
let members = await getCached(`group:${groupId}:members`);

if (!members) {
    // Cache miss - query PostgreSQL
    members = await getGroupMembers(groupId);

    // Cache for 5 minutes
    await cache(`group:${groupId}:members`, members, 300);
}

console.log(`Found ${members.length} members (from ${members ? 'cache' : 'database'})`);
```

---

## Redis + PostgreSQL Architecture

### Data Flow:

```
User sends message
      │
      ├──► Redis: Check if blacklisted (0.095ms) ⚡
      │    ├─► FOUND: Kick immediately
      │    └─► NOT FOUND: Check PostgreSQL
      │
      └──► PostgreSQL: Check user status (0.65ms)
           ├─► IS BLACKLISTED:
           │   ├─► Kick user
           │   └─► Cache in Redis (for next time)
           └─► NOT BLACKLISTED: Allow message
```

### Performance Gains:

| Action | Without Redis | With Redis | Improvement |
|--------|---------------|-----------|-------------|
| Blacklist check | 0.65ms (PostgreSQL) | 0.095ms (Redis) | **85% faster** |
| Rate limit check | 2-5ms (PostgreSQL) | 0.1ms (Redis) | **95% faster** |
| Mute check | 0.5ms (PostgreSQL) | 0.095ms (Redis) | **81% faster** |
| Cache hit | 0.65ms (PostgreSQL) | 0.095ms (Redis) | **85% faster** |

---

## Monitoring Redis

### Check Memory Usage

```bash
# Memory stats
redis-cli INFO memory | grep -E 'used_memory_human|maxmemory_human|mem_fragmentation_ratio'

# Output:
# used_memory_human:45.23M
# maxmemory_human:100.00M
# mem_fragmentation_ratio:1.15
```

### Check Total Keys

```bash
# Count all keys
redis-cli DBSIZE

# Output: (integer) 1523
```

### Monitor Real-Time Commands

```bash
# Watch Redis commands in real-time
redis-cli MONITOR

# Output:
# 1701234567.123456 [0 127.0.0.1:50123] "GET" "blacklist:972555030766"
# 1701234567.234567 [0 127.0.0.1:50123] "SETEX" "mute:123456@s.whatsapp.net" "1800" "1701236367234"
```

### Check Slow Queries

```bash
# Get slow queries (>10ms)
redis-cli SLOWLOG GET 10
```

---

## Performance Optimization

### 1. Set Appropriate TTL (Time To Live)

```javascript
// Short TTL for frequently changing data
await cache('active_users', users, 60);  // 1 minute

// Medium TTL for semi-static data
await cache('group_members', members, 300);  // 5 minutes

// Long TTL for rarely changing data
await cache('group_list', groups, 3600);  // 1 hour
```

### 2. Use Pipelines for Bulk Operations

```javascript
const pipeline = redisClient.pipeline();

// Queue multiple operations
pipeline.setex('key1', 60, 'value1');
pipeline.setex('key2', 60, 'value2');
pipeline.setex('key3', 60, 'value3');

// Execute all at once (much faster!)
await pipeline.exec();
```

### 3. Use Hash Sets for Related Data

```javascript
// Store user data as hash
await redisClient.hmset('user:972555030766', {
    name: 'John',
    blacklisted: '0',
    groups: '5',
    lastSeen: Date.now()
});

// Get all user data at once
const userData = await redisClient.hgetall('user:972555030766');
```

---

## Troubleshooting

### Problem: "Could not connect to Redis"

**Solution**:
```bash
# Check if Redis is running
systemctl status redis-server

# Restart Redis
systemctl restart redis-server

# Check Redis logs
tail -f /var/log/redis/redis-server.log
```

### Problem: "Redis using too much memory"

**Solution**:
```bash
# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Check what's using memory
redis-cli --bigkeys

# Flush all data (DANGER: deletes everything!)
redis-cli FLUSHALL

# Or set lower maxmemory in redis.conf
nano /etc/redis/redis.conf
# maxmemory 50mb
```

### Problem: "Redis is slow"

**Solution**:
```bash
# Check slow queries
redis-cli SLOWLOG GET 10

# Check if persistence is enabled (slows down Redis)
redis-cli CONFIG GET save

# Disable persistence for speed (but lose data on restart)
redis-cli CONFIG SET save ""
```

---

## Cost & Resources

### Memory Usage (Your Bot):
- **Rate limiting**: ~5MB (thousands of rate limit keys)
- **Blacklist cache**: ~10MB (thousands of phone numbers)
- **Mute timers**: ~5MB (active mutes)
- **PostgreSQL cache**: ~20MB (frequently accessed data)
- **Miscellaneous**: ~10MB (cooldowns, sessions)

**Total: ~50MB** (well within your 196MB available RAM)

### Cost:
- **Self-hosted Redis**: $0/month ✅
- **Railway Redis**: $5-10/month (not needed, use self-hosted)

**Recommendation**: Self-host on your server (free!)

---

## Redis Commands Cheat Sheet

```bash
# Key operations
SET key value              # Set key
GET key                    # Get value
DEL key                    # Delete key
EXISTS key                 # Check if exists
EXPIRE key seconds         # Set expiration
TTL key                    # Get time to live

# String operations
INCR key                   # Increment by 1
DECR key                   # Decrement by 1
APPEND key value           # Append to string

# List operations
LPUSH key value            # Push to list (left)
RPUSH key value            # Push to list (right)
LPOP key                   # Pop from list (left)
LRANGE key start stop      # Get range

# Hash operations
HSET key field value       # Set hash field
HGET key field             # Get hash field
HGETALL key                # Get all fields
HDEL key field             # Delete field

# Management
INFO                       # Server info
DBSIZE                     # Number of keys
FLUSHDB                    # Clear current database
FLUSHALL                   # Clear all databases
MONITOR                    # Watch commands
```

---

## Success Checklist

- [ ] Redis installed on server
- [ ] Memory limit configured (100MB)
- [ ] Redis service enabled on boot
- [ ] Redis client libraries installed (`ioredis`, `redis`)
- [ ] `.env` configured with Redis settings
- [ ] `redisService.js` integrated in bot
- [ ] Tested basic operations (SET, GET, DEL)
- [ ] Monitoring memory usage
- [ ] Rate limiting implemented
- [ ] Blacklist caching working
- [ ] Mute timers functional

---

## Summary

**Redis + PostgreSQL = Perfect Architecture**

- **Redis**: Fast temporary data (cache, rate limits, sessions)
- **PostgreSQL**: Permanent data (users, groups, analytics)
- **Cost**: $0/month (self-hosted Redis) + $5/month (Railway PostgreSQL)
- **Performance**: 85% faster than PostgreSQL alone
- **Memory**: ~50MB (safe for your 196MB available RAM)

**This is the industry standard for production WhatsApp bots!**

---

**Sources**:
- [Redis on Ubuntu Installation Guide](https://linuxvox.com/blog/redis-on-ubuntu/)
- [PostgreSQL vs Redis Caching Performance](https://www.myscale.com/blog/postgres-vs-redis-battle-caching-performance/)
- [Scaling Baileys WhatsApp Bot with Redis](https://stackoverflow.com/questions/79775725/i-am-working-on-scaling-a-baileys-whatsapp-web-api-node-js-server-to-handle-1k)
