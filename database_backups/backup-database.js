#!/usr/bin/env node
// Database Backup Script - Creates SQL dump via Node.js pg client

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(__dirname, `commguard_backup_${timestamp}.sql`);

    console.log('🔄 Starting database backup...');
    console.log(`📁 Backup file: ${backupFile}`);

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const writeStream = fs.createWriteStream(backupFile);

        // Write header
        writeStream.write(`-- CommGuard Database Backup\n`);
        writeStream.write(`-- Created: ${new Date().toISOString()}\n`);
        writeStream.write(`-- Database: ${process.env.DATABASE_URL.split('@')[1]}\n\n`);

        // Get all tables
        const tablesResult = await client.query(`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);

        console.log(`📊 Found ${tablesResult.rows.length} tables`);

        for (const row of tablesResult.rows) {
            const tableName = row.tablename;
            console.log(`   📋 Backing up table: ${tableName}`);

            // Get table structure
            const structureResult = await client.query(`
                SELECT
                    'CREATE TABLE ' || quote_ident(table_name) || ' (' ||
                    string_agg(
                        quote_ident(column_name) || ' ' ||
                        data_type ||
                        CASE WHEN character_maximum_length IS NOT NULL
                            THEN '(' || character_maximum_length || ')'
                            ELSE ''
                        END ||
                        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                        ', '
                    ) || ');' as create_statement
                FROM information_schema.columns
                WHERE table_name = $1
                GROUP BY table_name
            `, [tableName]);

            if (structureResult.rows.length > 0) {
                writeStream.write(`\n-- Table: ${tableName}\n`);
                writeStream.write(`DROP TABLE IF EXISTS ${tableName} CASCADE;\n`);
                writeStream.write(structureResult.rows[0].create_statement + '\n\n');
            }

            // Get data
            const dataResult = await client.query(`SELECT * FROM ${tableName}`);

            if (dataResult.rows.length > 0) {
                writeStream.write(`-- Data for ${tableName} (${dataResult.rows.length} rows)\n`);

                for (const dataRow of dataResult.rows) {
                    const columns = Object.keys(dataRow);
                    const values = columns.map(col => {
                        const val = dataRow[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                        if (val instanceof Date) return `'${val.toISOString()}'`;
                        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                        return val;
                    });

                    writeStream.write(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`);
                }
                writeStream.write('\n');
            }
        }

        writeStream.end();

        await new Promise((resolve) => writeStream.on('finish', resolve));

        const stats = fs.statSync(backupFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`\n✅ Backup completed successfully!`);
        console.log(`📁 File: ${backupFile}`);
        console.log(`📊 Size: ${fileSizeMB} MB`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);

    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        throw error;
    } finally {
        await client.end();
    }
}

// Run backup
backupDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
