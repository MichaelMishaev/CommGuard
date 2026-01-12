/**
 * Migration: Add alert_recipients column to groups table
 *
 * Run: node database/apply-alert-recipients.js
 */

require('dotenv').config(); // Load environment variables

const fs = require('fs');
const path = require('path');
const { pool, query, initDatabase } = require('./connection');

async function applyMigration() {
    console.log('🔧 Adding alert_recipients column to groups table...\n');

    // Initialize database connection
    await initDatabase();

    try {
        // Read SQL file
        const sqlPath = path.join(__dirname, 'add-alert-recipients.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        await query(sql);

        console.log('✅ Migration completed successfully!\n');

        // Verify column exists
        const result = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'groups'
            AND column_name = 'alert_recipients'
        `);

        if (result.rows.length > 0) {
            console.log('✅ Column "alert_recipients" verified in groups table\n');
            console.log('📊 Column details:');
            console.log('─'.repeat(60));
            console.log(`  Name: ${result.rows[0].column_name}`);
            console.log(`  Type: ${result.rows[0].data_type}`);
            console.log(`  Default: ${result.rows[0].column_default}`);
            console.log('─'.repeat(60));
        } else {
            console.error('❌ Column verification failed!');
            process.exit(1);
        }

        console.log('\n🎉 alert_recipients column is ready for use!');
        console.log('\n📝 Usage examples:');
        console.log('  - Add alert recipient: #bullyalert add 972501234567');
        console.log('  - Remove alert recipient: #bullyalert remove 972501234567');
        console.log('  - List recipients: #bullyalert list\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
