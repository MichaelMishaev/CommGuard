/**
 * Check Production - List all groups where bot is admin
 * Connects to Railway PostgreSQL database
 */

const { Client } = require('pg');
require('dotenv').config();

async function checkProdAdminGroups() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔌 Connecting to production database...');
        await client.connect();
        console.log('✅ Connected to production PostgreSQL\n');

        // Check if is_mine column exists
        const columnCheckQuery = `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'groups'
            AND column_name IN ('is_mine', 'category', 'notes', 'last_message_at');
        `;
        const columnCheck = await client.query(columnCheckQuery);
        const existingColumns = columnCheck.rows.map(r => r.column_name);

        const hasIsMine = existingColumns.includes('is_mine');
        const hasCategory = existingColumns.includes('category');
        const hasNotes = existingColumns.includes('notes');
        const hasLastMessage = existingColumns.includes('last_message_at');

        // Get all groups from production
        const groupsQuery = `
            SELECT
                whatsapp_group_id,
                name,
                created_at
                ${hasLastMessage ? ', last_message_at' : ''}
                ${hasIsMine ? ', is_mine' : ''}
                ${hasCategory ? ', category' : ''}
                ${hasNotes ? ', notes' : ''}
            FROM groups
            ${hasLastMessage ? 'ORDER BY last_message_at DESC NULLS LAST' : 'ORDER BY created_at DESC'}
        `;

        const groupsResult = await client.query(groupsQuery);
        const allGroups = groupsResult.rows;

        console.log(`📊 Total groups in database: ${allGroups.length}\n`);

        // Get groups marked as "mine" (owned groups)
        if (hasIsMine) {
            const myGroups = allGroups.filter(g => g.is_mine);
            console.log(`👑 Groups marked as "mine": ${myGroups.length}`);
            if (myGroups.length > 0) {
                console.log('\nOwned Groups:');
                console.log('=============');
                for (const group of myGroups) {
                    console.log(`\n📁 ${group.name}`);
                    console.log(`   ID: ${group.whatsapp_group_id}`);
                    if (hasCategory) console.log(`   Category: ${group.category || 'None'}`);
                    if (hasNotes) console.log(`   Notes: ${group.notes || 'None'}`);
                    if (hasLastMessage) console.log(`   Last Active: ${group.last_message_at || 'Never'}`);
                }
            }
        }

        // Get member counts for all groups
        console.log('\n\n📋 All Groups Summary:');
        console.log('=====================\n');

        for (const group of allGroups) {
            // Get member count
            const memberQuery = `
                SELECT COUNT(*) as member_count
                FROM group_members
                WHERE whatsapp_group_id = $1
                AND status = 'active';
            `;
            const memberResult = await client.query(memberQuery, [group.whatsapp_group_id]);
            const memberCount = parseInt(memberResult.rows[0]?.member_count || 0);

            // Get bot admin cache
            const cacheQuery = `
                SELECT is_bot_admin, cached_at
                FROM bot_admin_cache
                WHERE whatsapp_group_id = $1
                ORDER BY cached_at DESC
                LIMIT 1;
            `;
            const cacheResult = await client.query(cacheQuery, [group.whatsapp_group_id]);
            const botAdminStatus = cacheResult.rows[0];

            const adminStatus = botAdminStatus?.is_bot_admin ? '✅ ADMIN' : '❌ NOT ADMIN';
            const cacheAge = botAdminStatus?.cached_at
                ? `(cached ${Math.round((Date.now() - new Date(botAdminStatus.cached_at).getTime()) / 60000)} min ago)`
                : '(no cache)';

            const isMine = hasIsMine && group.is_mine;
            console.log(`${isMine ? '👑' : '📌'} ${group.name}`);
            console.log(`   Status: ${adminStatus} ${cacheAge}`);
            console.log(`   Members: ${memberCount}`);
            console.log(`   ID: ${group.whatsapp_group_id}`);
            console.log('');
        }

        // Summary statistics
        console.log('\n📊 Summary:');
        console.log('==========');
        console.log(`Total Groups: ${allGroups.length}`);
        if (hasIsMine) {
            const myGroupsCount = allGroups.filter(g => g.is_mine).length;
            console.log(`Owned Groups: ${myGroupsCount}`);
        }
        console.log(`\nNote: Bot admin status is cached. For real-time status, bot needs to be running.`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.end();
        console.log('\n🔌 Disconnected from database');
    }
}

// Run the check
checkProdAdminGroups();
