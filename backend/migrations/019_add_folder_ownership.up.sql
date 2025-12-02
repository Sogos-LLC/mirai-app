-- Add team_id and user_id to folders for ownership tracking
-- team_id: Associates folder with a team (for TEAM type folders)
-- user_id: Associates folder with a user (for PERSONAL type folders)

ALTER TABLE folders ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE folders ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add indexes for efficient lookups
CREATE INDEX idx_folders_team_id ON folders(team_id);
CREATE INDEX idx_folders_user_id ON folders(user_id);

-- Add constraint: TEAM folders must have team_id, PERSONAL folders must have user_id
-- Note: We use a loose constraint to allow migration of existing data
ALTER TABLE folders ADD CONSTRAINT folder_ownership_check CHECK (
    (type = 'TEAM' AND team_id IS NOT NULL) OR
    (type = 'PERSONAL' AND user_id IS NOT NULL) OR
    (type IN ('LIBRARY', 'FOLDER'))
);
