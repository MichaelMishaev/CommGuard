/**
 * Offensive Messages Database Service
 * Manages storage and retrieval of detected offensive messages
 */

const { query } = require('./connection');
const { getTimestamp } = require('../utils/logger');

const formatTimestamp = () => `[${getTimestamp()}]`;

/**
 * Save an offensive message to the database
 *
 * @param {Object} data - Message data
 * @returns {Promise<number>} - ID of saved message
 */
async function saveOffensiveMessage(data) {
    const {
        messageId,
        whatsappGroupId,
        groupName,
        senderPhone,
        senderName,
        senderJid,
        messageText,
        matchedWords,
        gptAnalysis
    } = data;

    try {
        const result = await query(`
            INSERT INTO offensive_messages (
                message_id,
                whatsapp_group_id,
                group_name,
                sender_phone,
                sender_name,
                sender_jid,
                message_text,
                matched_words,
                gpt_analyzed,
                gpt_severity,
                gpt_confidence,
                gpt_category,
                gpt_explanation,
                gpt_emotional_impact,
                gpt_recommendation,
                gpt_cost
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id
        `, [
            messageId,
            whatsappGroupId,
            groupName,
            senderPhone,
            senderName,
            senderJid,
            messageText,
            matchedWords || [],
            gptAnalysis?.analyzed || false,
            gptAnalysis?.severity || null,
            gptAnalysis?.confidence || null,
            gptAnalysis?.category || null,
            gptAnalysis?.explanation || null,
            gptAnalysis?.emotionalImpact || null,
            gptAnalysis?.recommendation || null,
            gptAnalysis?.cost || null
        ]);

        const id = result.rows[0].id;
        console.log(`${formatTimestamp()} 💾 Saved offensive message to DB (ID: ${id})`);

        return id;

    } catch (error) {
        console.error(`${formatTimestamp()} ❌ Failed to save offensive message:`, error.message);
        throw error;
    }
}

/**
 * Mark an offensive message as deleted
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<boolean>} - Success status
 */
async function markMessageAsDeleted(messageId) {
    try {
        const result = await query(`
            UPDATE offensive_messages
            SET deleted = true,
                deleted_at = CURRENT_TIMESTAMP
            WHERE message_id = $1
            RETURNING id
        `, [messageId]);

        if (result.rows.length > 0) {
            console.log(`${formatTimestamp()} 🗑️  Marked message as deleted (ID: ${result.rows[0].id})`);
            return true;
        }

        return false;

    } catch (error) {
        console.error(`${formatTimestamp()} ❌ Failed to mark message as deleted:`, error.message);
        throw error;
    }
}

/**
 * Get offensive message by WhatsApp message ID
 *
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<Object|null>} - Message data or null
 */
async function getOffensiveMessage(messageId) {
    try {
        const result = await query(`
            SELECT *
            FROM offensive_messages
            WHERE message_id = $1
        `, [messageId]);

        return result.rows[0] || null;

    } catch (error) {
        console.error(`${formatTimestamp()} ❌ Failed to get offensive message:`, error.message);
        throw error;
    }
}

/**
 * Get offensive messages for a group (last 30 days)
 *
 * @param {string} whatsappGroupId - Group ID
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Array>} - Array of messages
 */
async function getGroupOffensiveMessages(whatsappGroupId, limit = 50) {
    try {
        const result = await query(`
            SELECT *
            FROM offensive_messages
            WHERE whatsapp_group_id = $1
            AND detected_at > NOW() - INTERVAL '30 days'
            ORDER BY detected_at DESC
            LIMIT $2
        `, [whatsappGroupId, limit]);

        return result.rows;

    } catch (error) {
        console.error(`${formatTimestamp()} ❌ Failed to get group offensive messages:`, error.message);
        throw error;
    }
}

/**
 * Get statistics for offensive messages
 *
 * @param {string} whatsappGroupId - Group ID (optional, for specific group)
 * @returns {Promise<Object>} - Statistics
 */
async function getOffensiveMessageStats(whatsappGroupId = null) {
    try {
        const whereClause = whatsappGroupId
            ? 'WHERE whatsapp_group_id = $1'
            : '';

        const params = whatsappGroupId ? [whatsappGroupId] : [];

        const result = await query(`
            SELECT
                COUNT(*) as total_messages,
                COUNT(*) FILTER (WHERE gpt_analyzed = true) as gpt_analyzed_count,
                COUNT(*) FILTER (WHERE deleted = true) as deleted_count,
                COUNT(*) FILTER (WHERE gpt_severity = 'severe') as severe_count,
                COUNT(*) FILTER (WHERE gpt_severity = 'moderate') as moderate_count,
                COUNT(*) FILTER (WHERE gpt_severity = 'mild') as mild_count,
                COALESCE(SUM(gpt_cost), 0) as total_gpt_cost,
                COUNT(DISTINCT sender_phone) as unique_senders,
                COUNT(DISTINCT whatsapp_group_id) as unique_groups
            FROM offensive_messages
            ${whereClause}
        `, params);

        return result.rows[0];

    } catch (error) {
        console.error(`${formatTimestamp()} ❌ Failed to get offensive message stats:`, error.message);
        throw error;
    }
}

module.exports = {
    saveOffensiveMessage,
    markMessageAsDeleted,
    getOffensiveMessage,
    getGroupOffensiveMessages,
    getOffensiveMessageStats
};
