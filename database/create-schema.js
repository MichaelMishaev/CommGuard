// database/create-schema.js
// Apply database schema to Railway PostgreSQL

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function createSchema() {
    console.log('📋 Creating Database Schema...\n');

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log(`✅ Loaded schema from: ${schemaPath}`);
    console.log(`📦 Schema size: ${(schema.length / 1024).toFixed(1)} KB\n`);

    // Connect to PostgreSQL
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    console.log('🔌 Connecting to Railway PostgreSQL...');

    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Connected successfully\n');

        console.log('🏗️  Creating tables, indexes, views, triggers...');
        console.log('   (This may take 10-30 seconds)\n');

        // Execute schema
        await pool.query(schema);

        console.log('✅ Schema created successfully!\n');

        // Verify tables
        const result = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        console.log('📊 Created tables:');
        result.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        // Check views
        const views = await pool.query(`
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('\n📊 Created views:');
        views.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        console.log('\n' + '='.repeat(60));
        console.log('🎉 Database schema created successfully!');
        console.log('='.repeat(60));
        console.log('\n✅ Next step: Run migration to import all WhatsApp data');
        console.log('   Command: npm run migrate\n');

    } catch (error) {
        console.error('❌ Error creating schema:', error.message);
        console.error('\nFull error:');
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

createSchema();
