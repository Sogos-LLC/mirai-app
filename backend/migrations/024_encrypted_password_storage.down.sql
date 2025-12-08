-- Rollback: Restore password_hash column and remove password_encrypted
-- Note: Data will be lost - users will need to re-register
ALTER TABLE pending_registrations ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE pending_registrations DROP COLUMN IF EXISTS password_encrypted;
ALTER TABLE pending_registrations ALTER COLUMN password_hash SET NOT NULL;
