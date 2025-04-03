/**
 * Logger utility for the websocket server
 * Provides structured logging with timestamps and log levels
 */

// Log levels
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

// Logger configuration 
interface LoggerConfig {
  level: LogLevel;
  includeTimestamp: boolean;
  maxPayloadSize?: number; // Truncate large payloads to this size
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  includeTimestamp: true,
  maxPayloadSize: 1000 // Truncate large payloads to 1000 characters
};

// Keep a circular buffer of recent logs for in-memory access
const LOG_BUFFER_SIZE = 1000;
const logBuffer: string[] = [];

/**
 * Format a log message
 */
function formatLogMessage(level: LogLevel, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const prefix = DEFAULT_CONFIG.includeTimestamp ? `[${timestamp}] [${level}]` : `[${level}]`;
  
  let formattedData = '';
  if (data !== undefined) {
    // Handle different data types
    if (typeof data === 'string') {
      formattedData = data;
    } else {
      try {
        // Format JSON and truncate if needed
        const jsonStr = JSON.stringify(data, null, 2);
        formattedData = DEFAULT_CONFIG.maxPayloadSize && jsonStr.length > DEFAULT_CONFIG.maxPayloadSize
          ? `${jsonStr.substring(0, DEFAULT_CONFIG.maxPayloadSize)}... (truncated)`
          : jsonStr;
      } catch (error) {
        formattedData = String(data);
      }
    }
  }
  
  return `${prefix} ${message}${formattedData ? '\n' + formattedData : ''}`;
}

/**
 * Add a log message to the buffer
 */
function addToBuffer(logMessage: string): void {
  logBuffer.push(logMessage);
  
  // Keep buffer at maximum size
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

/**
 * Debug log
 */
export function debug(message: string, data?: any): void {
  if (shouldLog(LogLevel.DEBUG)) {
    const logMessage = formatLogMessage(LogLevel.DEBUG, message, data);
    console.debug(logMessage);
    addToBuffer(logMessage);
  }
}

/**
 * Info log
 */
export function info(message: string, data?: any): void {
  if (shouldLog(LogLevel.INFO)) {
    const logMessage = formatLogMessage(LogLevel.INFO, message, data);
    console.info(logMessage);
    addToBuffer(logMessage);
  }
}

/**
 * Warning log
 */
export function warn(message: string, data?: any): void {
  if (shouldLog(LogLevel.WARN)) {
    const logMessage = formatLogMessage(LogLevel.WARN, message, data);
    console.warn(logMessage);
    addToBuffer(logMessage);
  }
}

/**
 * Error log
 */
export function error(message: string, data?: any): void {
  if (shouldLog(LogLevel.ERROR)) {
    const logMessage = formatLogMessage(LogLevel.ERROR, message, data);
    console.error(logMessage);
    addToBuffer(logMessage);
  }
}

/**
 * Check if we should log for a given level
 */
function shouldLog(level: LogLevel): boolean {
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  const configLevelIndex = levels.indexOf(DEFAULT_CONFIG.level);
  const logLevelIndex = levels.indexOf(level);
  
  return logLevelIndex >= configLevelIndex;
}

/**
 * Get recent logs from buffer
 */
export function getRecentLogs(count: number = 100): string[] {
  return logBuffer.slice(-count);
}

/**
 * Set the current log level
 */
export function setLogLevel(level: LogLevel): void {
  DEFAULT_CONFIG.level = level;
}

/**
 * Log a websocket message in a standardized format
 */
export function logWebsocketMessage(
  direction: 'RECEIVED' | 'SENDING' | 'BROADCAST',
  message: any, 
  playerId: string,
  socketId: string
): void {
  const { type, path, messageId } = message;
  
  info(`WS ${direction} [Player: ${playerId}] [Socket: ${socketId.substring(0, 8)}...] [Type: ${type}] [ID: ${messageId || 'none'}]`, 
    path ? { path, value: message.value } : null
  );
  
  // Add more detailed logging for specific message types
  if (type === 'update' && path) {
    debug(`Update details for ${messageId || 'unknown'}`, 
      { path, valueType: typeof message.value, valuePreview: JSON.stringify(message.value).substring(0, 100) }
    );
  }
}
