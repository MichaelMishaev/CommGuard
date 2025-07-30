const pino = require('pino');
const config = require('../config');

// Create logger - simple configuration for now
const logger = pino({
  level: config.LOG_LEVEL || 'info'
});

// Helper function to get timestamp
function getTimestamp() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(',', '');
}

module.exports = { logger, getTimestamp };