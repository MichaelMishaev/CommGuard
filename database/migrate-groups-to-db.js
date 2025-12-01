// database/migrate-groups-to-db.js
// Migrate all WhatsApp groups and phone numbers to PostgreSQL

require('dotenv').config();  // Load .env file

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { initDatabase, query, transaction, getStats, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('   Get it from Railway dashboard and add to .env file');
    process.exit(1);
}

/**
 * Decode LID to phone number from mapping files
 * @param {string} lid - WhatsApp LID
 * @returns {string|null} Phone number or null
 */
function decodeLID(lid) {
    try {
        const mappingFile = path.join(__dirname, '../baileys_auth_info', `lid-mapping-${lid}_reverse.json`);
        if (fs.existsSync(mappingFile)) {
            const phoneNumber = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
            return phoneNumber;
        }
    } catch (error) {
        // LID mapping not found
    }
    return null;
}

/**
 * Extract country code from phone number
 * @param {string} phoneNumber - Phone number
 * @returns {string} Country code
 */
function extractCountryCode(phoneNumber) {
    if (phoneNumber.startsWith('972')) return '972';  // Israel
    if (phoneNumber.startsWith('1')) return '1';      // US/Canada
    if (phoneNumber.startsWith('44')) return '44';    // UK
    if (phoneNumber.startsWith('6')) return '6';      // Southeast Asia

    // Extract first 1-3 digits
    const match = phoneNumber.match(/^(\d{1,3})/);
    return match ? match[1] : 'unknown';
}

/**
 * Insert or update user in database
 * @param {Object} client - Database client
 * @param {string} phoneNumber - Phone number
 * @param {string|null} lid - LID if available
 * @returns {Promise<number>} User ID
 */
async function upsertUser(client, phoneNumber, lid = null) {
    const countryCode = extractCountryCode(phoneNumber);

    const result = await client.query(`
        INSERT INTO users (phone_number, lid, country_code, first_seen, last_seen)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (phone_number)
        DO UPDATE SET
            lid = COALESCE(EXCLUDED.lid, users.lid),
            last_seen = NOW()
        RETURNING id
    `, [phoneNumber, lid, countryCode]);

    return result.rows[0].id;
}

/**
 * Insert or update group in database
 * @param {Object} client - Database client
 * @param {Object} groupMetadata - WhatsApp group metadata
 * @returns {Promise<number>} Group ID
 */
async function upsertGroup(client, groupMetadata) {
    const result = await client.query(`
        INSERT INTO groups (
            whatsapp_group_id,
            name,
            description,
            creation_timestamp,
            owner_phone,
            last_sync
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (whatsapp_group_id)
        DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            last_sync = NOW()
        RETURNING id
    `, [
        groupMetadata.id,
        groupMetadata.subject || 'Unknown Group',
        groupMetadata.desc || null,
        groupMetadata.creation || null,
        groupMetadata.owner?.split('@')[0] || null
    ]);

    return result.rows[0].id;
}

/**
 * Insert group member relationship
 * @param {Object} client - Database client
 * @param {number} groupId - Group ID
 * @param {number} userId - User ID
 * @param {boolean} isAdmin - Is user admin
 * @param {boolean} isSuperAdmin - Is user super admin
 */
async function upsertGroupMember(client, groupId, userId, isAdmin, isSuperAdmin) {
    await client.query(`
        INSERT INTO group_members (group_id, user_id, is_admin, is_super_admin, joined_at, is_active)
        VALUES ($1, $2, $3, $4, NOW(), true)
        ON CONFLICT (group_id, user_id)
        DO UPDATE SET
            is_admin = EXCLUDED.is_admin,
            is_super_admin = EXCLUDED.is_super_admin,
            is_active = true
    `, [groupId, userId, isAdmin, isSuperAdmin]);
}

/**
 * Main migration function
 */
