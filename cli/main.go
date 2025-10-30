// Package main is the entry point for the OTS CLI tool.
// It delegates to the cmd package to handle command execution.
package main

import (
	"github.com/brentdalling/ots-cli/cmd"
)

// main is the entry point for the CLI application.
func main() {
	cmd.Execute()
}
