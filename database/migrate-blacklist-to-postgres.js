#!/usr/bin/env node

/**
 * Blacklist Migration Script
 *
 * This script migrates the blacklist from the JSON cache to PostgreSQL,
 * filtering out invalid entries and preserving only users with real violations.
 *
 * What it does:
 * 1. Reads blacklist_cache.json
 * 2. Checks PostgreSQL for each user's violations
 * 3. Removes:
 *    - LID format entries without real phone mapping
 *    - Group IDs (@g.us)
 *    - Users with NO violations in PostgreSQL
 *    - Israeli numbers (should never be auto-blacklisted)
 * 4. Keeps ONLY users with real violations
 * 5. Creates a backup before making changes
 * 6. Generates a detailed report
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { initDatabase, query } = require('./connection');
const { getUserByPhone, getViolations, formatViolations } = require('./groupService');
const { getTimestamp } = require('../utils/logger');

const CACHE_FILE = path.join(__dirname, '..', 'blacklist_cache.json');
const BACKUP_FILE = path.join(__dirname, '..', `blacklist_cache.backup.${Date.now()}.json`);

async function migrateBlacklist() {
    console.log(`[${getTimestamp()}] 🚀 Starting Blacklist Migration...\n`);

    // Step 1: Check if PostgreSQL is available
    if (!process.env.DATABASE_URL) {
        console.error(`[${getTimestamp()}] ❌ ERROR: DATABASE_URL not set. Cannot migrate without PostgreSQL.`);
        console.error('   Please set DATABASE_URL in your .env file.');
        process.exit(1);
    }

    // Initialize database connection
    try {
        initDatabase(process.env.DATABASE_URL);
        // Wait for connection to be established
        await new Promise(resolve => setTimeout(resolve, 2000));
        await query('SELECT 1');
        console.log(`[${getTimestamp()}] ✅ PostgreSQL connection verified\n`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ ERROR: Cannot connect to PostgreSQL:`, error.message);
        process.exit(1);
    }

    // Step 2: Read current blacklist cache
    if (!fs.existsSync(CACHE_FILE)) {
        console.log(`[${getTimestamp()}] ⚠️  No blacklist_cache.json found. Nothing to migrate.`);
        return;
    }

    console.log(`[${getTimestamp()}] 📖 Reading blacklist_cache.json...`);
    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const originalBlacklist = cacheData.blacklist || [];
    console.log(`[${getTimestamp()}]    Found ${originalBlacklist.length} entries\n`);

    // Step 3: Create backup
    console.log(`[${getTimestamp()}] 💾 Creating backup...`);
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`[${getTimestamp()}]    Backup saved to: ${BACKUP_FILE}\n`);

    // Step 4: Analyze and filter entries
    console.log(`[${getTimestamp()}] 🔍 Analyzing entries...\n`);

    const stats = {
        total: originalBlacklist.length,
        groupIds: 0,
        lidFormat: 0,
        israeliNumbers: 0,
        noViolations: 0,
        withViolations: 0,
        kept: [],
        removed: []
    };

    const validEntries = [];
    const detailedReport = [];

    for (let i = 0; i < originalBlacklist.length; i++) {
        const entry = originalBlacklist[i];
        const normalized = entry.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '').replace('@g.us', '');

        if (i % 100 === 0 && i > 0) {
            console.log(`[${getTimestamp()}]    Progress: ${i}/${originalBlacklist.length} entries analyzed...`);
        }

        // Filter 1: Remove group IDs
        if (entry.includes('@g.us')) {
            stats.groupIds++;
            stats.removed.push({ id: normalized, reason: 'Group ID', violations: 'N/A' });
            continue;
        }

        // Filter 2: Check if it's Israeli number
        if (normalized.startsWith('972')) {
            stats.israeliNumbers++;
            detailedReport.push(`⚠️  ISRAELI NUMBER FOUND: ${normalized} - Should NEVER be auto-blacklisted!`);
            stats.removed.push({ id: normalized, reason: 'Israeli number', violations: 'N/A' });
            continue;
        }

        // Filter 3: Check if LID format
        const isLidFormat = entry.includes('@lid');
        if (isLidFormat && normalized.length > 15) {
            stats.lidFormat++;
            stats.removed.push({ id: normalized, reason: 'LID format (encrypted ID)', violations: 'N/A' });
            continue;
        }

        // Filter 4: Check PostgreSQL for violations
        try {
            const user = await getUserByPhone(normalized);
            const violations = user?.violations || {};
            const violationCount = Object.values(violations).reduce((sum, count) => sum + count, 0);

            if (violationCount === 0) {
                stats.noViolations++;
                stats.removed.push({
                    id: normalized,
                    reason: 'No violations in database',
                    violations: formatViolations(violations)
                });
            } else {
                stats.withViolations++;
                validEntries.push(normalized);
                stats.kept.push({
                    id: normalized,
                    violations: formatViolations(violations),
                    count: violationCount
                });
                detailedReport.push(`✅ KEPT: ${normalized} - ${formatViolations(violations)} (${violationCount} total)`);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}]    ⚠️  Error checking ${normalized}:`, error.message);
            stats.removed.push({ id: normalized, reason: `Database error: ${error.message}`, violations: 'N/A' });
        }
    }

    // Step 5: Generate report
    console.log(`\n[${getTimestamp()}] 📊 MIGRATION REPORT\n`);
    console.log('='.repeat(80));
    console.log(`Total entries analyzed:           ${stats.total}`);
    console.log(`Group IDs removed:                ${stats.groupIds}`);
    console.log(`LID formats removed:              ${stats.lidFormat}`);
    console.log(`Israeli numbers removed:          ${stats.israeliNumbers}`);
    console.log(`Entries with NO violations:       ${stats.noViolations}`);
    console.log(`Entries WITH violations (kept):   ${stats.withViolations}`);
    console.log('='.repeat(80));
    console.log(`\n✅ REDUCTION: ${stats.total - stats.withViolations} entries removed (${Math.round((1 - stats.withViolations / stats.total) * 100)}% cleanup)`);
    console.log(`✅ NEW SIZE: ${stats.withViolations} entries (from ${stats.total})\n`);

    // Step 6: Show entries that will be kept
    if (stats.kept.length > 0) {
        console.log('📋 ENTRIES BEING KEPT (with violations):\n');
        stats.kept.forEach((item, index) => {
            console.log(`${index + 1}. ${item.id}`);
            console.log(`   Violations: ${item.violations} (${item.count} total)\n`);
        });
    } else {
        console.log('⚠️  NO ENTRIES HAVE VIOLATIONS - Blacklist will be empty!\n');
    }

    // Step 7: Ask for confirmation
    console.log('⚠️  IMPORTANT: This will update blacklist_cache.json');
    console.log(`   Backup saved at: ${BACKUP_FILE}\n`);

    // For automated execution, add --yes flag
    const autoConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

    if (!autoConfirm) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => {
            readline.question('Continue with migration? (yes/no): ', resolve);
        });
        readline.close();

        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            console.log(`\n[${getTimestamp()}] ❌ Migration cancelled. Blacklist unchanged.`);
            return;
        }
    }

    // Step 8: Write cleaned blacklist
    console.log(`\n[${getTimestamp()}] 💾 Writing cleaned blacklist...`);
    const cleanedCache = {
        timestamp: Date.now(),
        blacklist: validEntries
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cleanedCache, null, 2));
    console.log(`[${getTimestamp()}] ✅ Updated ${CACHE_FILE}\n`);

    // Step 9: Save detailed report
    const reportFile = path.join(__dirname, '..', `blacklist_migration_report.${Date.now()}.txt`);
    const reportContent = [
        'BLACKLIST MIGRATION REPORT',
        '='.repeat(80),
        `Date: ${new Date().toISOString()}`,
        `Original entries: ${stats.total}`,
        `Final entries: ${stats.withViolations}`,
        `Removed: ${stats.total - stats.withViolations}`,
        '',
        'REMOVED ENTRIES:',
        '='.repeat(80),
        ...stats.removed.map((item, i) => `${i + 1}. ${item.id} - ${item.reason} - ${item.violations}`),
        '',
        'KEPT ENTRIES:',
        '='.repeat(80),
        ...stats.kept.map((item, i) => `${i + 1}. ${item.id} - ${item.violations} (${item.count} total violations)`),
        '',
        ...detailedReport
    ].join('\n');

    fs.writeFileSync(reportFile, reportContent);
    console.log(`[${getTimestamp()}] 📄 Detailed report saved to: ${reportFile}\n`);

    console.log(`[${getTimestamp()}] ✅ Migration complete!\n`);
    console.log('Next steps:');
    console.log('1. Review the report to verify changes');
    console.log('2. Restart the bot to load the cleaned blacklist');
    console.log('3. If something went wrong, restore from backup:\n');
    console.log(`   cp ${BACKUP_FILE} ${CACHE_FILE}\n`);
}

// Run migration
if (require.main === module) {
    migrateBlacklist()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(`[${getTimestamp()}] ❌ MIGRATION FAILED:`, error);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = { migrateBlacklist };
