#!/usr/bin/env node

// Diagnostic script for bCommGuard connection issues

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log(`
╔═══════════════════════════════════════════╗
║    🔍 bCommGuard Diagnostic Tool 🔍        ║
╚═══════════════════════════════════════════╝
`);

// 1. Check Node.js version
console.log('1️⃣ Checking Node.js version...');
try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (majorVersion >= 17) {
        console.log(`   ✅ Node.js ${nodeVersion} (OK - requires 17+)`);
    } else {
        console.log(`   ❌ Node.js ${nodeVersion} (Too old - requires 17+)`);
        console.log('   Please update Node.js to version 17 or higher');
    }
} catch (error) {
    console.error('   ❌ Failed to check Node.js version');
}

// 2. Check if dependencies are installed
console.log('\n2️⃣ Checking dependencies...');
const requiredPackages = [
    '@whiskeysockets/baileys',
    '@hapi/boom',
    'qrcode-terminal',
    'pino'
];

const packageJson = require('./package.json');
let missingPackages = [];

for (const pkg of requiredPackages) {
    if (packageJson.dependencies && packageJson.dependencies[pkg]) {
        console.log(`   ✅ ${pkg} (${packageJson.dependencies[pkg]})`);
    } else {
        console.log(`   ❌ ${pkg} (missing)`);
        missingPackages.push(pkg);
    }
}

if (missingPackages.length > 0) {
    console.log('\n   Run: npm install');
}

// 3. Check authentication folder
console.log('\n3️⃣ Checking authentication data...');
const authPath = path.join(__dirname, 'baileys_auth_info');

if (fs.existsSync(authPath)) {
    const stats = fs.statSync(authPath);
    const files = fs.readdirSync(authPath);
    console.log(`   ✅ Auth folder exists (${files.length} files)`);
    console.log(`   📅 Last modified: ${stats.mtime.toLocaleString()}`);
    
    // Check for specific auth files
    const expectedFiles = ['creds.json', 'app-state-sync-key-', 'app-state-sync-version-'];
    const hasCredsFile = files.includes('creds.json');
    
    if (hasCredsFile) {
        console.log('   ✅ Credentials file found');
    } else {
        console.log('   ⚠️ No credentials file found - QR scan required');
    }
} else {
    console.log('   ℹ️ No auth folder - fresh login required');
}

// 4. Check Firebase configuration
console.log('\n4️⃣ Checking Firebase configuration...');
const firebaseKeyPath = path.join(__dirname, '..', 'guard1-dbkey.json');

if (fs.existsSync(firebaseKeyPath)) {
    try {
        const firebaseConfig = require(firebaseKeyPath);
        if (firebaseConfig.project_id) {
            console.log(`   ✅ Firebase config found (Project: ${firebaseConfig.project_id})`);
        } else {
            console.log('   ⚠️ Firebase config exists but seems invalid');
        }
    } catch (error) {
        console.log('   ⚠️ Firebase config exists but cannot be read');
    }
} else {
    console.log('   ⚠️ No Firebase config found (bot will work in memory-only mode)');
}

// 5. Test network connectivity
console.log('\n5️⃣ Testing network connectivity...');
try {
    execSync('ping -c 1 web.whatsapp.com > /dev/null 2>&1');
    console.log('   ✅ Can reach WhatsApp servers');
} catch (error) {
    console.log('   ❌ Cannot reach WhatsApp servers - check internet connection');
}

// 6. Provide recommendations
console.log('\n📋 Recommendations:');

if (fs.existsSync(authPath)) {
    console.log('\n🔧 For Error 515 (Stream Error):');
    console.log('   1. Delete the auth folder and re-authenticate:');
    console.log('      rm -rf baileys_auth_info');
    console.log('      npm start');
    console.log('');
    console.log('   2. Make sure you\'re not logged into too many devices');
    console.log('   3. Try logging out of WhatsApp Web on all browsers');
    console.log('   4. Use a different WhatsApp account if possible');
} else {
    console.log('\n🆕 For fresh setup:');
    console.log('   1. Run: npm start');
    console.log('   2. Scan the QR code with WhatsApp');
    console.log('   3. Keep the terminal open during scanning');
}

console.log('\n💡 General tips:');
console.log('   • Use a dedicated WhatsApp number for the bot');
console.log('   • Ensure stable internet connection');
console.log('   • Keep the bot running 24/7 for best results');
console.log('   • Make the bot admin in groups for full functionality');

console.log('\n✅ Diagnostic complete!\n');