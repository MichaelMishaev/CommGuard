// CommGuard Bot - WhatsApp-Web.js Version
// Stable, production-ready WhatsApp moderation bot

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Store for rate limiting kicks
const kickCooldown = new Map();
const KICK_COOLDOWN_MS = 10000; // 10 seconds

console.log(`
╔═══════════════════════════════════════════╗
║       🛡️  CommGuard Bot (wwebjs)  🛡️       ║
║                                           ║
║  WhatsApp Group Protection Bot v2.0       ║
║  Powered by whatsapp-web.js               ║
╚═══════════════════════════════════════════╝
`);

// QR Code for authentication
client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code to connect:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for QR code scan...\n');
});

// Ready event
client.on('ready', async () => {
    console.log('✅ WhatsApp client is ready!');
    console.log(`Bot Number: ${client.info.wid.user}`);
    console.log(`Bot Name: ${client.info.pushname}`);
    console.log('\n🛡️ CommGuard Bot is now protecting your groups!\n');
});

// Authenticated
client.on('authenticated', () => {
    console.log('✅ Authentication successful');
});

// Auth failure
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    console.log('💡 Please delete ./wwebjs_auth folder and try again');
});

// Disconnected
client.on('disconnected', (reason) => {
    console.log('❌ Client disconnected:', reason);

    if (reason === 'LOGOUT') {
        console.log('⚠️ User logged out - restart bot and scan QR again');
        process.exit(1);
    } else {
        console.log('🔄 Reconnecting in 5 seconds...');
        setTimeout(() => {
            client.initialize();
        }, 5000);
    }
});

// Main message handler
client.on('message', async (msg) => {
    try {
        // Skip own messages
        if (msg.fromMe) return;

        // Skip status updates
        if (msg.isStatus) return;

        // Only process group messages for link detection
        const chat = await msg.getChat();

        if (chat.isGroup) {
            await handleGroupMessage(msg, chat);
        }

    } catch (error) {
        console.error('❌ Error handling message:', error.message);
    }
});

// Handle group messages
async function handleGroupMessage(msg, chat) {
    try {
        // Check for invite links
        if (config.FEATURES.INVITE_LINK_DETECTION && msg.body) {
            const inviteLinkMatch = msg.body.match(config.PATTERNS.INVITE_LINK);

            if (inviteLinkMatch && inviteLinkMatch.length > 0) {
                console.log(`\n🚨 INVITE LINK DETECTED!`);
                console.log(`   Group: ${chat.name}`);
                console.log(`   Sender: ${msg.author || msg.from}`);
                console.log(`   Links: ${inviteLinkMatch.join(', ')}`);

                // Get sender info
                const sender = msg.author || msg.from;
                const senderContact = await client.getContactById(sender);

                // Check if sender is admin
                const participant = chat.participants.find(p => p.id._serialized === sender);
                const senderIsAdmin = participant && participant.isAdmin;

                // Check if sender is the bot owner (your number)
                const senderPhone = sender.split('@')[0];
                const isOwner = senderPhone === config.ADMIN_PHONE || senderPhone === config.ALERT_PHONE;

                if (senderIsAdmin || isOwner) {
                    console.log('   ✅ Sender is admin/owner, ignoring link');
                    return;
                }

                // Check cooldown
                const lastKick = kickCooldown.get(sender);
                if (lastKick && Date.now() - lastKick < KICK_COOLDOWN_MS) {
                    console.log('   ⏳ Cooldown active, skipping');
                    return;
                }

                // Try to delete message
                try {
                    await msg.delete(true); // Delete for everyone
                    console.log('   ✅ Deleted invite link message');
                } catch (deleteError) {
                    console.log('   ⚠️ Could not delete message:', deleteError.message);
                }

                // Try to kick user
                try {
                    await chat.removeParticipants([sender]);
                    console.log('   ✅ Removed user from group');

                    // Record kick time
                    kickCooldown.set(sender, Date.now());

                    // Send alert to admin
                    try {
                        const alertPhone = `${config.ALERT_PHONE}@c.us`;
                        const alertMessage =
                            `🚨 *Invite Link Alert*\n\n` +
                            `👤 User: ${senderContact.pushname || senderPhone}\n` +
                            `📱 Phone: +${senderPhone}\n` +
                            `🏷️ Group: ${chat.name}\n` +
                            `🔗 Link: ${inviteLinkMatch[0]}\n` +
                            `⚡ Action: User kicked and message deleted\n` +
                            `⏰ Time: ${new Date().toLocaleString()}`;

                        await client.sendMessage(alertPhone, alertMessage);
                        console.log('   ✅ Sent alert to admin');
                    } catch (alertError) {
                        console.log('   ⚠️ Could not send alert:', alertError.message);
                    }

                } catch (kickError) {
                    console.log('   ❌ Could not kick user:', kickError.message);
                    console.log('   💡 Make sure bot is admin in the group');
                }
            }
        }

        // Check for #kick command (admin only)
        if (msg.body && msg.body.trim().startsWith('#kick')) {
            console.log(`\n👮 #kick command detected`);
            console.log(`   Group: ${chat.name}`);
            console.log(`   Requester: ${msg.author || msg.from}`);

            // Check if command sender is admin
            const sender = msg.author || msg.from;
            const senderPhone = sender.split('@')[0];
            const participant = chat.participants.find(p => p.id._serialized === sender);
            const isAdmin = participant && participant.isAdmin;
            const isOwner = senderPhone === config.ADMIN_PHONE || senderPhone === config.ALERT_PHONE;

            if (!isAdmin && !isOwner) {
                console.log('   ❌ Requester is not admin');
                await msg.reply('❌ Only admins can use this command');
                return;
            }

            // Check if replying to someone
            if (!msg.hasQuotedMsg) {
                console.log('   ⚠️ No quoted message');
                await msg.reply('❌ Reply to a message with #kick to remove that user');
                return;
            }

            // Get quoted message
            const quotedMsg = await msg.getQuotedMessage();
            const targetUser = quotedMsg.author || quotedMsg.from;
            const targetPhone = targetUser.split('@')[0];

            console.log(`   Target: ${targetUser}`);

            // Don't kick admins or bot owner
            const targetParticipant = chat.participants.find(p => p.id._serialized === targetUser);
            const targetIsAdmin = targetParticipant && targetParticipant.isAdmin;
            const targetIsOwner = targetPhone === config.ADMIN_PHONE || targetPhone === config.ALERT_PHONE;

            if (targetIsAdmin || targetIsOwner) {
                console.log('   ❌ Target is admin/owner');
                await msg.reply('❌ Cannot kick admins or bot owner');
                return;
            }

            // Try to delete the quoted message
            try {
                await quotedMsg.delete(true);
                console.log('   ✅ Deleted quoted message');
            } catch (deleteError) {
                console.log('   ⚠️ Could not delete quoted message');
            }

            // Try to kick the user
            try {
                await chat.removeParticipants([targetUser]);
                console.log('   ✅ Removed user');
                await msg.reply('✅ User removed from group');
            } catch (kickError) {
                console.log('   ❌ Could not kick:', kickError.message);
                await msg.reply('❌ Failed to remove user. Make sure bot is admin.');
            }
        }

    } catch (error) {
        console.error('❌ Error in handleGroupMessage:', error.message);
    }
}

// Initialize client
console.log('🔄 Starting WhatsApp client...\n');
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await client.destroy();
    process.exit(0);
});
