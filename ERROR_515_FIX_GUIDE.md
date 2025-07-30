# Stream Error 515 Fix Guide

## What is Error 515?

Stream Error 515 is a WhatsApp Web connection error that occurs when:
- Multiple devices are trying to connect with the same credentials
- WhatsApp detects unusual connection patterns
- The authentication session is corrupted
- Rate limiting is triggered by too many connection attempts

## Quick Fixes

### 1. Clear and Reconnect (Most Effective)
```bash
# Stop any running bot instances
pkill -f node

# Clear authentication
rm -rf baileys_auth_info

# Wait a few minutes, then start fresh
npm start
```

### 2. Use Mobile Connection Mode
```bash
# This uses a different API that's more stable
node mobile-connect.js
```

### 3. Use Connection with Delays
```bash
# Adds delays to prevent rate limiting
node connect-with-delay.js
```

### 4. Manual QR Code Method
```bash
# Generates QR as image file for cloud servers
node qr-connect.js
# Then download qr-code.png and scan it
```

## Advanced Solutions

### Check for Multiple Instances
```bash
# See if multiple bot instances are running
ps aux | grep node | grep -E "index.js|commguard"

# Kill all instances
pkill -f "node.*index.js"
```

### Use Different Network
- If possible, try connecting from a different IP address
- Use a VPN to change your connection origin
- Wait 1-2 hours if you've been rate limited

### Modify Connection Parameters
Edit `index.js` and try these changes:

1. **Change Browser String**:
```javascript
browser: ['Ubuntu', 'Chrome', '20.04'], // Try different combinations
```

2. **Disable Features**:
```javascript
markOnlineOnConnect: false,
syncFullHistory: false,
```

3. **Increase Delays**:
```javascript
defaultQueryTimeoutMs: 180000, // 3 minutes
keepAliveIntervalMs: 60000, // 1 minute
```

## Prevention Tips

1. **Don't Restart Too Quickly**: Wait at least 30 seconds between connection attempts
2. **Use One Instance**: Ensure only one bot instance runs at a time
3. **Stable Network**: Use a stable internet connection
4. **Regular Cleanup**: Periodically clear auth data if issues persist

## If Nothing Works

1. **Wait 2-4 hours**: WhatsApp rate limits reset after this time
2. **Try Different Account**: Use a different WhatsApp number
3. **Check WhatsApp Web**: Ensure regular WhatsApp Web works in your browser
4. **Update Dependencies**: 
   ```bash
   npm update @whiskeysockets/baileys
   ```

## Error Patterns

- **Error 515 + immediate disconnect**: Rate limited, wait longer
- **Error 515 + QR won't scan**: Clear auth and try mobile mode
- **Error 515 + 401**: Session expired, needs fresh QR scan
- **Error 515 + 405**: API changes, try mobile connection mode

## Best Connection Method for Servers

For cloud/VPS servers, use this sequence:
1. First try: `node mobile-connect.js`
2. If that fails: `node qr-connect.js` (download QR image)
3. Last resort: Wait 2-4 hours and try again

## Monitoring

Once connected, monitor for stability:
```bash
# Use PM2 for auto-restart
pm2 start index.js --name commguard
pm2 logs commguard
```

The bot includes automatic error 515 recovery, but manual intervention may be needed for persistent issues.