#!/bin/bash

echo "🔧 Fixing Multiple Connection Issue"
echo "=================================="
echo ""
echo "This script will help you run the bot on either LOCAL or CLOUD, not both!"
echo ""

# Check if running locally or on server
if [ -f "/root/CommGuard/baileys_auth_info/creds.json" ]; then
    echo "📍 Detected: Running on CLOUD SERVER"
    LOCATION="cloud"
else
    echo "📍 Detected: Running LOCALLY"
    LOCATION="local"
fi

echo ""
echo "Choose where you want to run the bot:"
echo "1) Local machine only"
echo "2) Cloud server only"
echo "3) Switch from cloud to local"
echo "4) Switch from local to cloud"
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "🏠 Setting up for LOCAL use only..."
        # Stop any cloud instances
        echo "⚠️  Make sure to stop the bot on your cloud server!"
        echo "Run this on your server: pm2 stop commguard || pkill -f node"
        
        # Clear local auth
        rm -rf baileys_auth_info
        echo "✅ Cleared local auth. Run 'npm start' to connect fresh."
        ;;
        
    2)
        echo "☁️  Setting up for CLOUD use only..."
        # Clear local auth
        rm -rf baileys_auth_info
        echo "✅ Cleared local auth."
        echo "⚠️  Now SSH to your server and run the bot there."
        ;;
        
    3)
        echo "🔄 Switching from CLOUD to LOCAL..."
        echo ""
        echo "Step 1: Stop the cloud bot"
        echo "SSH to your server and run:"
        echo "  pm2 stop commguard"
        echo "  rm -rf /root/CommGuard/baileys_auth_info"
        echo ""
        echo "Step 2: After stopping cloud bot, press Enter to continue..."
        read
        
        # Clear local auth for fresh start
        rm -rf baileys_auth_info
        echo "✅ Ready for local connection. Run 'npm start'"
        ;;
        
    4)
        echo "🔄 Switching from LOCAL to CLOUD..."
        # Clear local auth
        rm -rf baileys_auth_info
        echo "✅ Cleared local auth."
        echo ""
        echo "Now SSH to your server and:"
        echo "1. cd /root/CommGuard"
        echo "2. rm -rf baileys_auth_info"
        echo "3. npm start (or pm2 start index.js --name commguard)"
        ;;
esac

echo ""
echo "📌 Important: WhatsApp only allows ONE active connection per account!"
echo "Never run the bot on multiple machines simultaneously."