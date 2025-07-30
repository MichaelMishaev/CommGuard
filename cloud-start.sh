#!/bin/bash
echo "Starting CommGuard Bot with PM2..."
pm2 start ecosystem.config.js
echo "Bot started successfully!"
pm2 logs commguard-bot
