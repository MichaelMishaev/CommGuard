# Cloud Server Connection Guide for CommGuard Bot

## Problem: 401 Unauthorized Error

This error means your WhatsApp session has expired. You need to re-authenticate.

## Quick Fix

1. **Clear old authentication**:
```bash
rm -rf baileys_auth_info
```

2. **Start the bot**:
```bash
npm start
```

3. **Scan the QR Code**

Since you're on a cloud server without a graphical interface, you have several options:

### Option A: Use QR Code Helper (Recommended)
```bash
# This saves the QR as an image file
node qr-connect.js

# Download the QR code to your local machine
scp user@your-server:~/bCommGuard/qr-code.png .

# Open qr-code.png on your computer and scan with WhatsApp
```

### Option B: Use Terminal QR Code
If your terminal supports UTF-8 and can display the QR code:
1. Make sure your terminal window is wide enough (at least 80 characters)
2. Run `npm start` and the QR code should appear
3. Scan it directly from your terminal

### Option C: Use Pairing Code (Alternative)
```bash
node cloud-connect.js
# Follow the prompts to enter your phone number
# You'll get a pairing code to enter in WhatsApp
```

### Option D: Use PM2 with Logs
```bash
# Install PM2 if not already installed
npm install -g pm2

# Start the bot with PM2
pm2 start index.js --name commguard

# Watch the logs for QR code
pm2 logs commguard

# The QR will appear in the logs - copy it to a text file and use an online QR generator to recreate it
```

## After Successful Connection

Once connected, the bot will:
1. Save authentication in `baileys_auth_info/` folder
2. Show "✅ Bot connected successfully!"
3. Display the bot's phone number and name
4. Automatically reconnect on future starts

## Keeping Bot Running 24/7

### Using PM2 (Recommended)
```bash
# Start bot
pm2 start index.js --name commguard

# Auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs commguard
```

### Using systemd Service
Create `/etc/systemd/system/commguard.service`:
```ini
[Unit]
Description=CommGuard WhatsApp Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/bCommGuard
ExecStart=/usr/bin/node /home/your-user/bCommGuard/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable commguard
sudo systemctl start commguard
```

## Troubleshooting

### "Connection Failure" or "401" errors
- Your session expired - delete `baileys_auth_info/` and reconnect

### "Stream Error 515"
- This is a known WhatsApp issue. The bot will auto-retry with exponential backoff

### "Conflict" errors
- Another instance might be running. Check with `ps aux | grep node`

### Can't see QR code properly
- Make terminal wider
- Use `node qr-connect.js` to save as image
- Check terminal encoding is UTF-8

## Security Notes

1. Keep your `baileys_auth_info/` folder secure - it contains your WhatsApp session
2. Don't share the QR code or pairing code with anyone
3. Use a dedicated WhatsApp number for the bot if possible
4. Monitor bot activity through admin alerts