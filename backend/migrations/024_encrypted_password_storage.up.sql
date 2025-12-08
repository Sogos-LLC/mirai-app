-- Migration: Change password storage from bcrypt hash to AES-256 encrypted password
-- This allows us to decrypt and pass plaintext to Kratos for proper hashing,
-- ensuring password verification works correctly.
--
-- Security model:
-- The password is encrypted (not hashed) with AES-256-GCM using the ENCRYPTION_KEY.
-- During account provisioning:
-- 1. Decrypt the password
-- 2. Create Kratos identity with plaintext password (Kratos hashes it with argon2)
-- 3. Verify via PerformLogin (ensures password works)
-- 4. Delete the pending_registration record (removes encrypted password)
-- Maximum exposure time: 24 hours (pending_registration expiry)

-- Step 1: Add new encrypted column (BYTEA for binary data)
ALTER TABLE pending_registrations ADD COLUMN password_encrypted BYTEA;

-- Step 2: Drop the old column
-- Note: Any existing pending registrations will lose their password data.
-- This is acceptable as:
-- - Pending registrations expire in 24 hours
-- - Users can re-register if needed
-- - This fixes a critical security issue where passwords couldn't be verified
ALTER TABLE pending_registrations DROP COLUMN password_hash;

-- Step 3: Make the new column NOT NULL for future inserts
ALTER TABLE pending_registrations ALTER COLUMN password_encrypted SET NOT NULL;
