# Database Backups

This folder contains database backup scripts and backup files for CommGuard PostgreSQL database.

## Quick Backup

```bash
node database_backups/backup-database.js
```

## What Gets Backed Up

- ✅ **users** table (2,685+ rows) - User information, blacklist status, whitelist status
- ✅ **groups** table - WhatsApp group information
- ✅ **group_members** table - Group membership relationships
- ✅ **audit_log** table - Moderation action history

## Backup Files

Backups are stored as SQL files with timestamp:
- Format: `commguard_backup_YYYY-MM-DDTHH-MM-SS.sql`
- Location: This folder
- Size: ~1 MB per backup
- **Not committed to git** (added to .gitignore)

## Restoring from Backup

To restore a backup to Railway PostgreSQL:

```bash
# Using psql
PGPASSWORD=PlTptKgSDCyPPhXFbzFTMhilJWkqceTC psql \
  -h shinkansen.proxy.rlwy.net \
  -p 16874 \
  -U postgres \
  -d railway \
  -f database_backups/commguard_backup_YYYY-MM-DDTHH-MM-SS.sql
```

## Automation

To schedule automatic backups:

```bash
# Add to crontab (daily at 3 AM)
0 3 * * * cd /path/to/bCommGuard && node database_backups/backup-database.js
```

## Important Notes

⚠️ **Security**: Backup files contain sensitive data (blacklist, user info). Keep them secure!
⚠️ **Size**: Each backup is ~1 MB. Old backups should be archived or deleted regularly.
✅ **Version**: Works with any PostgreSQL version (doesn't require matching pg_dump)

## Latest Backup

Check the most recent backup:
```bash
ls -lht database_backups/*.sql | head -1
```

---

Created: December 16, 2025
Bot: CommGuard v2.0.0
