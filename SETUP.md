# bCommGuard Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
cd bCommGuard
npm install
```

### 2. Configure Phone Numbers (for alerts only)
Edit `config.js` and replace the phone numbers:

```javascript
ADMIN_PHONE: '1234567890',  // Your WhatsApp number (for admin commands)
ALERT_PHONE: '1234567890',  // Where to send alerts when users are kicked
```

**Note**: These are NOT for logging in! They're for:
- `ADMIN_PHONE`: The bot will only accept admin commands from this number
- `ALERT_PHONE`: The bot sends notifications here when it kicks someone

### 3. Run the Bot
```bash
npm start
```

### 4. Scan QR Code
When you run the bot, you'll see:

```
╔═══════════════════════════════════════════╗
║       🛡️  CommGuard Bot (Baileys)  🛡️       ║
║                                           ║
║  WhatsApp Group Protection Bot v2.0       ║
║  Powered by Baileys WebSocket API         ║
╚═══════════════════════════════════════════╝

📱 Scan this QR code to connect:

[QR CODE WILL APPEAR HERE]
```

**Use ANY WhatsApp account to scan the QR code** - this will be the bot's WhatsApp account.

### 5. After Scanning
Once connected, you'll see:
```
✅ Bot connected successfully!
Bot ID: 1234567890@s.whatsapp.net
Bot Name: [Your WhatsApp Name]

🛡️ CommGuard Bot (Baileys Edition) is now protecting your groups!
```

## Important Points

1. **Bot WhatsApp Account**: The QR code connects ANY WhatsApp account as the bot. Use a dedicated number if possible.

2. **Admin Notifications**: The phone numbers in config.js are where the bot sends alerts, NOT the bot's login.

3. **First Time Setup**:
   - The bot creates a `baileys_auth_info` folder to remember the login
   - You only need to scan QR once (unless you delete this folder)

4. **Making Bot Admin**:
   - Add the bot's WhatsApp account to your groups
   - Make it an admin in each group
   - The bot will then protect those groups

## Example Flow

1. You have WhatsApp on number: +1 234-567-8900 (your personal)
2. You have a spare number: +1 555-123-4567 (for the bot)
3. You set in config.js:
   ```javascript
   ADMIN_PHONE: '12345678900',  // Your personal number
   ALERT_PHONE: '12345678900',  // Also your personal number
   ```
4. You run `npm start` and scan QR with the SPARE number (+1 555-123-4567)
5. The bot runs on the spare number and sends alerts to your personal number

## Troubleshooting

**"No QR code appears"**
- The bot might already be logged in. Delete `baileys_auth_info` folder to force new login

**"I'm confused about which number to use"**
- Config.js numbers = WHERE TO SEND ALERTS (your phone)
- QR scan = WHICH WHATSAPP BECOMES THE BOT (spare phone/number recommended)

**"Can I use my main WhatsApp?"**
- Technically yes, but not recommended
- The bot will act from that account
- Better to use a dedicated number