-- Remove folder ownership columns

ALTER TABLE folders DROP CONSTRAINT IF EXISTS folder_ownership_check;
DROP INDEX IF EXISTS idx_folders_user_id;
DROP INDEX IF EXISTS idx_folders_team_id;
ALTER TABLE folders DROP COLUMN IF EXISTS user_id;
ALTER TABLE folders DROP COLUMN IF EXISTS team_id;
