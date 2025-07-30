# bCommGuard - WhatsApp Community Guard Bot (Baileys Edition)

A lightweight, efficient WhatsApp group moderation bot built with Baileys WebSocket API. This is a complete rewrite of CommGuard using Baileys instead of whatsapp-web.js for better performance and reliability.

## 🚀 Why Baileys?

### Performance Comparison
| Feature | whatsapp-web.js | Baileys |
|---------|----------------|---------|
| Memory Usage | ~500MB+ (Chrome) | ~50-100MB |
| Connection | Browser automation | Direct WebSocket |
| Startup Time | 10-30 seconds | 2-5 seconds |
| Dependencies | Puppeteer, Chrome | None |
| Kick Function | ❌ Broken | ✅ Working |

## 🛡️ Features

- **Invite Link Detection**: Automatically detects and removes WhatsApp group invite links
- **Instant User Removal**: Kicks users who send invite links (working properly!)
- **Blacklist System**: Remembers and auto-kicks blacklisted users
- **Admin Immunity**: Admins can share invite links without restrictions
- **Firebase Integration**: Optional cloud storage for blacklist persistence
- **Lightweight**: No browser needed, pure WebSocket connection

## 📋 Prerequisites

- Node.js 17 or higher
- WhatsApp account for the bot
- Firebase project (optional, for cloud storage)

## 🔧 Installation

1. Clone or copy the bCommGuard folder:
```bash
cd bCommGuard
```

2. Install dependencies:
```bash
npm install
```

3. Configure the bot:
   - Edit `config.js` with your admin phone numbers
   - Copy your Firebase credentials if using cloud storage

## ⚙️ Configuration

Edit `config.js`:

```javascript
module.exports = {
  // Replace with your admin phone (without @s.whatsapp.net)
  ADMIN_PHONE: '972555555555',
  ALERT_PHONE: '972555555555',
  
  // Feature toggles
  FEATURES: {
    INVITE_LINK_DETECTION: true,
    AUTO_KICK_BLACKLISTED: true,
    FIREBASE_INTEGRATION: true,
  }
};
```

## 🚀 Running the Bot

### Production Mode
```bash
npm start
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Running Tests
```bash
# Pattern detection tests
node tests/testInviteDetection.js

# Stress test
node tests/stressTest.js
```

## 📱 First Time Setup

1. Run the bot: `npm start`
2. Scan the QR code with WhatsApp on your phone
3. The bot will connect and show its ID
4. Add the bot to your WhatsApp groups
5. Make the bot an admin in each group
6. The bot is now protecting your groups!

## 🧪 QA Testing

A comprehensive QA checklist is available in `tests/qaChecklist.md`. Key tests include:

- ✅ Invite link detection (all formats)
- ✅ Message deletion
- ✅ User kicking (actually works!)
- ✅ Blacklist persistence
- ✅ Admin immunity
- ✅ Error handling
- ✅ Performance under load

## 📊 Performance

Based on stress testing:
- Processes 10,000+ messages per second
- Average processing time: <0.1ms per message
- Memory usage: ~50-100MB (compared to 500MB+ for whatsapp-web.js)
- Instant message deletion and user kicks

## 🔒 Security

- Bot only acts when it has admin privileges
- Admin users are immune to all restrictions
- Firebase credentials are kept secure
- No user data is logged or stored beyond blacklist

## 🚨 Important Notes

1. **WhatsApp Terms**: Using bots may violate WhatsApp's terms of service. Use at your own risk.
2. **Rate Limits**: WhatsApp may limit actions if performed too frequently.
3. **Not Official**: This uses the unofficial Baileys library, which may break with WhatsApp updates.

## 🐛 Troubleshooting

### QR Code not appearing
- Delete the `baileys_auth_info` folder and restart

### Bot can't kick users
- Ensure the bot is a group admin
- Check the console for specific error messages

### Firebase errors
- The bot works without Firebase (memory-only mode)
- Check your `guard1-dbkey.json` file is valid

## 📁 Project Structure

```
bCommGuard/
├── index.js              # Main bot application
├── config.js             # Configuration settings
├── firebaseConfig.js     # Firebase setup
├── services/
│   └── blacklistService.js  # Blacklist management
├── utils/
│   ├── logger.js         # Logging utilities
│   └── jidUtils.js       # WhatsApp ID utilities
└── tests/
    ├── testInviteDetection.js  # Pattern tests
    ├── stressTest.js           # Performance tests
    └── qaChecklist.md          # QA documentation
```

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📜 License

MIT License - Use at your own risk

---

**Note**: This bot is not affiliated with WhatsApp or Meta. It's an independent project using the unofficial Baileys library.