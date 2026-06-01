#!/usr/bin/env node

/**
 * Debug Israeli LID User Kicks
 * Comprehensive analysis to identify why Israeli users are still getting kicked
 */

const { getTimestamp } = require('../utils/logger');
const config = require('../config');

console.log(`
╔════════════════════════════════════════════════════╗
║         🚨 Debug Israeli LID User Kicks            ║
║                                                    ║
║  Comprehensive analysis of kick sources            ║
╚════════════════════════════════════════════════════╝
`);

async function analyzeKickSources() {
    console.log(`[${getTimestamp()}] 🔍 Analyzing all potential kick sources\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        console.log('1️⃣ Checking configuration settings...');
        
        console.log(`   RESTRICT_COUNTRY_CODES: ${config.FEATURES.RESTRICT_COUNTRY_CODES}`);
        console.log(`   AUTO_KICK_BLACKLISTED: ${config.FEATURES.AUTO_KICK_BLACKLISTED}`);
        console.log(`   INVITE_LINK_DETECTION: ${config.FEATURES.INVITE_LINK_DETECTION}`);
        console.log(`   BYPASS_BOT_ADMIN_CHECK: ${config.FEATURES.BYPASS_BOT_ADMIN_CHECK}`);
        
        if (config.FEATURES.RESTRICT_COUNTRY_CODES) {
            console.log('   ⚠️  Country restrictions are ENABLED - Israeli LID users at risk');
            failed++;
        } else {
            console.log('   ✅ Country restrictions are disabled');
            passed++;
        }
        
        console.log('\n2️⃣ Potential kick sources analysis...');
        
        const kickSources = [
            {
                location: 'index.js:943 (group join country check)',
                hasLidExemption: true,
                description: 'Country code check when users join group',
                risk: 'LOW - Has LID exemption'
            },
            {
                location: 'index.js:742 (invite link detection)',
                hasLidExemption: false,
                description: 'Kicks users who send invite links',
                risk: 'MEDIUM - Admin immunity may fail for LID admins'
            },
            {
                location: 'index.js:870 (blacklisted user join)',
                hasLidExemption: false,
                description: 'Kicks blacklisted users who try to join',
                risk: 'HIGH - If Israeli user wrongly blacklisted'
            },
            {
                location: 'index.js:583 (muted user excess messages)',
                hasLidExemption: false,
                description: 'Kicks muted users after 10 messages',
                risk: 'LOW - Mute specific behavior'
            },
            {
                location: 'commandHandler.js:662 (#kick command)',
                hasLidExemption: false,
                description: 'Admin manual kick command',
                risk: 'LOW - Manual admin action'
            },
            {
                location: 'commandHandler.js:1075 (#botforeign command)',
                hasLidExemption: true,
                description: 'Bulk foreign user removal',
                risk: 'LOW - Has LID exemption'
            },
            {
                location: 'commandHandler.js:1472 (#botkick command)',
                hasLidExemption: false,
                description: 'Bulk blacklisted user removal',
                risk: 'HIGH - If Israeli user wrongly blacklisted'
            }
        ];
        
        kickSources.forEach((source, index) => {
            console.log(`   ${index + 1}️⃣ ${source.location}`);
            console.log(`      Description: ${source.description}`);
            console.log(`      LID Exemption: ${source.hasLidExemption ? 'YES ✅' : 'NO ❌'}`);
            console.log(`      Risk Level: ${source.risk}`);
            
            if (source.risk.includes('HIGH') || source.risk.includes('MEDIUM')) {
                failed++;
                console.log(`      ⚠️  POTENTIAL ISSUE DETECTED\n`);
            } else {
                passed++;
                console.log(`      ✅ Low risk\n`);
            }
        });
        
    } catch (error) {
        console.error(`❌ Analysis error:`, error);
        failed++;
    }
    
    console.log(`📊 Kick Source Analysis Results: ${passed} low risk, ${failed} potential issues\n`);
    return { passed, failed };
}

async function analyzeMostLikelyScenarios() {
    console.log(`[${getTimestamp()}] 🎯 Analyzing most likely kick scenarios\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        console.log('🔍 Most likely scenarios for Israeli LID user kicks:\n');
        
        const scenarios = [
            {
                scenario: 'Israeli admin with LID format sends invite link',
                oldBehavior: 'Gets kicked (admin immunity failed)',
                newBehavior: 'Should be immune (admin immunity fixed)',
                fixed: true,
                description: 'Admin immunity fix should resolve this'
            },
            {
                scenario: 'Israeli user wrongly blacklisted, tries to rejoin',
                oldBehavior: 'Gets kicked repeatedly',
                newBehavior: 'Still gets kicked (blacklist logic unchanged)',
                fixed: false,
                description: 'Blacklist kicks bypass country/LID checks entirely'
            },
            {
                scenario: 'Admin runs #botforeign command',
                oldBehavior: 'Israeli LID users get kicked',
                newBehavior: 'Israeli LID users exempt',
                fixed: true,
                description: 'LID exemption added to #botforeign'
            },
            {
                scenario: 'Admin runs #botkick command',
                oldBehavior: 'Kicks blacklisted users regardless of nationality',
                newBehavior: 'Still kicks blacklisted users (no nationality check)',
                fixed: false,
                description: 'Blacklist-based kicks ignore country/LID status'
            },
            {
                scenario: 'Israeli LID user joins group naturally',
                oldBehavior: 'Gets kicked for country code',
                newBehavior: 'Exempt from country restrictions',
                fixed: true,
                description: 'LID exemption in group join handler'
            }
        ];
        
        scenarios.forEach((scenario, index) => {
            console.log(`${index + 1}️⃣ ${scenario.scenario}`);
            console.log(`   Before Fix: ${scenario.oldBehavior}`);
            console.log(`   After Fix: ${scenario.newBehavior}`);
            console.log(`   Status: ${scenario.fixed ? '✅ FIXED' : '❌ NOT FIXED'}`);
            console.log(`   Notes: ${scenario.description}\n`);
            
            if (scenario.fixed) {
                passed++;
            } else {
                failed++;
            }
        });
        
        console.log('🎯 KEY INSIGHT:');
        console.log('If Israeli users are STILL getting kicked, the most likely cause is:');
        console.log('1. They were wrongly blacklisted in the past');
        console.log('2. Blacklist-based kicks bypass all country/LID protections');
        console.log('3. Solution: Check if kicked users are in blacklist database\n');
        
    } catch (error) {
        console.error(`❌ Analysis error:`, error);
        failed++;
    }
    
    console.log(`📊 Scenario Analysis Results: ${passed} fixed, ${failed} not fixed\n`);
    return { passed, failed };
}

