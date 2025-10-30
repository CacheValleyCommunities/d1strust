// Package cmd provides the root command and command structure for the OTS CLI.
package cmd

import (
	"fmt"
	"os"

	"github.com/brentdalling/ots-cli/cmd/create"
	"github.com/brentdalling/ots-cli/cmd/redeem"
	"github.com/spf13/cobra"
)

var (
	// version is the version string, set at build time via ldflags
	version = "dev"
	// commit is the git commit hash, set at build time via ldflags
	commit = "unknown"
)

var rootCmd = &cobra.Command{
	Use:     "ots",
	Short:   "One-Time Secret CLI",
	Long:    "A CLI tool for creating and redeeming one-time secrets with client-side encryption",
	Version: fmt.Sprintf("%s (%s)", version, commit),
}

func init() {
	rootCmd.AddCommand(create.CreateCmd)
	rootCmd.AddCommand(redeem.RedeemCmd)
}

// Execute runs the root command and handles errors.
// This is the main entry point called from main().
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
