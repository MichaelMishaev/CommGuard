#!/bin/bash

echo "=================================================="
echo "🔍 Firebase Billing Analysis for October 7, 2025"
echo "=================================================="
echo ""

# Check PM2 logs for restarts on 7.10
echo "📊 Bot Restarts on 7.10.2025:"
echo "---------------------------------------------------"
pm2 logs commguard --lines 10000 --nostream 2>/dev/null | grep -E "2025-10-07|Oct 7|7/10" | grep -iE "restart|start|init|firebase init|loaded.*cache" | wc -l
echo ""

# Count Firebase initialization messages
echo "🔥 Firebase Collection Loads on 7.10:"
echo "---------------------------------------------------"
pm2 logs commguard --lines 10000 --nostream 2>/dev/null | grep -E "2025-10-07|Oct 7" | grep -E "Loading.*from Firebase|Loaded.*from Firebase" | head -20
echo ""

# Check for error 515 (multiple connections)
echo "⚠️  Error 515 (Multiple Connections) Count:"
echo "---------------------------------------------------"
pm2 logs commguard --lines 10000 --nostream 2>/dev/null | grep -E "2025-10-07|Oct 7" | grep -iE "error.*515|stream error|connection closed" | wc -l
echo ""

# Check for crashes
echo "💥 Bot Crashes on 7.10:"
echo "---------------------------------------------------"
pm2 logs commguard --lines 10000 --nostream 2>/dev/null | grep -E "2025-10-07|Oct 7" | grep -iE "error|crash|exception|uncaught" | head -20
echo ""

# Estimate Firebase reads
echo "💰 Estimated Firebase Reads on 7.10:"
echo "---------------------------------------------------"
RESTARTS=$(pm2 logs commguard --lines 10000 --nostream 2>/dev/null | grep -E "2025-10-07|Oct 7" | grep -iE "restart|Firebase initialized" | wc -l | tr -d ' ')
echo "Bot restarts detected: $RESTARTS"
echo ""
echo "Collections loaded on each restart:"
echo "  - blacklist: ~50,000 reads"
echo "  - kicked_users: ~10,000 reads"
echo "  - user_warnings: ~1,000 reads"
echo "  - unblacklist_requests: ~5,000 reads"
echo "  - whitelist: ~100 reads"
echo "  - muted_users: ~200 reads"
echo "  - motivational_phrases: ~100 reads"
echo "  - group_joke_settings: ~50 reads"
echo "  --------------------------------"
echo "  Total per restart: ~66,450 reads"
echo ""
TOTAL_READS=$((RESTARTS * 66450))
echo "🚨 TOTAL ESTIMATED READS ON 7.10: $TOTAL_READS"
echo ""
COST=$(echo "scale=2; $TOTAL_READS * 0.00006" | bc 2>/dev/null || echo "N/A")
echo "💵 Estimated cost (at \$0.06 per 100K reads): \$$COST"
echo ""

# Check current PM2 status
echo "📋 Current PM2 Status:"
echo "---------------------------------------------------"
pm2 status
echo ""

# Check Firebase usage today
echo "📅 Today's Firebase Activity:"
echo "---------------------------------------------------"
TODAY=$(date +"%Y-%m-%d")
pm2 logs commguard --lines 1000 --nostream 2>/dev/null | grep "$TODAY" | grep -E "Loading.*Firebase|Added.*blacklist|Warning recorded|Kicked user" | tail -10
echo ""

echo "=================================================="
echo "✅ Analysis Complete"
echo "=================================================="
echo ""
echo "💡 To reduce costs, run these optimizations:"
echo "   1. Disable Firebase for all collections except muted_users"
echo "   2. Use local file cache instead"
echo "   3. Only write to Firebase, read from cache"
echo ""
