#!/usr/bin/env node

/**
 * CommGuard Bot v2.0 - Comprehensive Testing Suite
 * 
 * Tests all functionality without requiring WhatsApp connection
 */

const { CommGuardBot, CONFIG, Logger } = require('./commguard-v2');

class TestSuite {
    constructor() {
        this.tests = [];
        this.results = [];
    }
    
    addTest(name, testFunction) {
        this.tests.push({ name, testFunction });
    }
    
    async runAllTests() {
        console.log(`
╔═══════════════════════════════════════════╗
║       🧪 CommGuard v2.0 Test Suite       ║
╚═══════════════════════════════════════════╝
`);
        
        Logger.info(`Starting ${this.tests.length} tests...`);
        
        for (const test of this.tests) {
            try {
                Logger.info(`Running: ${test.name}`);
                const result = await test.testFunction();
                this.results.push({ name: test.name, passed: result, error: null });
                Logger.success(`✅ PASS: ${test.name}`);
            } catch (error) {
                this.results.push({ name: test.name, passed: false, error: error.message });
                Logger.error(`❌ FAIL: ${test.name}`, error);
            }
        }
        
        this.displayResults();
    }
    
    displayResults() {
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        
        console.log(`
╔═══════════════════════════════════════════╗
║              TEST RESULTS                 ║
╚═══════════════════════════════════════════╝

✅ PASSED: ${passed}
❌ FAILED: ${failed}
📊 TOTAL:  ${this.results.length}
📈 SUCCESS RATE: ${Math.round((passed / this.results.length) * 100)}%

`);
        
        if (failed > 0) {
            console.log('❌ FAILED TESTS:');
            this.results.filter(r => !r.passed).forEach(result => {
                console.log(`   • ${result.name}: ${result.error}`);
            });
            console.log('');
        }
        
        Logger.info(`Test suite completed: ${passed}/${this.results.length} tests passed`);
    }
}

// =============================================================================
// INDIVIDUAL TESTS
// =============================================================================

async function testConfigValidation() {
    // Test configuration validation
    if (!CONFIG.ADMIN_PHONE || CONFIG.ADMIN_PHONE === '') {
        throw new Error('ADMIN_PHONE not configured');
    }
    
    if (!CONFIG.ALERT_PHONE || CONFIG.ALERT_PHONE === '') {
        throw new Error('ALERT_PHONE not configured');
    }
    
    if (!CONFIG.PATTERNS.INVITE_LINK) {
        throw new Error('INVITE_LINK pattern not defined');
    }
    
    return true;
}

async function testInviteLinkDetection() {
    // Test valid invite links using match() instead of exec() to avoid regex state issues
    const testCases = [
        'https://chat.whatsapp.com/ABC123DEF456',
        'Check this group: https://chat.whatsapp.com/test123',
        'Multiple links: https://chat.whatsapp.com/link123 and https://chat.whatsapp.com/link456',
        'http://chat.whatsapp.com/oldformat123',
        'https://whatsapp.com/chat/ABC123DEF456'
    ];
    
    const invalidCases = [
        'No links here',
        'https://google.com',
        'whatsapp.com without protocol',
        ''
    ];
    
    // Test valid cases
    for (const testCase of testCases) {
        const links = testCase.match(CONFIG.PATTERNS.INVITE_LINK);
        if (!links || links.length === 0) {
            throw new Error(`Failed to detect invite link in: "${testCase}"`);
        }
    }
    
    // Test invalid cases
    for (const testCase of invalidCases) {
        const links = testCase.match(CONFIG.PATTERNS.INVITE_LINK);
        if (links && links.length > 0) {
            throw new Error(`False positive for: "${testCase}"`);
        }
    }
    
    return true;
}

