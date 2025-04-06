package logger

import (
	"fmt"
	"log"
	"os"
	"time"
)

var (
	// Debug controls whether debug messages are printed
	DebugState = false

	logger = log.New(os.Stdout, "", 0)
)

// SetDebug enables or disables debug logging
func SetDebug(enabled bool) {
	DebugState = enabled
}

// Info logs an informational message
func Info(format string, args ...interface{}) {
	logMessage("INFO", format, args...)
}

// Debug logs a debug message (only if Debug is enabled)
func Debug(format string, args ...interface{}) {
	if DebugState {
		logMessage("DEBUG", format, args...)
	}
}

// Warn logs a warning message
func Warn(format string, args ...interface{}) {
	logMessage("WARN", format, args...)
}

// Error logs an error message
func Error(format string, args ...interface{}) {
	logMessage("ERROR", format, args...)
}

// logMessage formats and logs a message with the specified level
func logMessage(level, format string, args ...interface{}) {
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	message := fmt.Sprintf(format, args...)
	logger.Printf("[%s] %s: %s", timestamp, level, message)
}
