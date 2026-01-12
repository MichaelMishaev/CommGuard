---
name: security-review
description: Security audit checklist and best practices for bCommGuard WhatsApp bot
tags: [security, audit, owasp, vulnerabilities, best-practices]
---

# Security Review Skill

This skill guides you through security auditing and best practices for bCommGuard.

## Security Audit Checklist

### 1. Input Validation
- [ ] All user inputs validated before processing
- [ ] Phone number format validation
- [ ] Command argument length limits
- [ ] No direct execution of user input
- [ ] Regex patterns properly escaped

### 2. Authentication & Authorization
- [ ] Admin phone numbers verified via config.ADMIN_PHONES
- [ ] Superadmin status checked for critical operations
- [ ] No hardcoded credentials
- [ ] Firebase service account key secured
- [ ] Admin immunity working correctly

### 3. Data Protection
- [ ] No sensitive data in logs
- [ ] Firebase credentials not committed to git
- [ ] Blacklist/whitelist data encrypted at rest (Firebase)
- [ ] No message content logging (except invite links)
- [ ] Phone numbers sanitized in error messages

### 4. Rate Limiting
- [ ] Translation rate limit: 10/minute per user
- [ ] Search rate limit: Admin only, reasonable limits
- [ ] Command cooldowns implemented where needed
- [ ] No infinite loops in message processing

### 5. Error Handling
- [ ] All errors caught and logged
- [ ] No sensitive info in error messages
- [ ] Graceful degradation when services fail
- [ ] No stack traces exposed to users

## OWASP Top 10 for WhatsApp Bots

### 1. Injection Attacks

#### Command Injection
```javascript
// ❌ VULNERABLE - Never execute shell commands with user input
// Avoid: child_process.exec() with user data

// ✅ SAFE - Use library methods
const result = await redis.get(sanitizeInput(userInput));
```

#### Message Injection
```javascript
// ❌ VULNERABLE
await sock.sendMessage(jid, { text: userInput });

// ✅ SAFE
await sock.sendMessage(jid, {
    text: sanitizeMessage(userInput).substring(0, 5000)
});
```

**Audit Points:**
- No `eval()` on user input
- All database queries use parameterized queries
- Regex patterns don't allow injection

### 2. Broken Authentication

#### Admin Verification
```javascript
// ✅ CURRENT IMPLEMENTATION
const senderPhone = msg.key.remoteJid.split('@')[0];
const isAdmin = config.ADMIN_PHONES.includes(senderPhone);
const isSuperAdmin = senderPhone === config.SUPERADMIN_PHONE;
```

**Audit Points:**
- Admin phones stored in config.js, not hardcoded
- No session-based authentication (stateless)
- Admin status checked on every command
- No way to bypass admin checks

### 3. Sensitive Data Exposure

#### What We Log
```javascript
// ✅ SAFE - No message content
console.log(`${timestamp} Message from ${phone} in ${groupId}`);

// ✅ SAFE - Only log invite links (security relevant)
console.log(`Invite link detected: ${link}`);

// ❌ NEVER log full messages
// console.log(`Message content: ${msg.message.conversation}`);
```

**Audit Points:**
- No message content in logs
- Phone numbers truncated in public logs
- Firebase credentials in .gitignore
- No sensitive data in error messages

### 4. XML External Entities (XXE)

**Not applicable** - Bot doesn't parse XML

### 5. Broken Access Control

#### Group Admin Checks
```javascript
// ✅ CURRENT IMPLEMENTATION
const groupMetadata = await sock.groupMetadata(groupId);
const isGroupAdmin = groupMetadata.participants.find(
    p => p.id === senderJid && p.admin
);
```

**Audit Points:**
- Bot admin status verified before kicks
- Group admin status verified for group commands
- Whitelist bypasses restrictions (intentional)
- Admin immunity working for all restrictions

### 6. Security Misconfiguration

#### Firebase Security Rules
```javascript
// ✅ CORRECT - Server-side only
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Audit Points:**
- Firebase rules allow server access only
- No public Firebase endpoints
- PM2 configured with memory limits
- Proper error handling, no info leaks

### 7. Cross-Site Scripting (XSS)

**Not applicable** - WhatsApp handles message rendering

**But:** Beware of markdown injection in some WhatsApp clients

### 8. Insecure Deserialization

#### Redis Data Parsing
```javascript
// ✅ SAFE - JSON.parse with error handling
try {
    const data = JSON.parse(redisData);
} catch (error) {
    console.error('Invalid JSON from Redis:', error);
    return null;
}
```

**Audit Points:**
- All JSON.parse wrapped in try-catch
- No `eval()` on serialized data
- Firebase handles serialization securely

### 9. Using Components with Known Vulnerabilities

#### Dependency Management
```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Fix vulnerabilities
npm audit fix
```

**Audit Points:**
- Run `npm audit` monthly
- Update dependencies regularly
- Pin critical dependency versions
- Monitor security advisories for Baileys

### 10. Insufficient Logging & Monitoring

#### Current Logging
```javascript
// ✅ IMPLEMENTED
console.log(`${getTimestamp()} Link detected from ${phone}`);
console.log(`${getTimestamp()} User ${phone} blacklisted`);
console.log(`${getTimestamp()} Error 515: ${error.message}`);
```

**Audit Points:**
- All critical actions logged
- Timestamps on all logs
- PM2 log rotation configured
- Error tracking for session issues

## Security Best Practices

### 1. Phone Number Handling

#### Validation
```javascript
function validatePhone(phone) {
    // Remove non-digits
    const cleaned = phone.replace(/\D/g, '');

    // Check length (international format)
    if (cleaned.length < 10 || cleaned.length > 15) {
        return null;
    }

    // Check for Israeli numbers
    if (cleaned.startsWith('972')) {
        return cleaned;
    }

    return cleaned;
}
```

#### Sanitization
```javascript
function sanitizePhone(phone) {
    return phone.replace(/[^0-9]/g, '').substring(0, 15);
}
```

### 2. Message Content Handling

#### Never Log Full Messages
```javascript
// ❌ NEVER
console.log('Message:', msg.message.conversation);