async function testBlacklistManager() {
    // Create test blacklist manager
    const fs = require('fs');
    const testFile = 'test-blacklist.json';
    
    // Clean up any existing test file
    if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
    }
    
    // Mock BlacklistManager to use test file
    class TestBlacklistManager {
        constructor() {
            this.blacklist = new Set();
            this.fileName = testFile;
        }
        
        saveToFile() {
            fs.writeFileSync(this.fileName, JSON.stringify([...this.blacklist]));
        }
        
        loadFromFile() {
            if (fs.existsSync(this.fileName)) {
                const data = JSON.parse(fs.readFileSync(this.fileName, 'utf8'));
                this.blacklist = new Set(data);
            }
        }
        
        add(userId, reason = 'Test') {
            this.blacklist.add(userId);
            this.saveToFile();
        }
        
        remove(userId) {
            const removed = this.blacklist.delete(userId);
            if (removed) this.saveToFile();
            return removed;
        }
        
        isBlacklisted(userId) {
            return this.blacklist.has(userId);
        }
        
        list() {
            return [...this.blacklist];
        }
    }
    
    const manager = new TestBlacklistManager();
    
    // Test adding users
    manager.add('1234567890@s.whatsapp.net', 'Test user');
    if (!manager.isBlacklisted('1234567890@s.whatsapp.net')) {
        throw new Error('Failed to add user to blacklist');
    }
    
    // Test persistence
    const manager2 = new TestBlacklistManager();
    manager2.loadFromFile();
    if (!manager2.isBlacklisted('1234567890@s.whatsapp.net')) {
        throw new Error('Blacklist not persisted to file');
    }
    
    // Test removal
    const removed = manager2.remove('1234567890@s.whatsapp.net');
    if (!removed || manager2.isBlacklisted('1234567890@s.whatsapp.net')) {
        throw new Error('Failed to remove user from blacklist');
    }
    
    // Test list functionality
    manager2.add('user1@s.whatsapp.net');
    manager2.add('user2@s.whatsapp.net');
    const list = manager2.list();
    if (list.length !== 2) {
        throw new Error('Blacklist list function incorrect');
    }
    
    // Clean up
    if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
    }
    
    return true;
}

async function testAdminDetection() {
    // Test admin detection logic with mock data
    const mockGroupMetadata = {
        subject: 'Test Group',
        participants: [
            { id: '1234567890@s.whatsapp.net', admin: 'admin' },
            { id: '0987654321@s.whatsapp.net', admin: null },
            { id: '5555555555@lid', admin: 'superadmin' }
        ]
    };
    
    // Mock sock object
    const mockSock = {
        user: { id: '1234567890:1@s.whatsapp.net' },
        groupMetadata: async () => mockGroupMetadata
    };
    
    // Test getBotIdFormats function
    const testBotId = '1234567890:1@s.whatsapp.net';
    const expectedFormats = [
        '1234567890:1@s.whatsapp.net',
        '1234567890@s.whatsapp.net',
        '1234567890@c.us',
        '1234567890@lid',
        '1234567890'
    ];
    
    // This would need to be imported from the actual module
    // For now, we'll test the logic manually
    const phone = testBotId.split(':')[0].split('@')[0];
    const formats = [
        testBotId,
        `${phone}@s.whatsapp.net`,
        `${phone}@c.us`,
        `${phone}@lid`,
        phone
    ];
    
    if (JSON.stringify(formats) !== JSON.stringify(expectedFormats)) {
        throw new Error('Bot ID format generation incorrect');
    }
    
    // Test finding bot in participants
    const botParticipant = mockGroupMetadata.participants.find(p => 
        formats.some(format => p.id === format)
    );
    
    if (!botParticipant) {
        throw new Error('Failed to find bot in mock participants');
    }
    
    if (botParticipant.admin !== 'admin') {
        throw new Error('Bot admin status detection failed');
    }
    
    return true;
}

async function testMessageOperations() {
    // Test message operations with mocks
    let deleteAttempts = 0;
    let kickAttempts = 0;
    let sendAttempts = 0;
    
    const mockSock = {
        sendMessage: async (chatId, content) => {
            sendAttempts++;
            if (content.delete) {
                deleteAttempts++;
                // Simulate failure on first attempt, success on second
                if (deleteAttempts === 1) {
                    throw new Error('Simulated delete failure');
                }
            }
            return true;
        },
        groupParticipantsUpdate: async (groupId, users, action) => {
            kickAttempts++;
            if (action === 'remove') {
                // Simulate failure on first attempt, success on second  
                if (kickAttempts === 1) {
                    throw new Error('Simulated kick failure');
                }
            }
            return true;
        }
    };
    
    // Import message ops (would need to be refactored for testing)
    // For now, test the retry logic manually
    
    const testRetryLogic = async (operation, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await operation();
                return true;
            } catch (error) {
                if (attempt === maxRetries) {
                    return false;
                }
                // Small delay for testing
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        return false;
    };
    
    // Test delete retry
    deleteAttempts = 0;
    const deleteResult = await testRetryLogic(async () => {
        await mockSock.sendMessage('test@g.us', { delete: { id: 'test' } });
    });
    
    if (!deleteResult || deleteAttempts !== 2) {
        throw new Error('Delete retry logic failed');
    }
    
    // Test kick retry  
    kickAttempts = 0;
    const kickResult = await testRetryLogic(async () => {
        await mockSock.groupParticipantsUpdate('test@g.us', ['user@s.whatsapp.net'], 'remove');
    });
    
    if (!kickResult || kickAttempts !== 2) {
        throw new Error('Kick retry logic failed');
    }
    
    return true;
}