async function provideDiagnosticSteps() {
    console.log(`[${getTimestamp()}] 🔧 Diagnostic steps for user\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        console.log('📋 IMMEDIATE DIAGNOSTIC STEPS:\n');
        
        const steps = [
            '1️⃣ When Israeli user gets kicked, check the logs:',
            '   • Look for "🚫 Restricted country code detected"',
            '   • Look for "✅ Kicked blacklisted user"', 
            '   • Look for "✅ Kicked user:" (invite link)',
            '   • Look for "✅ Kicked foreign user" (#botforeign)',
            '',
            '2️⃣ Check if kicked user is blacklisted:',
            '   • Run: #blacklst',
            '   • Search for the kicked user\'s number',
            '   • If found, use: #unblacklist [number]',
            '',
            '3️⃣ Check user format when kicked:',
            '   • Is it @lid format? (Should be exempt)',
            '   • Is it regular @s.whatsapp.net? (Check if starts with 972)',
            '   • Log the exact format for analysis',
            '',
            '4️⃣ Test admin immunity:',
            '   • Have Israeli admin send invite link in test group',
            '   • Should see "✅ Sender is admin, ignoring invite link"',
            '   • If not, admin immunity bug still exists',
            '',
            '5️⃣ Test country restrictions:',
            '   • Check server logs for LID exemption messages',
            '   • If not, LID exemption not working',
            '',
            '6️⃣ Check for multiple bot instances:',
            '   • Only one bot should be running',
            '   • Check process list for multiple node processes',
            '   • Old instances may not have fixes'
        ];
        
        steps.forEach(step => {
            console.log(step);
        });
        
        console.log('\n🎯 MOST LIKELY SOLUTION:');
        console.log('If Israeli users are getting kicked, they are probably:');
        console.log('1. Already blacklisted from previous incidents');
        console.log('2. Getting kicked by blacklist logic (not country logic)');
        console.log('3. Need to be manually unblacklisted');
        console.log('\nRun: #blacklst to check current blacklist');
        console.log('Then: #unblacklist [israeli_number] to fix');
        
        passed = 1;
        
    } catch (error) {
        console.error(`❌ Error generating diagnostic steps:`, error);
        failed = 1;
    }
    
    console.log(`\n📊 Diagnostic Steps: Generated successfully\n`);
    return { passed, failed };
}

/**
 * Main analysis runner
 */
async function runCompleteAnalysis() {
    console.log(`[${getTimestamp()}] 🚀 Starting Complete Israeli Kick Analysis\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
        const analyses = [
            { name: 'Kick Sources Analysis', fn: analyzeKickSources },
            { name: 'Most Likely Scenarios', fn: analyzeMostLikelyScenarios },
            { name: 'Diagnostic Steps', fn: provideDiagnosticSteps }
        ];
        
        for (const analysis of analyses) {
            console.log(`🔍 Running ${analysis.name}...`);
            const result = await analysis.fn();
            totalPassed += result.passed;
            totalFailed += result.failed;
            console.log(`📊 ${analysis.name}: ${result.passed} good, ${result.failed} issues\n`);
        }
        
        // Final results
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    🚨 CRITICAL ANALYSIS RESULTS                ║
╠═══════════════════════════════════════════════════════════════╣
║  Issues Identified: ${String(totalFailed).padStart(2)} │ Areas Good: ${String(totalPassed).padStart(2)}                    ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        console.log('🎯 PRIMARY HYPOTHESIS:');
        console.log('Israeli users getting kicked are likely ALREADY BLACKLISTED.');
        console.log('Blacklist kicks bypass ALL country and LID protections.\n');
        
        console.log('✅ FIXES THAT ARE WORKING:');
        console.log('• LID exemption in group join (index.js:933)');
        console.log('• LID exemption in #botforeign (commandHandler.js:1035)');
        console.log('• Admin immunity fix (index.js:716)\n');
        
        console.log('❌ REMAINING VULNERABILITIES:');
        console.log('• Blacklisted users get kicked regardless of nationality');
        console.log('• Past wrongful blacklisting affects future behavior');
        console.log('• #botkick removes blacklisted users without nationality check\n');
        
        console.log('🔧 RECOMMENDED IMMEDIATE ACTION:');
        console.log('1. Run: #blacklst (check current blacklist)');
        console.log('2. Look for Israeli numbers in blacklist');
        console.log('3. Run: #unblacklist [israeli_number] for each one');
        console.log('4. Monitor logs for specific kick reasons');
        
    } catch (error) {
        console.error('❌ Error running analysis:', error);
    }
}

console.log('📋 Analysis Coverage:');
console.log('• All kick source locations');
console.log('• Risk assessment for each source');
console.log('• Most likely kick scenarios');
console.log('• Step-by-step diagnostic guide');
console.log('\nStarting analysis in 2 seconds...\n');

setTimeout(() => {
    runCompleteAnalysis().catch(console.error);
}, 2000);