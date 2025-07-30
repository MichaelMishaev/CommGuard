// Debug script to verify command flow
const CommandHandler = require('./services/commandHandler');

console.log('🔍 Testing Command Flow Detection\n');

// Mock socket object
const mockSock = {
    sendMessage: async (jid, message) => {
        console.log(`📤 Mock send to ${jid}:`, message.text);
        return true;
    },
    groupMetadata: async (groupId) => {
        return {
            participants: [
                { id: 'testuser@s.whatsapp.net', admin: null },
                { id: 'admin@s.whatsapp.net', admin: 'admin' }
            ]
        };
    },
    groupParticipantsUpdate: async (groupId, participants, action) => {
        console.log(`👢 Mock kick: ${participants} from ${groupId} (${action})`);
        return true;
    }
};

// Create command handler
const commandHandler = new CommandHandler(mockSock);

// Mock message for #kick command (reply to another message)
const mockKickMessage = {
    key: {
        remoteJid: 'testgroup@g.us',
        participant: 'admin@s.whatsapp.net'
    },
    message: {
        extendedTextMessage: {
            text: '#kick',
            contextInfo: {
                quotedMessage: { conversation: 'test message' },
                participant: 'testuser@s.whatsapp.net'
            }
        }
    }
};

// Test #kick command flow
async function testKickCommand() {
    console.log('🧪 Testing #kick command detection...\n');
    
    try {
        const result = await commandHandler.handleCommand(
            mockKickMessage,
            '#kick',
            '',
            true, // isAdmin
            false // isSuperAdmin
        );
        
        console.log(`\n✅ Command handler returned: ${result}`);
        console.log('If you see kick logs above, the command is working!\n');
        
    } catch (error) {
        console.error('❌ Error in command handling:', error);
    }
}

// Test command parsing from message text
function testCommandParsing() {
    console.log('🧪 Testing command parsing...\n');
    
    const testMessages = [
        '#kick',
        '#help',
        'normal message',
        '#kick user',
        '  #kick  '
    ];
    
    testMessages.forEach(text => {
        const isCommand = text.startsWith('#');
        const parts = text.trim().split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1).join(' ');
        
        console.log(`Text: "${text}"`);
        console.log(`  Is command: ${isCommand}`);
        console.log(`  Command: "${command}"`);
        console.log(`  Args: "${args}"`);
        console.log('');
    });
}

// Run tests
async function runTests() {
    console.log('🚀 Starting command flow debugging...\n');
    
    testCommandParsing();
    await testKickCommand();
    
    console.log('✅ Debug complete! Check the output above.');
    console.log('\nNext steps:');
    console.log('1. If mock kick worked, the command logic is correct');
    console.log('2. Check if the actual bot is processing commands');
    console.log('3. Verify the bot is receiving the reply context correctly');
}

runTests().catch(console.error);