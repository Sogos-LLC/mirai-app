-- Down migration: Restore SME and Target Audience features
-- Note: This won't restore data, only schema

-- Cannot easily restore enum values that were removed
-- Would need to recreate the full schema from migrations 009, 010, and 012
-- This is intentionally left as a no-op to prevent accidental rollback
SELECT 'Down migration not supported - schema would need full recreation from migrations 009, 010, and 012' AS error;
