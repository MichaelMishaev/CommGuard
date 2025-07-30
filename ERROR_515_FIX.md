# Fixing Stream Error 515 in bCommGuard

## What is Error 515?

Stream Error 515 is a common issue with WhatsApp Web connections through Baileys. It typically occurs:
- After successfully scanning the QR code
- When WhatsApp detects unusual connection patterns
- Due to rate limiting or security measures

## Quick Fix Solutions

### Solution 1: Fresh Start (Recommended)
```bash
npm run fresh
```
This command will:
- Clear all authentication data
- Clear cache
- Start with a fresh QR code

### Solution 2: Manual Reset
```bash
# 1. Stop the bot (Ctrl+C)
# 2. Clear authentication
rm -rf baileys_auth_info

# 3. Start again
npm start
```

### Solution 3: Diagnose First
```bash
# Run diagnostic tool
npm run diagnose

# Follow the recommendations provided
```

## Prevention Tips

1. **Use a Dedicated Number**: Don't use your primary WhatsApp account
2. **Limit Devices**: Log out of WhatsApp Web on all browsers
3. **Stable Connection**: Ensure reliable internet connection
4. **One Bot Instance**: Don't run multiple bot instances with same number

## Advanced Troubleshooting

### If Error Persists After Multiple Attempts:

1. **Wait Period**: Wait 1-2 hours before trying again (rate limiting)

2. **Check WhatsApp Web**: 
   - Open web.whatsapp.com in browser
   - If it works there, the bot should work too
   - If not, the account may be temporarily restricted

3. **Try Different Account**:
   - Use a different WhatsApp number
   - Preferably one that hasn't been used for automation

4. **Update Baileys**:
   ```bash
   npm update @whiskeysockets/baileys
   ```

## How the Bot Handles Error 515

The updated bot includes:
- Automatic reconnection with exponential backoff
- Auth clearing after 3 failed attempts
- Detailed error logging
- Maximum 10 reconnection attempts

## Manual Workarounds

If automated fixes don't work:

1. **Use WhatsApp Business API** (paid option)
2. **Try alternative libraries** (though Baileys is currently the best)
3. **Report issue** to Baileys GitHub repository

## Need Help?

Run the diagnostic tool first:
```bash
npm run diagnose
```

This will check:
- Node.js version
- Dependencies
- Authentication status
- Network connectivity
- Firebase configuration

Then follow the specific recommendations provided.