async function migrateGroupsToDatabase() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🚀 MIGRATING WHATSAPP GROUPS TO POSTGRESQL');
    console.log(`${'='.repeat(60)}\n`);

    // Initialize database
    console.log(`[${getTimestamp()}] 📊 Connecting to PostgreSQL...`);
    initDatabase(DATABASE_URL);

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize WhatsApp connection
    console.log(`[${getTimestamp()}] 📱 Connecting to WhatsApp...`);
    const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    return new Promise((resolve, reject) => {
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`[${getTimestamp()}] ✅ Connected to WhatsApp\n`);

                try {
                    // Get all groups
                    console.log(`[${getTimestamp()}] 📋 Fetching all groups...`);
                    const groups = await sock.groupFetchAllParticipating();
                    const groupList = Object.entries(groups);

                    console.log(`[${getTimestamp()}] ✅ Found ${groupList.length} groups\n`);

                    let totalUsers = 0;
                    let totalMemberships = 0;
                    let totalAdmins = 0;

                    // Process each group
                    for (let i = 0; i < groupList.length; i++) {
                        const [groupId, groupBasicInfo] = groupList[i];

                        console.log(`[${getTimestamp()}] 🔄 [${i + 1}/${groupList.length}] Processing: ${groupBasicInfo.subject}`);

                        try {
                            // Get full group metadata
                            const groupMetadata = await sock.groupMetadata(groupId);

                            // Use transaction for each group
                            await transaction(async (client) => {
                                // Insert group
                                const dbGroupId = await upsertGroup(client, groupMetadata);

                                // Process each participant
                                for (const participant of groupMetadata.participants) {
                                    const userId = participant.id;
                                    const rawId = userId.split('@')[0];
                                    const isLID = userId.endsWith('@lid');
                                    const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
                                    const isSuperAdmin = participant.admin === 'superadmin';

                                    // Decode LID if needed
                                    let phoneNumber = rawId;
                                    let lid = null;

                                    if (isLID) {
                                        lid = rawId;
                                        const decodedPhone = decodeLID(rawId);
                                        if (decodedPhone) {
                                            phoneNumber = decodedPhone;
                                        } else {
                                            // Can't decode - use LID as phone number
                                            console.log(`   ⚠️  Could not decode LID: ${lid} - storing as-is`);
                                        }
                                    }

                                    // Insert user
                                    const dbUserId = await upsertUser(client, phoneNumber, lid);

                                    // Insert group membership
                                    await upsertGroupMember(client, dbGroupId, dbUserId, isAdmin, isSuperAdmin);

                                    totalMemberships++;
                                    if (isAdmin) totalAdmins++;
                                }
                            });

                            console.log(`   ✅ Migrated ${groupMetadata.participants.length} members`);

                        } catch (error) {
                            console.error(`   ❌ Error processing group ${groupBasicInfo.subject}:`, error.message);
                        }

                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Get final statistics
                    console.log(`\n${'='.repeat(60)}`);
                    console.log('✅ MIGRATION COMPLETE!');
                    console.log(`${'='.repeat(60)}\n`);

                    const stats = await getStats();

                    console.log('📊 Database Statistics:');
                    console.log(`   Total Users: ${stats.total_users}`);
                    console.log(`   Blacklisted Users: ${stats.blacklisted_users}`);
                    console.log(`   Active Groups: ${stats.active_groups}`);
                    console.log(`   Total Memberships: ${stats.total_memberships}`);
                    console.log(`   Admins: ${totalAdmins}`);
                    console.log();

                    // Show some example queries
                    console.log('💡 Try these queries:');
                    console.log('   SELECT * FROM v_group_stats;');
                    console.log('   SELECT * FROM v_user_activity ORDER BY group_count DESC LIMIT 10;');
                    console.log('   SELECT phone_number FROM users WHERE phone_number LIKE \'972%\';');
                    console.log();

                    sock.end();
                    await closeDatabase();
                    resolve();

                } catch (error) {
                    console.error('❌ Migration error:', error);
                    sock.end();
                    await closeDatabase();
                    reject(error);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (!shouldReconnect) {
                    resolve();
                }
            }
        });

        setTimeout(() => {
            console.log('⏱️  Timeout - closing connection');
            sock.end();
            closeDatabase().then(() => resolve());
        }, 300000);  // 5 minute timeout
    });
}

// Run migration
if (require.main === module) {
    migrateGroupsToDatabase()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { migrateGroupsToDatabase };
