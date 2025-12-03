-- Add bot_restarts table to track bot lifecycle and functionality
-- This helps monitor bot stability, uptime, and diagnose issues

CREATE TABLE IF NOT EXISTS bot_restarts (
    id SERIAL PRIMARY KEY,

    -- Basic restart info
    restart_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    restart_reason VARCHAR(100),  -- 'startup', 'crash', 'manual_restart', 'error_515', 'deploy', etc.

    -- System info
    server_location VARCHAR(50),  -- 'production', 'local', 'railway', etc.
    node_version VARCHAR(20),
    bot_version VARCHAR(20),

    -- Connection info
    connected_at TIMESTAMP,  -- When WhatsApp connection succeeded
    connection_duration_ms INTEGER,  -- How long it took to connect
    qr_code_shown BOOLEAN DEFAULT false,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'starting',  -- 'starting', 'connected', 'crashed', 'stopped'
    uptime_seconds INTEGER,  -- Total uptime before this restart

    -- Database/service status
    postgres_connected BOOLEAN DEFAULT false,
    redis_connected BOOLEAN DEFAULT false,
    blacklist_loaded INTEGER DEFAULT 0,  -- Number of blacklisted users loaded
    groups_count INTEGER DEFAULT 0,  -- Number of groups bot is in

    -- Error tracking
    error_message TEXT,  -- Last error before crash (if any)
    error_stack TEXT,  -- Stack trace for debugging

    -- Performance metrics
    memory_usage_mb NUMERIC(10,2),  -- Memory usage at restart
    cpu_usage_percent NUMERIC(5,2),
    messages_processed INTEGER DEFAULT 0,  -- Messages processed during last session

    -- Metadata
    notes TEXT,  -- Admin notes or additional info
    metadata JSONB,  -- Additional structured data

    -- Index for time-based queries
    CONSTRAINT valid_status CHECK (status IN ('starting', 'connected', 'crashed', 'stopped', 'reconnecting'))
);

-- Indexes for fast queries
CREATE INDEX idx_bot_restarts_time ON bot_restarts(restart_time DESC);
CREATE INDEX idx_bot_restarts_status ON bot_restarts(status);
CREATE INDEX idx_bot_restarts_reason ON bot_restarts(restart_reason);

-- View: Recent bot activity (last 50 restarts)
CREATE OR REPLACE VIEW v_recent_bot_activity AS
SELECT
    id,
    restart_time,
    restart_reason,
    status,
    uptime_seconds,
    ROUND(uptime_seconds / 3600.0, 2) as uptime_hours,
    postgres_connected,
    redis_connected,
    blacklist_loaded,
    groups_count,
    memory_usage_mb,
    error_message
FROM bot_restarts
ORDER BY restart_time DESC
LIMIT 50;

-- View: Bot health summary
CREATE OR REPLACE VIEW v_bot_health_summary AS
SELECT
    COUNT(*) as total_restarts,
    COUNT(CASE WHEN restart_reason = 'crash' THEN 1 END) as crash_count,
    COUNT(CASE WHEN status = 'connected' THEN 1 END) as successful_starts,
    AVG(uptime_seconds) as avg_uptime_seconds,
    ROUND(AVG(uptime_seconds) / 3600.0, 2) as avg_uptime_hours,
    MAX(uptime_seconds) as max_uptime_seconds,
    ROUND(MAX(uptime_seconds) / 3600.0, 2) as max_uptime_hours,
    AVG(connection_duration_ms) as avg_connection_time_ms,
    MAX(restart_time) as last_restart,
    (SELECT status FROM bot_restarts ORDER BY restart_time DESC LIMIT 1) as current_status
FROM bot_restarts
WHERE restart_time > NOW() - INTERVAL '30 days';

-- Function: Get current bot session info
CREATE OR REPLACE FUNCTION get_current_bot_session()
RETURNS TABLE (
    session_id INTEGER,
    started_at TIMESTAMP,
    uptime_seconds INTEGER,
    status VARCHAR(20),
    blacklist_count INTEGER,
    groups_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        id,
        restart_time,
        EXTRACT(EPOCH FROM (NOW() - restart_time))::INTEGER,
        bot_restarts.status,
        blacklist_loaded,
        bot_restarts.groups_count
    FROM bot_restarts
    ORDER BY restart_time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE bot_restarts IS 'Tracks every bot restart, connection, and crash for monitoring and debugging';
COMMENT ON VIEW v_recent_bot_activity IS 'Shows last 50 bot restarts with key metrics';
COMMENT ON VIEW v_bot_health_summary IS 'Summary of bot health over last 30 days';
