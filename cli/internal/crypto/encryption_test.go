package crypto

import (
	"testing"
)

func TestEncryptSecret_NoPassword(t *testing.T) {
	plaintext := "Hello, World!"
	encrypted, err := EncryptSecret(plaintext, "")
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	if encrypted.Ciphertext == "" {
		t.Error("Ciphertext should not be empty")
	}
	if encrypted.IV == "" {
		t.Error("IV should not be empty")
	}
	if encrypted.Salt == "" {
		t.Error("Salt should not be empty")
	}
	if encrypted.Key == "" {
		t.Error("Key should not be empty")
	}

	// Decrypt and verify
	decrypted, err := DecryptSecret(encrypted, "")
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Decrypted text doesn't match. Expected: %q, Got: %q", plaintext, decrypted)
	}
}

func TestEncryptSecret_WithPassword(t *testing.T) {
	plaintext := "Secret message"
	password := "mypassword123"

	encrypted, err := EncryptSecret(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	if encrypted.Ciphertext == "" {
		t.Error("Ciphertext should not be empty")
	}

	// Decrypt with correct password
	decrypted, err := DecryptSecret(encrypted, password)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Decrypted text doesn't match. Expected: %q, Got: %q", plaintext, decrypted)
	}

	// Try decrypting without password - should fail
	_, err = DecryptSecret(encrypted, "")
	if err != ErrPasswordRequired {
		t.Errorf("Expected ErrPasswordRequired, got: %v", err)
	}

	// Try decrypting with wrong password - should fail or produce garbage
	wrongDecrypted, err := DecryptSecret(encrypted, "wrongpassword")
	if err == nil {
		// If no error, the decrypted text should be garbage (not the original)
		if wrongDecrypted == plaintext {
			t.Error("Wrong password should not produce the original plaintext")
		}
	}
	// Error is acceptable too (invalid padding or other decryption error)
}

func TestEncryptSecret_DifferentPasswordsProduceDifferentCiphertext(t *testing.T) {
	plaintext := "Same message"
	password1 := "password1"
	password2 := "password2"

	enc1, err := EncryptSecret(plaintext, password1)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	enc2, err := EncryptSecret(plaintext, password2)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	// Ciphertexts should be different even with same plaintext (due to random IVs)
	if enc1.Ciphertext == enc2.Ciphertext {
		t.Error("Different passwords should produce different ciphertexts")
	}

	// But both should decrypt correctly with their respective passwords
	dec1, err := DecryptSecret(enc1, password1)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	dec2, err := DecryptSecret(enc2, password2)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if dec1 != plaintext || dec2 != plaintext {
		t.Error("Both should decrypt to the same plaintext")
	}
}

func TestEncryptSecret_Randomness(t *testing.T) {
	plaintext := "Test message"
	password := "testpass"

	// Encrypt the same message twice
	enc1, err := EncryptSecret(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	enc2, err := EncryptSecret(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	// Ciphertexts should be different due to random IVs and keys
	if enc1.Ciphertext == enc2.Ciphertext {
		t.Error("Same plaintext should produce different ciphertexts (due to randomness)")
	}

	if enc1.IV == enc2.IV {
		t.Error("IVs should be different")
	}

	if enc1.Key == enc2.Key {
		t.Error("Keys should be different")
	}

	// But both should decrypt correctly
	dec1, err := DecryptSecret(enc1, password)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	dec2, err := DecryptSecret(enc2, password)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if dec1 != plaintext || dec2 != plaintext {
		t.Error("Both should decrypt to the same plaintext")
	}
}

func TestDecryptSecret_InvalidKey(t *testing.T) {
	plaintext := "Test"
	encrypted, err := EncryptSecret(plaintext, "")
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	// Try with invalid key
	encrypted.Key = "invalidhex"
	_, err = DecryptSecret(encrypted, "")
	if err == nil {
		t.Error("Expected error with invalid key")
	}
}

func TestDecryptSecret_InvalidIV(t *testing.T) {
	plaintext := "Test"
	encrypted, err := EncryptSecret(plaintext, "")
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	// Try with invalid IV
	encrypted.IV = "invalidhex"
	_, err = DecryptSecret(encrypted, "")
	if err == nil {
		t.Error("Expected error with invalid IV")
	}
}

func TestDecryptSecret_InvalidCiphertext(t *testing.T) {
	plaintext := "Test"
	encrypted, err := EncryptSecret(plaintext, "")
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	// Try with invalid ciphertext
	encrypted.Ciphertext = "notbase64!!!"
	_, err = DecryptSecret(encrypted, "")
	if err == nil {
		t.Error("Expected error with invalid ciphertext")
	}
}

func TestEncryptSecret_EmptyPlaintext(t *testing.T) {
	// Empty plaintext is technically valid (though discouraged at application level)
	encrypted, err := EncryptSecret("", "")
	if err != nil {
		t.Fatalf("EncryptSecret should handle empty plaintext: %v", err)
	}

	decrypted, err := DecryptSecret(encrypted, "")
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != "" {
		t.Errorf("Empty plaintext should decrypt to empty string. Got: %q", decrypted)
	}
}

func TestEncryptSecret_LongMessage(t *testing.T) {
	// Create a long message
	longMessage := make([]byte, 10000)
	for i := range longMessage {
		longMessage[i] = byte(i % 256)
	}
	plaintext := string(longMessage)

	encrypted, err := EncryptSecret(plaintext, "password")
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	decrypted, err := DecryptSecret(encrypted, "password")
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != plaintext {
		t.Error("Long message should decrypt correctly")
	}
}

func TestEncryptSecret_SpecialCharacters(t *testing.T) {
	plaintext := "Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?"
	password := "p@ssw0rd!"

	encrypted, err := EncryptSecret(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	decrypted, err := DecryptSecret(encrypted, password)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Special characters should be preserved. Expected: %q, Got: %q", plaintext, decrypted)
	}
}

func TestEncryptSecret_Unicode(t *testing.T) {
	plaintext := "Unicode: 你好世界 🌍 🚀"
	password := "password"

	encrypted, err := EncryptSecret(plaintext, password)
	if err != nil {
		t.Fatalf("EncryptSecret failed: %v", err)
	}

	decrypted, err := DecryptSecret(encrypted, password)
	if err != nil {
		t.Fatalf("DecryptSecret failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Unicode should be preserved. Expected: %q, Got: %q", plaintext, decrypted)
	}
}