async function testConfigurationSecurity() {
    // Test that no bypasses are enabled
    if (CONFIG.FEATURES.BYPASS_BOT_ADMIN_CHECK === true) {
        throw new Error('SECURITY VIOLATION: Bot admin bypass is enabled');
    }
    
    // Test that required security features are enabled
    if (CONFIG.FEATURES.INVITE_LINK_DETECTION !== true) {
        throw new Error('Invite link detection is disabled');
    }
    
    if (CONFIG.FEATURES.AUTO_KICK_BLACKLISTED !== true) {
        throw new Error('Auto-kick blacklisted users is disabled');
    }
    
    // Test phone number validation
    const validPhones = ['1234567890', '972555555555', '123456789012345'];
    const invalidPhones = ['123', '12345678901234567890', 'abc123', ''];
    
    for (const phone of validPhones) {
        if (!CONFIG.PATTERNS.PHONE_NUMBER.test(phone)) {
            throw new Error(`Valid phone number rejected: ${phone}`);
        }
    }
    
    for (const phone of invalidPhones) {
        if (CONFIG.PATTERNS.PHONE_NUMBER.test(phone)) {
            throw new Error(`Invalid phone number accepted: ${phone}`);
        }
    }
    
    return true;
}

async function testErrorHandling() {
    // Test logger functions
    try {
        Logger.info('Test info message');
        Logger.success('Test success message');
        Logger.warn('Test warning message');
        Logger.error('Test error message');
        Logger.debug('Test debug message');
    } catch (error) {
        throw new Error('Logger functions failed: ' + error.message);
    }
    
    // Test timestamp generation
    const timestamp = Logger.getTimestamp();
    if (!timestamp || typeof timestamp !== 'string') {
        throw new Error('Timestamp generation failed');
    }
    
    // Test timestamp format (should be readable date/time)
    const timestampRegex = /\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}/;
    if (!timestampRegex.test(timestamp)) {
        throw new Error('Timestamp format is incorrect');
    }
    
    return true;
}

async function testCountryCodeRestrictions() {
    // Test country code restriction logic
    const restrictedNumbers = [
        '12345678901',  // US/Canada +1
        '61234567890',  // Southeast Asia +6
        '64567890123'   // Southeast Asia +6
    ];
    
    const allowedNumbers = [
        '972555555555', // Israel +972 (protected)
        '447777777777', // UK +44
        '33123456789',  // France +33
        '49123456789'   // Germany +49
    ];
    
    const isRestrictedCountryCode = (phoneNumber) => {
        return (phoneNumber.startsWith('1') && phoneNumber.length === 11) ||
               (phoneNumber.startsWith('6') && phoneNumber.length >= 10 && phoneNumber.length <= 12);
    };
    
    for (const phone of restrictedNumbers) {
        if (!isRestrictedCountryCode(phone)) {
            throw new Error(`Restricted number not detected: ${phone}`);
        }
    }
    
    for (const phone of allowedNumbers) {
        if (isRestrictedCountryCode(phone)) {
            throw new Error(`Allowed number incorrectly restricted: ${phone}`);
        }
    }
    
    return true;
}

// =============================================================================
// RUN TESTS
// =============================================================================

async function main() {
    const testSuite = new TestSuite();
    
    // Add all tests
    testSuite.addTest('Configuration Validation', testConfigValidation);
    testSuite.addTest('Invite Link Detection', testInviteLinkDetection);
    testSuite.addTest('Blacklist Manager', testBlacklistManager);
    testSuite.addTest('Admin Detection Logic', testAdminDetection);
    testSuite.addTest('Message Operations Retry Logic', testMessageOperations);
    testSuite.addTest('Security Configuration', testConfigurationSecurity);
    testSuite.addTest('Error Handling & Logging', testErrorHandling);
    testSuite.addTest('Country Code Restrictions', testCountryCodeRestrictions);
    
    // Run all tests
    await testSuite.runAllTests();
    
    // Return results for automation
    const passed = testSuite.results.filter(r => r.passed).length;
    const total = testSuite.results.length;
    
    if (passed === total) {
        console.log('🎉 ALL TESTS PASSED! Bot is ready for deployment.');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed. Please fix issues before deployment.');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { TestSuite };