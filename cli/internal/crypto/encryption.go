// Package crypto provides client-side encryption for one-time secrets.
// Uses AES-256-CBC with PBKDF2-SHA1 for password-based key derivation.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	// PBKDF2Iterations is the number of iterations for password-based key derivation
	PBKDF2Iterations = 10000
	// KeySize is the AES key size in bytes (256 bits)
	KeySize = 32
	// IVSize is the initialization vector size in bytes (128 bits)
	IVSize = 16
	// SaltSize is the salt size in bytes
	SaltSize = 16
	// passwordPrefix marks password-protected secrets
	passwordPrefix = "PWD:"
)

var (
	// ErrPasswordRequired is returned when a password-protected secret is decrypted without a password
	ErrPasswordRequired = errors.New("password required for this secret")
	// ErrInvalidPadding is returned when PKCS7 padding is invalid
	ErrInvalidPadding = errors.New("invalid padding")
	// ErrShortCiphertext is returned when ciphertext is too short
	ErrShortCiphertext = errors.New("ciphertext too short")
)

// EncryptedSecret represents an encrypted secret with its metadata.
type EncryptedSecret struct {
	Ciphertext string
	IV         string
	Salt       string
	Key        string
}

// EncryptSecret encrypts plaintext with optional password protection using layered encryption.
// Matches web implementation: password encryption uses SHA1-based PBKDF2, separate IVs for each layer.
//
// If password is provided:
//   - Inner layer: Secret encrypted with password using PBKDF2-SHA1 (10k iterations) + AES-256-CBC
//   - Outer layer: Password-encrypted result encrypted with random 256-bit key + AES-256-CBC
//
// If no password:
//   - Single layer: Secret encrypted with random 256-bit key + AES-256-CBC
func EncryptSecret(plaintext string, password string) (*EncryptedSecret, error) {
	// Generate random components
	salt, err := randomBytes(SaltSize)
	if err != nil {
		return nil, fmt.Errorf("generate salt: %w", err)
	}

	outerKey, err := randomBytes(KeySize)
	if err != nil {
		return nil, fmt.Errorf("generate outer key: %w", err)
	}

	outerIV, err := randomBytes(IVSize)
	if err != nil {
		return nil, fmt.Errorf("generate outer IV: %w", err)
	}

	// Prepare payload (encrypt with password if provided)
	payload := plaintext
	if password != "" {
		payload, err = encryptWithPassword(plaintext, password)
		if err != nil {
			return nil, fmt.Errorf("encrypt with password: %w", err)
		}
	}

	// Encrypt payload with outer key
	ciphertext, err := encryptAES([]byte(payload), outerKey, outerIV)
	if err != nil {
		return nil, fmt.Errorf("encrypt outer layer: %w", err)
	}

	return &EncryptedSecret{
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
		IV:         hex.EncodeToString(outerIV),
		Salt:       hex.EncodeToString(salt),
		Key:        hex.EncodeToString(outerKey),
	}, nil
}

