// Package config provides configuration management for the CLI.
package config

import (
	"os"
	"path/filepath"
)

// Config holds the CLI configuration.
type Config struct {
	ServerURL string
}

// LoadConfig loads configuration from environment variables.
// Defaults to http://localhost:3000 if OTS_SERVER_URL is not set.
func LoadConfig() *Config {
	cfg := &Config{
		ServerURL: "http://localhost:3000", // Default
	}

	// Check environment variable
	if serverURL := os.Getenv("OTS_SERVER_URL"); serverURL != "" {
		cfg.ServerURL = serverURL
	}

	return cfg
}

// GetConfigPath returns the path to the config file in the user's home directory.
func GetConfigPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, ".otsconfig")
}
