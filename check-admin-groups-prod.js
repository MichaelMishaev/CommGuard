/**
 * Check which groups the bot is admin in - Production Server
 */
const { Client } = require('pg');
require('dotenv').config();

async function checkAdminGroups() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected\n');

        // Get all groups
        const groupsQuery = `
            SELECT
                g.id,
                g.name,
                g.whatsapp_group_id,
                g.member_count,
                g.admin_count,
                g.bot_joined_at
            FROM groups g
            WHERE g.is_active = true
            ORDER BY g.name;
        `;

        const result = await client.query(groupsQuery);
        const groups = result.rows;

        console.log(`📊 Total Active Groups: ${groups.length}\n`);

        if (groups.length === 0) {
            console.log('❌ No groups found in database.');
            console.log('💡 The bot needs to sync groups to database first.');
            console.log('💡 Run: cd /root/CommGuard && node database/migrate-groups-to-db.js\n');
            return;
        }

        // Check bot admin status for each group
        console.log('🔍 Checking bot admin status...\n');

        for (const group of groups) {
            const cacheQuery = `
                SELECT is_bot_admin, cached_at
                FROM bot_admin_cache
                WHERE whatsapp_group_id = $1
                ORDER BY cached_at DESC
                LIMIT 1;
            `;
            const cacheResult = await client.query(cacheQuery, [group.whatsapp_group_id]);
            const cache = cacheResult.rows[0];

            const isAdmin = cache?.is_bot_admin || false;
            const icon = isAdmin ? '✅' : '❌';
            const status = isAdmin ? 'ADMIN' : 'NOT ADMIN';

            console.log(`${icon} ${group.name}`);
            console.log(`   Status: ${status}`);
            console.log(`   Members: ${group.member_count || 0}`);
            console.log(`   ID: ${group.whatsapp_group_id}`);
            console.log('');
        }

        // Summary
        const adminGroupsQuery = `
            SELECT COUNT(DISTINCT whatsapp_group_id) as count
            FROM bot_admin_cache
            WHERE is_bot_admin = true;
        `;
        const summaryResult = await client.query(adminGroupsQuery);
        const adminCount = parseInt(summaryResult.rows[0]?.count || 0);

        console.log('\n📊 Summary:');
        console.log('==========');
        console.log(`Total Groups: ${groups.length}`);
        console.log(`Bot is Admin in: ${adminCount} groups`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

checkAdminGroups();
