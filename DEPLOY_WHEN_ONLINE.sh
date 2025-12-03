#!/bin/bash
# Quick deployment script for bot restart tracking
# Run this when network is stable

set -e  # Exit on any error

echo "🚀 Deploying Bot Restart Tracking System..."
echo ""

# Step 1: Push to GitHub
echo "📤 Step 1: Pushing to GitHub..."
git push origin main
echo "✅ Pushed to GitHub"
echo ""

# Step 2: Deploy to production
echo "📡 Step 2: Deploying to production server..."
ssh root@209.38.231.184 << 'ENDSSH'
    cd /root/CommGuard
    echo "📥 Pulling latest code..."
    git pull origin main

    echo "📊 Applying database schema..."
    node database/apply-bot-restarts-table.js

    echo "🔄 Restarting bot..."
    pm2 restart commguard-bot

    echo "📋 Checking bot status..."
    sleep 3
    pm2 status

    echo "📝 Showing recent logs..."
    pm2 logs commguard-bot --lines 20 --nostream
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 To view bot health:"
echo "   ssh root@209.38.231.184"
echo "   cd /root/CommGuard"
echo "   node -e \"require('./database/connection').initDatabase(process.env.DATABASE_URL); require('./database/connection').query('SELECT * FROM v_recent_bot_activity LIMIT 5').then(r => console.table(r.rows))\""
echo ""
