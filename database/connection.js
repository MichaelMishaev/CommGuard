// database/connection.js
// PostgreSQL connection manager for bCommGuard

const { Pool } = require('pg');
const { getTimestamp } = require('../utils/logger');

let pool = null;
let isConnected = false;

/**
 * Initialize PostgreSQL connection pool
 * @param {string} connectionString - PostgreSQL connection string from Railway
 * @returns {Pool} PostgreSQL connection pool
 */
function initDatabase(connectionString) {
    if (pool) {
        console.log(`[${getTimestamp()}] 📊 Database pool already initialized`);
        return pool;
    }

    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    console.log(`[${getTimestamp()}] 🔌 Initializing PostgreSQL connection...`);

    pool = new Pool({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false  // Required for Railway
        },
        max: 20,  // Maximum pool size
        idleTimeoutMillis: 30000,  // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000,  // Timeout after 10 seconds if can't connect
    });

    // Handle pool errors
    pool.on('error', (err) => {
        console.error(`[${getTimestamp()}] ❌ Unexpected database error:`, err);
        isConnected = false;
    });

    // Test connection
    pool.connect()
        .then(client => {
            console.log(`[${getTimestamp()}] ✅ PostgreSQL connected successfully`);
            isConnected = true;
            client.release();
        })
        .catch(err => {
            console.error(`[${getTimestamp()}] ❌ Failed to connect to PostgreSQL:`, err.message);
            isConnected = false;
        });

    return pool;
}

/**
 * Get database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getDatabase() {
    if (!pool) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return pool;
}

/**
 * Execute a query with parameters
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(query, params = []) {
    if (!pool) {
        throw new Error('Database not initialized');
    }

    try {
        const start = Date.now();
        const result = await pool.query(query, params);
        const duration = Date.now() - start;

        if (duration > 100) {
            console.log(`[${getTimestamp()}] ⚠️  Slow query (${duration}ms):`, query.substring(0, 100));
        }

        return result;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Query error:`, error.message);
        console.error(`   Query:`, query);
        throw error;
    }
}

/**
 * Execute a transaction
 * @param {Function} callback - Async function to execute in transaction
 * @returns {Promise} Transaction result
 */
async function transaction(callback) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[${getTimestamp()}] ❌ Transaction rolled back:`, error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check if database is connected
 * @returns {boolean} Connection status
 */
function isDbConnected() {
    return isConnected && pool !== null;
}

/**
 * Close database connection
 */
async function closeDatabase() {
    if (pool) {
        console.log(`[${getTimestamp()}] 🔌 Closing database connection...`);
        await pool.end();
        pool = null;
        isConnected = false;
        console.log(`[${getTimestamp()}] ✅ Database connection closed`);
    }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Database stats
 */
async function getStats() {
    try {
        const result = await query(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE is_blacklisted = true) as blacklisted_users,
                (SELECT COUNT(*) FROM groups WHERE is_active = true) as active_groups,
                (SELECT COUNT(*) FROM group_members WHERE is_active = true) as total_memberships
        `);

        return result.rows[0];
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get database stats:`, error.message);
        return null;
    }
}

module.exports = {
    initDatabase,
    getDatabase,
    query,
    transaction,
    isDbConnected,
    closeDatabase,
    getStats
};
