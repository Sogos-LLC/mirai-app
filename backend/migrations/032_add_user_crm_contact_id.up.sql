-- Add CRM contact ID to users table for lazy sync
ALTER TABLE users ADD COLUMN crm_contact_id VARCHAR(255);
