/**
 * List all groups where bot is admin - Direct query
 */
const { Client } = require('pg');
require('dotenv').config();

const BOT_PHONE = '972544345287'; // Admin phone from .env

async function listBotAdminGroups() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();

        // Get all groups and check if bot is admin
        const query = `
            SELECT DISTINCT
                g.name,
                g.whatsapp_group_id,
                g.member_count,
                gm.is_admin,
                gm.is_super_admin
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            LEFT JOIN users u ON gm.user_id = u.id
            WHERE g.is_active = true
            AND u.phone_number = $1
            AND gm.is_active = true
            ORDER BY g.name;
        `;

        const result = await client.query(query, [BOT_PHONE]);
        const botGroups = result.rows;

        console.log('\n📊 Groups where bot is a member:');
        console.log('=================================\n');

        if (botGroups.length === 0) {
            console.log('❌ Bot is not a member of any groups in the database.');
        } else {
            for (const group of botGroups) {
                const adminStatus = group.is_super_admin ? '👑 SUPER ADMIN' :
                                   group.is_admin ? '✅ ADMIN' : '❌ MEMBER';
                console.log(`${adminStatus} - ${group.name}`);
                console.log(`   Members: ${group.member_count || 0}`);
                console.log(`   ID: ${group.whatsapp_group_id}`);
                console.log('');
            }
        }

        // Get groups where bot is admin only
        const adminGroups = botGroups.filter(g => g.is_admin || g.is_super_admin);

        console.log('\n📊 Summary:');
        console.log('==========');
        console.log(`Bot is member of: ${botGroups.length} groups`);
        console.log(`Bot is admin in: ${adminGroups.length} groups`);

        if (adminGroups.length > 0) {
            console.log('\n✅ Bot manages these groups:');
            console.log('===========================');
            for (const group of adminGroups) {
                console.log(`• ${group.name}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

listBotAdminGroups();
