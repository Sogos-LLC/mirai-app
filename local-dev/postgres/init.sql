-- Create Kratos database and user
CREATE USER kratos WITH PASSWORD 'kratoslocal';
CREATE DATABASE kratos OWNER kratos;
GRANT ALL PRIVILEGES ON DATABASE kratos TO kratos;

-- Create Mirai database and user
CREATE USER mirai WITH PASSWORD 'mirailocal';
CREATE DATABASE mirai OWNER mirai;
GRANT ALL PRIVILEGES ON DATABASE mirai TO mirai;

-- Grant schema privileges to mirai user (for migrations)
\c mirai
GRANT ALL ON SCHEMA public TO mirai;