// DecryptSecret decrypts an encrypted secret using the outer key and optional password.
// Matches web implementation: decrypts outer layer first, then checks for password protection.
//
// Process:
//  1. Decrypt outer layer using the provided key
//  2. Check if result has password prefix
//  3. If password-protected, decrypt inner layer using provided password
func DecryptSecret(enc *EncryptedSecret, password string) (string, error) {
	// Decode components
	outerKey, err := hex.DecodeString(enc.Key)
	if err != nil {
		return "", fmt.Errorf("decode key: %w", err)
	}

	outerIV, err := hex.DecodeString(enc.IV)
	if err != nil {
		return "", fmt.Errorf("decode IV: %w", err)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(enc.Ciphertext)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	// Decrypt outer layer
	payload, err := decryptAES(ciphertext, outerKey, outerIV)
	if err != nil {
		return "", fmt.Errorf("decrypt outer layer: %w", err)
	}

	// Check if password-protected (by checking for PWD: prefix)
	if strings.HasPrefix(string(payload), passwordPrefix) {
		if password == "" {
			return "", ErrPasswordRequired
		}
		return decryptWithPassword(string(payload), password)
	}

	return string(payload), nil
}

// encryptWithPassword encrypts plaintext with password using PBKDF2-SHA1 (matching web CryptoJS).
// Uses empty salt (nil) and generates a separate IV for password encryption.
func encryptWithPassword(plaintext, password string) (string, error) {
	// Generate separate IV for password encryption
	passwordIV, err := randomBytes(IVSize)
	if err != nil {
		return "", fmt.Errorf("generate password IV: %w", err)
	}

	// Use SHA1 for PBKDF2 to match CryptoJS default (web implementation)
	key := pbkdf2.Key([]byte(password), nil, PBKDF2Iterations, KeySize, sha1.New)

	ciphertext, err := encryptAES([]byte(plaintext), key, passwordIV)
	if err != nil {
		return "", fmt.Errorf("encrypt with password key: %w", err)
	}

	// Format: "PWD:base64_ciphertext||hex_iv" (matching web implementation)
	return fmt.Sprintf("%s%s||%s",
		passwordPrefix,
		base64.StdEncoding.EncodeToString(ciphertext),
		hex.EncodeToString(passwordIV),
	), nil
}

// decryptWithPassword decrypts password-protected payload using PBKDF2-SHA1 (matching web CryptoJS).
func decryptWithPassword(payload, password string) (string, error) {
	// Remove prefix: "PWD:"
	if !strings.HasPrefix(payload, passwordPrefix) {
		return "", fmt.Errorf("invalid password-encrypted format")
	}

	parts := strings.Split(payload[len(passwordPrefix):], "||")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid password-encrypted format: expected format PWD:ciphertext||iv")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	passwordIV, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode password IV: %w", err)
	}

	// Use SHA1 for PBKDF2 to match CryptoJS default (web implementation)
	key := pbkdf2.Key([]byte(password), nil, PBKDF2Iterations, KeySize, sha1.New)

	plaintext, err := decryptAES(ciphertext, key, passwordIV)
	if err != nil {
		return "", fmt.Errorf("decrypt with password: %w", err)
	}

	return string(plaintext), nil
}

// encryptAES encrypts plaintext using AES-256-CBC with PKCS7 padding.
func encryptAES(plaintext, key, iv []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	padded := pkcs7Pad(plaintext, aes.BlockSize)
	ciphertext := make([]byte, len(padded))

	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, padded)

	return ciphertext, nil
}

// decryptAES decrypts ciphertext using AES-256-CBC with PKCS7 unpadding.
func decryptAES(ciphertext, key, iv []byte) ([]byte, error) {
	if len(ciphertext) < aes.BlockSize {
		return nil, ErrShortCiphertext
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(ciphertext, ciphertext)

	return pkcs7Unpad(ciphertext, aes.BlockSize)
}

// randomBytes generates cryptographically secure random bytes.
func randomBytes(length int) ([]byte, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return nil, err
	}
	return bytes, nil
}

// pkcs7Pad adds PKCS7 padding to data to make it a multiple of blockSize.
func pkcs7Pad(data []byte, blockSize int) []byte {
	padLen := blockSize - len(data)%blockSize
	padded := make([]byte, len(data)+padLen)
	copy(padded, data)
	for i := len(data); i < len(padded); i++ {
		padded[i] = byte(padLen)
	}
	return padded
}

// pkcs7Unpad removes PKCS7 padding from data.
func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	if len(data) == 0 {
		return nil, ErrInvalidPadding
	}

	padLen := int(data[len(data)-1])
	if padLen > blockSize || padLen == 0 || padLen > len(data) {
		return nil, ErrInvalidPadding
	}

	return data[:len(data)-padLen], nil
}
