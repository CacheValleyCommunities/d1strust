-- Main secrets table
-- Stores encrypted one-time secrets with metadata
-- Sensitive fields (ciphertext, iv, salt, accessPasswordHash, metadata) are encrypted
-- at the application level before storage using AES-256-CBC
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  kdf TEXT NOT NULL,
  kdfParams TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER,
  maxReads INTEGER NOT NULL,
  remainingReads INTEGER NOT NULL,
  accessPasswordHash TEXT,
  metadata TEXT
);

-- Note: secret_tokens table is currently unused in the codebase
-- It was part of an earlier design but the current implementation uses
-- the secrets.id directly as the server-generated identifier
-- Kept for potential future use or migration compatibility
CREATE TABLE IF NOT EXISTS secret_tokens (
  secretId TEXT NOT NULL,
  retrieveToken TEXT NOT NULL UNIQUE,
  deleteToken TEXT NOT NULL UNIQUE,
  shortId TEXT UNIQUE,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (secretId) REFERENCES secrets(id) ON DELETE CASCADE
);

-- Index for efficient expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_secrets_expiresAt ON secrets(expiresAt);

