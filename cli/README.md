# OTS CLI

Command-line interface for d1strust - zero-knowledge one-time secret sharing with client-side encryption.

## Installation

### Build from Source

```bash
cd cli
go build -o ots .
```

The binary will be created as `ots` (or `ots.exe` on Windows).

### Install via Go

```bash
go install github.com/brentdalling/ots-cli@latest
```

## Usage

### Create a Secret

#### From stdin (pipe)
```bash
echo "My secret message" | ots create
```

#### From command-line flag
```bash
ots create --text "My secret message"
```

#### From a file
```bash
ots create --file secret.txt
```

#### With password protection
```bash
echo "My secret" | ots create --password "mypass123"
```

#### With all options
```bash
echo "My secret" | ots create \
  --password "mypass123" \
  --burn-after-read \
  --expires-in "24h" \
  --server "http://localhost:5000"
```

### Redeem a Secret

```bash
ots redeem "http://localhost:3000/s/01ABC123...?key=def456..."
```

#### With password
```bash
ots redeem "http://localhost:3000/s/01ABC123...?key=def456..." --password "mypass123"
```

#### Without clipboard
```bash
ots redeem "http://localhost:3000/s/01ABC123...?key=def456..." --no-clipboard
```

## Command Reference

### `ots create`

Creates a new one-time secret with client-side encryption.

**Input Sources:**
- Stdin (pipe): `echo "secret" | ots create`
- Text flag: `ots create --text "secret"`
- File: `ots create --file secret.txt`

**Flags:**
- `--password, -p` - Password to protect the secret (optional)
- `--burn-after-read, -b` - Destroy secret after first read (default: false)
- `--expires-in, -e` - Expiration time (e.g., `1h`, `24h`, `7d`) (default: `7d`)
- `--file, -f` - Read secret from file instead of stdin
- `--text, -t` - Secret text directly (alternative to stdin or file)
- `--no-clipboard, -n` - Don't copy link to clipboard after creation
- `--server, -s` - Override server URL (default: `http://localhost:3000`)

**Output:**
- Prints the shareable link (format: `http://server/s/{id}?key={encryptionKey}`)
- If password-protected, prints the password separately
- Automatically copies link to clipboard (unless `--no-clipboard` is used)

### `ots redeem`

Retrieves and decrypts a one-time secret.

**Usage:**
```bash
ots redeem <full-url-with-key>
```

**Flags:**
- `--password, -p` - Password to decrypt the secret (prompts if not provided and required)
- `--no-clipboard, -n` - Don't copy decrypted secret to clipboard
- `--server, -s` - Override server URL (extracted from link if not provided)

**Output:**
- Prints the decrypted secret
- Automatically copies secret to clipboard (unless `--no-clipboard` is used)

## Configuration

### Environment Variables

- `OTS_SERVER_URL` - Default server URL (default: `http://localhost:3000`)

This can be overridden with the `--server` flag on any command.

## Security Model

The CLI uses the same zero-knowledge encryption as the web interface:

### Encryption Process

1. **Client-side encryption** - All encryption happens locally before sending to server
2. **Layered protection** (if password provided):
   - **Inner layer**: Secret encrypted with password using PBKDF2-SHA1 (10,000 iterations) + AES-256-CBC
   - **Outer layer**: Password-encrypted result encrypted with random 256-bit key + AES-256-CBC
3. **Key management**:
   - Random encryption key generated client-side
   - Key embedded in URL query parameter (`?key=...`)
   - Key **never sent to server** in request body
   - Server **never sees or stores** the encryption key

### What Gets Sent to Server

- ✅ Encrypted ciphertext (base64)
- ✅ Initialization vectors (hex)
- ✅ Salt values (hex)
- ✅ KDF parameters (iterations, password flag)
- ✅ Metadata (expiration, burn-after-read)

### What Never Leaves Your Computer

- ❌ Plaintext secret (encrypted before transmission)
- ❌ Encryption key (only in URL, never in request body)
- ❌ Password (only used for inner encryption layer)

### Server Behavior

- Server generates a random ULID identifier (unrelated to encryption key)
- Server stores encrypted data indexed by this ID
- Server **never accesses** the `?key=` query parameter
- Server **never logs** query parameters (stripped from logs)

## Examples

### Basic Secret Sharing

```bash
# Create a secret
echo "My API key: abc123xyz" | ots create

# Output:
# Secret created successfully!
# Link:
# http://localhost:3000/s/01ABC123...?key=def456...
# ✓ Link copied to clipboard

# Share the link with recipient
# They can redeem it using the same CLI or web interface
```

### Password-Protected Secret

```bash
# Create with password
echo "Sensitive credentials" | ots create --password "mypassword"

# Output:
# Secret created successfully!
# Link:
# http://localhost:3000/s/01ABC123...?key=def456...
# Password:
# mypassword
# ✓ Link copied to clipboard

# Share BOTH the link AND password separately with recipient

# Redeem (will prompt for password if not provided)
ots redeem "http://localhost:3000/s/01ABC123...?key=def456..." --password "mypassword"
```

### Temporary Secret

```bash
# Create a secret that expires in 1 hour
echo "Temporary access code" | ots create --expires-in "1h"
```

### Burn-After-Read Secret

```bash
# Create a secret that's deleted after first read
echo "One-time password" | ots create --burn-after-read

# After first redemption, the secret is permanently deleted
```

### Using Custom Server

```bash
# Create secret on custom server
echo "Secret" | ots create --server "https://ots.example.com"

# Redeem from custom server
ots redeem "https://ots.example.com/s/01ABC...?key=def..." --server "https://ots.example.com"
```

### File-Based Secrets

```bash
# Create secret from file
ots create --file credentials.txt

# Useful for larger secrets or multi-line content
```

## Security Best Practices

1. **Share passwords separately** - If using password protection, share the password through a different channel than the link
2. **Use HTTPS in production** - Encryption keys in URLs should be transmitted over HTTPS
3. **Verify server identity** - Ensure you're connecting to the correct server
4. **Don't log URLs** - Links contain encryption keys - be careful with logging/history
5. **Use burn-after-read** - For sensitive secrets, enable burn-after-read to ensure one-time access

## Troubleshooting

### Connection Errors

If you see connection errors:

```bash
# Check if server is running
curl http://localhost:3000/health

# Use --server flag to specify correct URL
ots create --server "http://localhost:5000" --text "test"
```

### Invalid Link Format

Links must include both the server ID and encryption key:
```
http://server/s/{id}?key={encryptionKey}
```

Both `{id}` and `{encryptionKey}` are required.

### Password Errors

If decryption fails with a password:
- Verify the password is correct
- Ensure the link includes the encryption key (`?key=...`)
- Check that the secret hasn't expired or been consumed

## Implementation Details

### Encryption Compatibility

The CLI uses the same encryption model as the web interface:
- **AES-256-CBC** for encryption
- **PBKDF2-SHA1** (10,000 iterations) for password-based key derivation
- **Separate IVs** for outer and inner (password) encryption layers
- **Random key generation** using `crypto/rand`

This ensures secrets created with the CLI can be redeemed in the web interface and vice versa.

### Error Handling

The CLI provides clear error messages for:
- Connection issues (server not running, wrong URL)
- Invalid link formats (missing ID or key)
- Decryption failures (wrong password, corrupted data)
- Network errors (timeouts, TLS issues)
