// database/backup-database.js
// Create a full backup of the PostgreSQL database

const { initDatabase, query, closeDatabase } = require('./connection');
const fs = require('fs');
const path = require('path');
const { getTimestamp } = require('../utils/logger');
require('dotenv').config();

async function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../database_backups');
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

    console.log('[' + getTimestamp() + '] 🔄 Starting database backup...\n');

    try {
        // Initialize database connection
        console.log('[' + getTimestamp() + '] 🔌 Connecting to database...');
        initDatabase(process.env.DATABASE_URL);

        // Wait for connection to establish
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Ensure backup directory exists
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true});
            console.log('[' + getTimestamp() + '] 📁 Created backup directory');
        }

        const backup = {
            timestamp: new Date().toISOString(),
            database: 'commguard',
            version: '1.0',
            tables: {}
        };

        // Backup groups table
        console.log('[' + getTimestamp() + '] 📊 Backing up groups table...');
        const groupsResult = await query('SELECT * FROM groups ORDER BY id');
        backup.tables.groups = {
            count: groupsResult.rows.length,
            data: groupsResult.rows
        };
        console.log(`   ✅ ${groupsResult.rows.length} groups backed up`);

        // Backup users table
        console.log('[' + getTimestamp() + '] 👤 Backing up users table...');
        const usersResult = await query('SELECT * FROM users ORDER BY id');
        backup.tables.users = {
            count: usersResult.rows.length,
            data: usersResult.rows
        };
        console.log(`   ✅ ${usersResult.rows.length} users backed up`);

        // Backup group_members table
        console.log('[' + getTimestamp() + '] 👥 Backing up group_members table...');
        const membersResult = await query('SELECT * FROM group_members ORDER BY id');
        backup.tables.group_members = {
            count: membersResult.rows.length,
            data: membersResult.rows
        };
        console.log(`   ✅ ${membersResult.rows.length} group memberships backed up`);

        // Backup audit_log table (if exists)
        try {
            console.log('[' + getTimestamp() + '] 📝 Backing up audit_log table...');
            const auditResult = await query('SELECT * FROM audit_log ORDER BY id');
            backup.tables.audit_log = {
                count: auditResult.rows.length,
                data: auditResult.rows
            };
            console.log(`   ✅ ${auditResult.rows.length} audit log entries backed up`);
        } catch (err) {
            console.log('   ⚠️  audit_log table not found or empty');
        }

        // Write backup to file
        console.log('\n[' + getTimestamp() + '] 💾 Writing backup to file...');
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

        const fileSize = (fs.statSync(backupFile).size / 1024 / 1024).toFixed(2);
        console.log(`[' + getTimestamp() + '] ✅ Backup saved: ${backupFile}`);
        console.log(`   File size: ${fileSize} MB`);

        // Summary
        console.log('\n[' + getTimestamp() + '] 📊 Backup Summary:');
        console.log('   Groups:', backup.tables.groups.count);
        console.log('   Users:', backup.tables.users.count);
        console.log('   Group Members:', backup.tables.group_members.count);
        if (backup.tables.audit_log) {
            console.log('   Audit Logs:', backup.tables.audit_log.count);
        }

        console.log('\n[' + getTimestamp() + '] ✅ Database backup completed successfully!\n');

    } catch (error) {
        console.error('[' + getTimestamp() + '] ❌ Backup failed:', error.message);
        console.error(error);
        await closeDatabase();
        process.exit(1);
    } finally {
        await closeDatabase();
        process.exit(0);
    }
}

// Run backup
backupDatabase();
