# d1strust

**Zero-knowledge one-time secret sharing** with client-side encryption. Share secrets securely knowing that even if our servers are compromised, your data remains encrypted and inaccessible.

🔗 **Live Site:** [https://ots.cachevalley.co](https://ots.cachevalley.co)  
📦 **Repository:** [https://github.com/CacheValleyCommunities/d1strust](https://github.com/CacheValleyCommunities/d1strust)

## 🔒 Security Model

d1strust uses **true zero-knowledge architecture**:

- ✅ **Client-side encryption** - All encryption happens in your browser before data is sent
- ✅ **Server never sees plaintext** - Only encrypted ciphertext is transmitted and stored
- ✅ **Keys never leave the client** - Encryption keys only exist in URL query parameters, never sent to or stored on the server
- ✅ **Server-generated identifiers** - Server creates random IDs completely unrelated to encryption keys
- ✅ **No key correlation** - Server cannot derive encryption keys from stored data

### How It Works

1. **Encryption** happens entirely in your browser using AES-256-CBC
2. **If password-protected**: Secret is encrypted twice (password layer + random key layer)
3. **Server receives**: Only encrypted ciphertext, IV, salt, and metadata
4. **Server stores**: Encrypted data indexed by a server-generated ID (unrelated to encryption key)
5. **Encryption key**: Exists only in the shareable URL (`?key=...`), never logged or stored
6. **Decryption**: Happens client-side using the key from the URL

Even if our servers are compromised, attackers would only find encrypted data that cannot be decrypted without the encryption keys that you control.

## Features

- 🔐 **Zero-knowledge encryption** - Server cannot decrypt your secrets
- 🔥 **Burn-after-read** - Secrets can self-destruct after first access
- 🔑 **Password protection** - Optional additional password layer
- ⏰ **Expiration** - Automatic cleanup of expired secrets
- 📊 **Rate limiting** - Protection against abuse
- 📚 **API documentation** - Swagger/OpenAPI docs included
- 🖥️ **CLI tool** - Command-line interface for power users
- 💾 **Encrypted database** - Application-level encryption (AES-256-CBC) for at-rest protection

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/CacheValleyCommunities/d1strust.git
   cd d1strust
   bun install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set DB_ENCRYPTION_KEY (minimum 8 characters)
   ```

3. **Start the server:**
   ```bash
   bun run dev
   ```

The web interface will be available at `http://localhost:3000`

## Docker Deployment

### Building the Image

```bash
docker build -t d1strust-ots .
```

### Running with Docker

```bash
docker run -d \
  --name d1strust-ots \
  -p 3000:3000 \
  -e DB_ENCRYPTION_KEY="your-encryption-key-min-8-chars" \
  -e BASE_URL="https://ots.cachevalley.co" \
  -e PORT=3000 \
  -v d1strust-data:/app/data \
  d1strust-ots
```

### Deployment with Coolify

1. **Push your code** to a Git repository
2. **Add a new application** in Coolify and connect your repository
3. **Set environment variables:**
   - `DB_ENCRYPTION_KEY` (required) - Minimum 8 characters, use a strong random key
   - `BASE_URL` (optional) - Your public URL (e.g., `https://ots.cachevalley.co`)
   - `PORT` (optional) - Usually set automatically by Coolify
   - `DB_PATH` (optional) - Defaults to `/app/data/ots.db`

4. **Build and deploy** - Coolify will automatically:
   - Build the Docker image
   - Run database migrations on startup
   - Start the server
   - Set up reverse proxy with SSL

**Important:** Make sure to set `BASE_URL` to your public domain (with HTTPS) so that generated links work correctly.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_ENCRYPTION_KEY` | ✅ Yes | - | Database encryption key (min 8 chars) for AES-256-CBC at-rest encryption |
| `BASE_URL` | ❌ No | - | Public URL for generated links (e.g., `https://ots.cachevalley.co`) |
| `PORT` | ❌ No | `3000` | Server port (usually set by Coolify) |
| `DB_PATH` | ❌ No | `/app/data/ots.db` | Path to SQLite database file |

## Usage

### Web Interface

1. Visit `http://localhost:3000`
2. Enter your secret message
3. Optionally set a password for additional protection
4. Choose expiration and burn-after-read options
5. Share the generated link (the encryption key is in the URL)

### CLI Tool

See [cli/README.md](cli/README.md) for CLI installation and usage.

**Quick example:**
```bash
# Create a secret
echo "My secret message" | ots create --burn-after-read

# Redeem a secret
ots redeem "http://localhost:3000/s/01ABC123...?key=def456..."
```

## API

### Create Secret

**Endpoint:** `POST /api/v1/ots/`

**Request Body:**
```json
{
  "ciphertext": "base64_encrypted_data",
  "iv": "hex_initialization_vector",
  "salt": "hex_salt",
  "kdf": "pbkdf2",
  "kdfParams": {
    "iterations": 10000,
    "isPasswordProtected": false
  },
  "burnAfterRead": true,
  "expiresIn": "24h"
}
```

**Response:**
```json
{
  "id": "01ABC123DEF456...",
  "expiresAt": 1735689600000,
  "remainingReads": 1,
  "urls": {
    "retrieve": "http://localhost:3000/s/01ABC123DEF456..."
  }
}
```

**Note:** The encryption key is NOT returned by the server. The client constructs the full URL by appending `?key={encryptionKey}` to the retrieve URL.

### Retrieve Secret

**Endpoint:** `GET /api/v1/ots/:id`

**Note:** The `?key=` query parameter is ignored by the server. Encryption keys are never accessed server-side.

**Response:**
```json
{
  "ciphertext": "base64_encrypted_data",
  "iv": "hex_initialization_vector",
  "salt": "hex_salt",
  "kdf": "pbkdf2",
  "kdfParams": {
    "iterations": 10000,
    "isPasswordProtected": false
  }
}
```

### Delete Secret

**Endpoint:** `DELETE /api/v1/ots/:id`

Permanently deletes a secret by its server-generated ID.

## Security Architecture

### Encryption Flow

1. **Client generates** a random 256-bit encryption key
2. **Client encrypts** secret with AES-256-CBC using the random key
3. **If password-protected**:
   - First encrypts with password (PBKDF2-SHA1, 10k iterations)
   - Then encrypts the password-encrypted result with random key
4. **Client sends** only encrypted data to server (no keys)
5. **Server stores** encrypted data indexed by server-generated ULID
6. **Client creates** URL: `/s/{serverId}?key={encryptionKey}`

### What the Server Stores

- ✅ Encrypted ciphertext (cannot be decrypted without key)
- ✅ Initialization vectors (IVs)
- ✅ Salt values
- ✅ KDF parameters (iterations, password flag)
- ✅ Metadata (timestamps, read counts, expiration)

### What the Server Cannot Access

- ❌ Plaintext secrets
- ❌ Encryption keys (only in URL query params)
- ❌ Passwords (only used client-side)
- ❌ Decrypted data

### Query Parameter Protection

- Encryption keys in `?key=` are **never logged** (custom logger strips query params)
- Query parameters are **never accessed** server-side
- Server only uses its own generated ID to identify secrets

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `DB_PATH` | Path to SQLite database | `./data/ots.db` | No |
| `DB_ENCRYPTION_KEY` | Database encryption key (AES-256-CBC) | - | **Yes** |
| `BASE_URL` | Base URL for API responses | - | No |

## API Documentation

Interactive Swagger UI available at: `http://localhost:3000/docs`

## Technical Details

### Encryption Algorithms

- **AES-256-CBC** - Symmetric encryption for secrets
- **PBKDF2-SHA1** - Password-based key derivation (10,000 iterations)
- **Cryptographically secure random** - Browser `crypto.getRandomValues()` API

### Database

- **Application-level encryption** - Sensitive fields encrypted with AES-256-CBC before storage
- Uses PBKDF2-SHA256 (100,000 iterations) to derive encryption keys from `DB_ENCRYPTION_KEY`
- Each encrypted value uses a unique salt and IV for maximum security
- Database fields encrypted: `ciphertext`, `iv`, `salt`, `accessPasswordHash`, `metadata`
- Note: Bun's built-in SQLite doesn't support SQLCipher, so we use application-level encryption instead

### Deletion

- Secrets are **permanently deleted** from the database (not just marked)
- Deletion happens before returning data on burn-after-read
- Deletion is verified to ensure it succeeded

## Development

### Running Tests

```bash
bun test
```

### Project Structure

```
d1strust/
├── src/              # Server code (TypeScript/Bun)
│   ├── modules/ots/  # One-time secret module
│   ├── db/           # Database schema and setup
│   └── server.ts     # Fastify server setup
├── public/           # Web UI (HTML/JavaScript)
│   ├── index.html    # Create secret page
│   └── redeem.html   # Redeem secret page
├── cli/              # CLI tool (Go)
└── data/             # SQLite database (created at runtime)
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security Reporting

If you discover a security vulnerability, please report it responsibly to help ensure the safety of all users.

**Email:** [security@cachevalley.co](mailto:security@cachevalley.co)

Please include:
- A description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact
- Any suggested fixes

We appreciate your help in keeping d1strust secure for everyone.

## Attribution

This project is open source and available for others to use in their projects. If you use d1strust in your project, please include attribution with links back to:

- This project: [https://github.com/CacheValleyCommunities/d1strust](https://github.com/CacheValleyCommunities/d1strust)
- Cache Valley Communities: [https://cachevalley.co](https://cachevalley.co)

Thank you for respecting the open source community and helping others discover this project!

## Links

- 🌐 **Live Site:** [https://ots.cachevalley.co](https://ots.cachevalley.co)
- 📦 **GitHub Repository:** [https://github.com/CacheValleyCommunities/d1strust](https://github.com/CacheValleyCommunities/d1strust)