// ✅ SAFE
console.log('Message received from', senderPhone);
```

#### Sanitize Before Sending
```javascript
function sanitizeMessage(text) {
    // Limit length
    const limited = text.substring(0, 5000);

    // Remove null bytes
    const cleaned = limited.replace(/\0/g, '');

    return cleaned;
}
```

### 3. Regex Security

#### Avoid ReDoS (Regular Expression Denial of Service)
```javascript
// ❌ VULNERABLE - Catastrophic backtracking
const bad = /^(a+)+$/;

// ✅ SAFE - Non-greedy, simple pattern
const good = /^a+$/;

// ✅ CURRENT INVITE PATTERN - Safe
const invitePattern = /https?:\/\/(chat\.)?whatsapp\.com\/(chat\/)?([A-Za-z0-9]{6,})/gi;
```

### 4. Rate Limiting Implementation

```javascript
class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    check(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        // Remove old requests
        const recent = userRequests.filter(time => now - time < this.windowMs);

        if (recent.length >= this.maxRequests) {
            return false; // Rate limited
        }

        recent.push(now);
        this.requests.set(userId, recent);
        return true; // Allowed
    }
}

// Usage
const searchLimiter = new RateLimiter(5, 60000); // 5 per minute
```

### 5. Secure Firebase Usage

```javascript
// ✅ Service account initialization
const admin = require('firebase-admin');
const serviceAccount = require('./guard1-dbkey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// ✅ Always use admin SDK, never client SDK
const db = admin.firestore();
```

## Security Testing

### 1. Input Fuzzing
```javascript
// Test with malicious inputs
const maliciousInputs = [
  "'; DROP TABLE users; --",
  "../../../etc/passwd",
  "<script>alert('xss')</script>",
  "\\0\\0\\0",
  "A".repeat(100000), // Buffer overflow
  "${process.env.SECRET}"
];

maliciousInputs.forEach(input => {
    testCommand(input); // Should handle safely
});
```

### 2. Permission Testing
```javascript
// Test admin bypass attempts
testCommandAsNonAdmin('#blacklist', '972501234567');
// Expected: Sassy denial message

// Test superadmin requirement
testCommandAsAdmin('#sweep'); // Not superadmin
// Expected: Access denied
```

### 3. Race Condition Testing
```javascript
// Test concurrent operations
await Promise.all([
    addToBlacklist('972501234567'),
    addToBlacklist('972501234567'),
    addToBlacklist('972501234567')
]);
// Expected: No duplicates, no crashes
```

## Code Review Security Checklist

When reviewing code changes:

- [ ] No `eval()` or `Function()` on user input
- [ ] All database queries parameterized
- [ ] Admin checks before privileged operations
- [ ] Input validation on all user data
- [ ] Error handling doesn't leak sensitive info
- [ ] No secrets in code or logs
- [ ] Rate limiting for expensive operations
- [ ] Proper access control checks
- [ ] No infinite loops or recursive calls
- [ ] Memory leaks prevented

## Vulnerability Disclosure

If you find a security issue:

1. **DO NOT** open a public GitHub issue
2. **Document** the vulnerability details
3. **Report** to project maintainer privately
4. **Wait** for fix before public disclosure
5. **Test** the fix thoroughly

## Security Monitoring

### Daily Checks
```bash
# Check for unauthorized admin commands
ssh root@209.38.231.184 "pm2 logs commguard | grep -i 'admin\|blacklist\|kick'"

# Check memory usage
ssh root@209.38.231.184 "free -h && pm2 info commguard"
```

### Weekly Checks
```bash
# Dependency vulnerabilities
npm audit

# Check Firebase access logs
# (Firebase Console > Authentication > Activity)
```

### Monthly Checks
```bash
# Update dependencies
npm update

# Review security logs
# Check blacklist for suspicious patterns

# Verify backup integrity
```

## Incident Response Plan

### 1. Detection
- Monitor PM2 logs for anomalies
- Check Firebase for unauthorized access
- Watch for unusual bot behavior

### 2. Containment
```bash
# Stop bot immediately
ssh root@209.38.231.184 "pm2 stop commguard"

# Backup current state
ssh root@209.38.231.184 "cd /root/CommGuard && git stash"
```

### 3. Investigation
- Review logs for attack vector
- Check Firebase access logs
- Identify compromised accounts

### 4. Remediation
- Patch vulnerability
- Rotate Firebase credentials if needed
- Update affected systems

### 5. Recovery
```bash
# Deploy fix
git pull origin main
pm2 restart commguard
pm2 logs commguard
```

### 6. Post-Incident
- Document incident
- Update security procedures
- Notify affected users if needed

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [WhatsApp Business API Security](https://developers.facebook.com/docs/whatsapp/security/)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
