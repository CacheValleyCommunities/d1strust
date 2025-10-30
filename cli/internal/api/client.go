// Package api provides an HTTP client for interacting with the OTS API.
package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// Client is an HTTP client for the OTS API.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// CreateSecretRequest represents the request body for creating a secret.
// Note: The encryption key is NOT included - it only exists in the URL query parameter.
type CreateSecretRequest struct {
	Ciphertext    string                 `json:"ciphertext"`
	IV            string                 `json:"iv"`
	Salt          string                 `json:"salt"`
	KDF           string                 `json:"kdf"`
	KDFParams     map[string]interface{} `json:"kdfParams"`
	BurnAfterRead *bool                  `json:"burnAfterRead,omitempty"`
	ExpiresIn     string                 `json:"expiresIn,omitempty"`
}

// CreateSecretResponse represents the response from creating a secret.
// The encryption key is NOT returned - the client constructs the full URL
// by appending ?key={encryptionKey} to the retrieve URL.
type CreateSecretResponse struct {
	// ID is the server-generated identifier (unrelated to encryption key)
	ID             string `json:"id"`
	ExpiresAt      *int64 `json:"expiresAt"`
	RemainingReads int    `json:"remainingReads"`
	URLs           struct {
		Retrieve string `json:"retrieve"` // URL path like /s/{id} (client adds ?key=encryptionKey)
	} `json:"urls"`
}

// RetrieveSecretResponse represents the response from retrieving a secret.
type RetrieveSecretResponse struct {
	Ciphertext string                 `json:"ciphertext"`
	IV         string                 `json:"iv"`
	Salt       string                 `json:"salt"`
	KDF        string                 `json:"kdf"`
	KDFParams  map[string]interface{} `json:"kdfParams"`
}

// ErrorResponse represents an error response from the API.
type ErrorResponse struct {
	Error string `json:"error"`
}

// NewClient creates a new API client with the given base URL.
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CreateSecret sends a request to create a new one-time secret.
// The encryption key is never sent to the server - it only exists in the URL query parameter.
func (c *Client) CreateSecret(req *CreateSecretRequest) (*CreateSecretResponse, error) {
	url := fmt.Sprintf("%s/api/v1/ots/", c.BaseURL)

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, formatConnectionError(err, url)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusCreated {
		return nil, parseErrorResponse(resp.StatusCode, respBody)
	}

	var result CreateSecretResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &result, nil
}

// RetrieveSecret retrieves a secret by its server-generated token.
// The encryption key from the URL query parameter is never sent to the server.
func (c *Client) RetrieveSecret(token string) (*RetrieveSecretResponse, error) {
	if token == "" {
		return nil, fmt.Errorf("token cannot be empty")
	}

	url := fmt.Sprintf("%s/api/v1/ots/%s", c.BaseURL, token)

	resp, err := c.HTTPClient.Get(url)
	if err != nil {
		return nil, formatConnectionError(err, url)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, parseErrorResponse(resp.StatusCode, respBody)
	}

	var result RetrieveSecretResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &result, nil
}

// parseErrorResponse parses an error response from the API.
func parseErrorResponse(statusCode int, body []byte) error {
	var errResp ErrorResponse
	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != "" {
		return fmt.Errorf("API error (%d): %s", statusCode, errResp.Error)
	}
	return fmt.Errorf("API error: status %d, body: %s", statusCode, string(body))
}

// formatConnectionError provides user-friendly error messages for common connection issues.
func formatConnectionError(err error, url string) error {
	if err == nil {
		return nil
	}

	var opErr *net.OpError
	if errors.As(err, &opErr) {
		if opErr.Op == "dial" {
			return fmt.Errorf("cannot connect to server at %s\n\nMake sure the server is running and accessible.\nIf using a custom port, check that it's correct.", url)
		}
	}

	// Check for connection refused
	if strings.Contains(err.Error(), "connection refused") {
		return fmt.Errorf("cannot connect to server at %s (connection refused)\n\nMake sure the server is running:\n  bun run dev\n\nOr specify a different server with --server flag", url)
	}

	// Check for EOF errors (often TLS/SSL issues)
	if strings.Contains(err.Error(), "EOF") {
		suggestion := ""
		if strings.HasPrefix(url, "https://") {
			// If using HTTPS and getting EOF, suggest HTTP for local dev
			httpURL := strings.Replace(url, "https://", "http://", 1)
			suggestion = fmt.Sprintf("\n  - Try using HTTP instead: %s", httpURL)
		}
		return fmt.Errorf("connection error to %s (EOF)\n\nThis often indicates:\n  - Server is not running%s\n  - TLS/SSL configuration issue\n\nFor local development, use http:// instead of https://", url, suggestion)
	}

	// Check for timeout
	if strings.Contains(err.Error(), "timeout") {
		return fmt.Errorf("connection timeout to %s\n\nThe server did not respond in time. Check if the server is running and accessible.", url)
	}

	// Check for TLS errors
	if strings.Contains(err.Error(), "tls") || strings.Contains(err.Error(), "certificate") {
		return fmt.Errorf("TLS/SSL error connecting to %s\n\nIf using a self-signed certificate or local development, try using http:// instead of https://", url)
	}

	// Generic connection error
	return fmt.Errorf("connection error: %w\n\nTroubleshooting:\n  - Verify the server is running\n  - Check the server URL is correct\n  - Try using --server flag to specify the URL", err)
}
