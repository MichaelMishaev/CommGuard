-- Create offensive_messages table to store detected bullying/offensive content
-- Usage: Track all offensive messages for admin review and analytics

CREATE TABLE IF NOT EXISTS offensive_messages (
    id SERIAL PRIMARY KEY,

    -- WhatsApp identifiers
    message_id VARCHAR(255) NOT NULL UNIQUE,
    whatsapp_group_id VARCHAR(255) NOT NULL,
    group_name VARCHAR(255),

    -- User information
    sender_phone VARCHAR(50) NOT NULL,
    sender_name VARCHAR(255),
    sender_jid VARCHAR(255), -- Full WhatsApp JID for reference

    -- Message content
    message_text TEXT NOT NULL,
    matched_words TEXT[], -- Array of offensive words detected

    -- GPT Analysis (if available)
    gpt_analyzed BOOLEAN DEFAULT false,
    gpt_severity VARCHAR(20), -- none, mild, moderate, severe
    gpt_confidence INTEGER, -- 0-100
    gpt_category VARCHAR(50), -- direct_insult, body_shaming, threats, etc.
    gpt_explanation TEXT,
    gpt_emotional_impact TEXT,
    gpt_recommendation VARCHAR(50), -- keep_monitoring, alert_admin, immediate_action
    gpt_cost DECIMAL(10, 6), -- Cost of GPT analysis

    -- Metadata
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,

    -- Indexes
    CONSTRAINT fk_group FOREIGN KEY (whatsapp_group_id)
        REFERENCES groups(whatsapp_group_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_offensive_messages_group
    ON offensive_messages(whatsapp_group_id);

CREATE INDEX IF NOT EXISTS idx_offensive_messages_sender
    ON offensive_messages(sender_phone);

CREATE INDEX IF NOT EXISTS idx_offensive_messages_detected_at
    ON offensive_messages(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_offensive_messages_deleted
    ON offensive_messages(deleted)
    WHERE deleted = false;

-- Comments
COMMENT ON TABLE offensive_messages IS
    'Stores all detected offensive/bullying messages for admin review and analytics';

COMMENT ON COLUMN offensive_messages.message_id IS
    'Unique WhatsApp message ID for deletion and reference';

COMMENT ON COLUMN offensive_messages.gpt_analyzed IS
    'Whether GPT sentiment analysis was performed (budget dependent)';

COMMENT ON COLUMN offensive_messages.deleted IS
    'Whether the admin deleted this message via reply with d';
