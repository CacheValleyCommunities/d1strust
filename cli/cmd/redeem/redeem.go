// Package redeem provides the command for redeeming one-time secrets.
package redeem

import (
	"fmt"
	"net/url"
	"strings"
	"syscall"

	"github.com/atotto/clipboard"
	"github.com/brentdalling/ots-cli/internal/api"
	"github.com/brentdalling/ots-cli/internal/config"
	"github.com/brentdalling/ots-cli/internal/crypto"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var (
	password    string
	noClipboard bool
	serverURL   string
)

// RedeemCmd is the cobra command for redeeming secrets.
var RedeemCmd = &cobra.Command{
	Use:   "redeem <link>",
	Short: "Redeem a one-time secret",
	Long:  "Redeem a one-time secret by providing the full link with key",
	Args:  cobra.ExactArgs(1),
	RunE:  runRedeem,
}

func init() {
	RedeemCmd.Flags().StringVarP(&password, "password", "p", "", "Password to decrypt the secret")
	RedeemCmd.Flags().BoolVarP(&noClipboard, "no-clipboard", "n", false, "Don't copy secret to clipboard")
	RedeemCmd.Flags().StringVarP(&serverURL, "server", "s", "", "Override server URL")
}

// runRedeem handles the redeem command execution.
// It extracts the token and key from the URL, retrieves the secret from the server,
// and decrypts it client-side.
func runRedeem(cmd *cobra.Command, args []string) error {
	parsedURL, err := url.Parse(args[0])
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	token, key, err := extractTokenAndKey(parsedURL)
	if err != nil {
		return err
	}

	cfg := config.LoadConfig()
	if serverURL != "" {
		cfg.ServerURL = serverURL
	} else if parsedURL.Scheme != "" && parsedURL.Host != "" {
		cfg.ServerURL = fmt.Sprintf("%s://%s", parsedURL.Scheme, parsedURL.Host)
	}

	client := api.NewClient(cfg.ServerURL)
	resp, err := client.RetrieveSecret(token)
	if err != nil {
		return fmt.Errorf("retrieve secret: %w", err)
	}

	enc := &crypto.EncryptedSecret{
		Ciphertext: resp.Ciphertext,
		IV:         resp.IV,
		Salt:       resp.Salt,
		Key:        key,
	}

	plaintext, err := decryptSecret(enc, password)
	if err != nil {
		return fmt.Errorf("decrypt secret: %w", err)
	}

	outputSecret(plaintext, noClipboard)
	return nil
}

// extractTokenAndKey extracts the server-generated token and encryption key from a URL.
// Expected format: /s/{token}?key={encryptionKey}
func extractTokenAndKey(parsedURL *url.URL) (string, string, error) {
	path := strings.TrimPrefix(parsedURL.Path, "/")
	parts := strings.Split(path, "/")

	if len(parts) < 2 || parts[0] != "s" {
		return "", "", fmt.Errorf("invalid link format: expected /s/:token")
	}

	token := parts[1]
	if token == "" {
		return "", "", fmt.Errorf("missing token in URL")
	}

	key := parsedURL.Query().Get("key")
	if key == "" {
		return "", "", fmt.Errorf("missing key parameter in URL")
	}

	return token, key, nil
}

// decryptSecret decrypts the secret using the provided password.
// If password is required but not provided, prompts the user if running in a terminal.
func decryptSecret(enc *crypto.EncryptedSecret, providedPassword string) (string, error) {
	plaintext, err := crypto.DecryptSecret(enc, providedPassword)
	if err != nil {
		// If password required and not provided, try to prompt if in terminal
		if err == crypto.ErrPasswordRequired && providedPassword == "" {
			if term.IsTerminal(int(syscall.Stdin)) {
				return promptAndDecrypt(enc)
			}
			return "", fmt.Errorf("password required (use --password flag or run in terminal)")
		}
		return "", err
	}
	return plaintext, nil
}

// promptAndDecrypt prompts the user for a password and decrypts the secret.
func promptAndDecrypt(enc *crypto.EncryptedSecret) (string, error) {
	fmt.Print("Enter password: ")
	defer fmt.Println()

	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}

	return crypto.DecryptSecret(enc, string(passwordBytes))
}

// outputSecret prints the decrypted secret and optionally copies it to clipboard.
func outputSecret(plaintext string, noClipboard bool) {
	fmt.Println("Secret retrieved successfully!")
	fmt.Println()
	fmt.Println(plaintext)

	if !noClipboard {
		if err := clipboard.WriteAll(plaintext); err == nil {
			fmt.Println()
			fmt.Println("✓ Copied to clipboard")
		}
	}
}
