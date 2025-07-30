#!/usr/bin/env node

// Fresh start script for bCommGuard - clears auth and starts clean

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

async function freshStart() {
    console.log(`
╔═══════════════════════════════════════════╗
║    🔄 Fresh Start for bCommGuard 🔄        ║
╚═══════════════════════════════════════════╝
    `);

    const authPath = path.join(__dirname, 'baileys_auth_info');

    // Step 1: Clear existing auth
    console.log('1️⃣ Clearing existing authentication...');
    try {
        await fs.rm(authPath, { recursive: true, force: true });
        console.log('   ✅ Authentication data cleared');
    } catch (error) {
        console.log('   ℹ️ No existing auth to clear');
    }

    // Step 2: Clear any cache
    console.log('\n2️⃣ Clearing cache...');
    try {
        const cacheDir = path.join(__dirname, '.cache');
        await fs.rm(cacheDir, { recursive: true, force: true });
        console.log('   ✅ Cache cleared');
    } catch (error) {
        console.log('   ℹ️ No cache to clear');
    }

    // Step 3: Start the bot
    console.log('\n3️⃣ Starting bot with fresh authentication...\n');
    console.log('📱 When QR code appears:');
    console.log('   1. Open WhatsApp on your phone');
    console.log('   2. Go to Settings > Linked Devices');
    console.log('   3. Tap "Link a Device"');
    console.log('   4. Scan the QR code\n');

    // Use spawn to start the bot
    const bot = spawn('node', ['index.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, FRESH_START: 'true' }
    });

    bot.on('error', (error) => {
        console.error('\n❌ Failed to start bot:', error.message);
        process.exit(1);
    });

    bot.on('exit', (code) => {
        if (code !== 0) {
            console.error(`\n❌ Bot exited with code ${code}`);
            process.exit(code);
        }
    });
}

// Run fresh start
freshStart().catch(console.error);