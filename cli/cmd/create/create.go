// Package create provides the command for creating one-time secrets.
package create

import (
	"fmt"
	"io"
	"os"

	"github.com/atotto/clipboard"
	"github.com/spf13/cobra"

	"github.com/brentdalling/ots-cli/internal/api"
	"github.com/brentdalling/ots-cli/internal/config"
	"github.com/brentdalling/ots-cli/internal/crypto"
)

var (
	password      string
	burnAfterRead bool
	expiresIn     string
	filePath      string
	noClipboard   bool
	serverURL     string
	secretText    string
)

// CreateCmd is the cobra command for creating secrets.
var CreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new one-time secret",
	Long:  "Create a new one-time secret with optional password protection and expiration",
	RunE:  runCreate,
}

func init() {
	CreateCmd.Flags().StringVarP(&password, "password", "p", "", "Password to protect the secret")
	CreateCmd.Flags().BoolVarP(&burnAfterRead, "burn-after-read", "b", false, "Destroy secret after first read")
	CreateCmd.Flags().StringVarP(&expiresIn, "expires-in", "e", "7d", "Expiration time (e.g., 1h, 24h, 7d)")
	CreateCmd.Flags().StringVarP(&filePath, "file", "f", "", "Read secret from file instead of stdin")
	CreateCmd.Flags().StringVarP(&secretText, "text", "t", "", "Secret text (alternative to stdin or file)")
	CreateCmd.Flags().BoolVarP(&noClipboard, "no-clipboard", "n", false, "Don't copy link to clipboard")
	CreateCmd.Flags().StringVarP(&serverURL, "server", "s", "", "Override server URL")
}

// runCreate handles the create command execution.
// It reads the secret from stdin, file, or text flag, encrypts it, and sends it to the server.
func runCreate(cmd *cobra.Command, args []string) error {
	cfg := config.LoadConfig()
	if serverURL != "" {
		cfg.ServerURL = serverURL
	}

	secret, err := readSecret()
	if err != nil {
		return fmt.Errorf("read secret: %w", err)
	}

	if secret == "" {
		return fmt.Errorf("secret cannot be empty")
	}

	encrypted, err := crypto.EncryptSecret(secret, password)
	if err != nil {
		return fmt.Errorf("encrypt secret: %w", err)
	}

	req := &api.CreateSecretRequest{
		Ciphertext: encrypted.Ciphertext,
		IV:         encrypted.IV,
		Salt:       encrypted.Salt,
		KDF:        "pbkdf2",
		KDFParams: map[string]interface{}{
			"iterations":          crypto.PBKDF2Iterations,
			"isPasswordProtected": password != "",
		},
	}

	if burnAfterRead {
		req.BurnAfterRead = &burnAfterRead
	}

	if expiresIn != "" {
		req.ExpiresIn = expiresIn
	}

	client := api.NewClient(cfg.ServerURL)
	resp, err := client.CreateSecret(req)
	if err != nil {
		return fmt.Errorf("create secret: %w", err)
	}

	outputResult(cfg.ServerURL, resp.ID, encrypted.Key, password, noClipboard)
	return nil
}

// outputResult prints the creation result and optionally copies the link to clipboard.
// The encryption key is embedded in the URL query parameter - it never leaves the client.
func outputResult(serverURL, id, key, password string, noClipboard bool) {
	// Always construct URL from ID to ensure it's present
	// Encryption key never sent to server, only exists in URL query param
	link := fmt.Sprintf("%s/s/%s?key=%s", serverURL, id, key)

	fmt.Println("Secret created successfully!")
	fmt.Println()
	fmt.Println("Link:")
	fmt.Println(link)

	if password != "" {
		fmt.Println()
		fmt.Println("Password:")
		fmt.Println(password)
	}

	if !noClipboard {
		if err := clipboard.WriteAll(link); err == nil {
			fmt.Println()
			fmt.Println("✓ Link copied to clipboard")
		}
	}
}

// readSecret reads the secret from one of three sources (in priority order):
// 1. --text flag
// 2. --file flag
// 3. stdin (pipe)
func readSecret() (string, error) {
	if secretText != "" {
		return secretText, nil
	}

	if filePath != "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return "", fmt.Errorf("read file: %w", err)
		}
		return string(data), nil
	}

	return readStdin()
}

// readStdin reads secret from standard input.
// Returns an error if stdin is a terminal (not a pipe).
func readStdin() (string, error) {
	stat, _ := os.Stdin.Stat()
	if (stat.Mode() & os.ModeCharDevice) != 0 {
		return "", fmt.Errorf("no input provided. Use --text, --file, or pipe input")
	}

	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		return "", fmt.Errorf("read stdin: %w", err)
	}
	return string(data), nil
}
