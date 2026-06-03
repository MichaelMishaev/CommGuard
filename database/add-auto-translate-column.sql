-- database/add-auto-translate-column.sql
-- Adds per-group auto-translation columns.
-- NULL = disabled. 'ru' / 'he' = ISO 639-1 language codes.
-- Run once: node -e "require('./database/connection').query(require('fs').readFileSync('./database/add-auto-translate-column.sql','utf8'))"

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS auto_translate_from VARCHAR(5) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_translate_to   VARCHAR(5) DEFAULT NULL;
