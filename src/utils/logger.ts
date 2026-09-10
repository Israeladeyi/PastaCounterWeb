/// <reference types="vite/client" />

/**
 * logger.ts — Structured, levelled logger with buffer support
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  tag: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const MAX_BUFFER = 500;
const buffer: LogEntry[] = [];

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3,
};

let minLevel: LogLevel = import.meta.env.DEV ? 'DEBUG' : 'WARN';

export const Logger = {
  setLevel(level: LogLevel): void {
    minLevel = level;
  },

  debug(tag: string, message: string, metadata?: Record<string, unknown>): void {
    Logger._log('DEBUG', tag, message, metadata);
  },

  info(tag: string, message: string, metadata?: Record<string, unknown>): void {
    Logger._log('INFO', tag, message, metadata);
  },

  warn(tag: string, message: string, metadata?: Record<string, unknown>): void {
    Logger._log('WARN', tag, message, metadata);
  },

  error(tag: string, message: string, metadata?: Record<string, unknown>): void {
    Logger._log('ERROR', tag, message, metadata);
  },

  _log(level: LogLevel, tag: string, message: string, metadata?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;
    const entry: LogEntry = {ts: Date.now(), level, tag, message, metadata};
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();

    if (import.meta.env.DEV) {
      const prefix = `[${level}][${tag}]`;
      if (level === 'ERROR') console.error(prefix, message, metadata ?? '');
      else if (level === 'WARN') console.warn(prefix, message, metadata ?? '');
      else console.log(prefix, message, metadata ?? '');
    }
  },

  getBuffer(): LogEntry[] {
    return [...buffer];
  },

  clearBuffer(): void {
    buffer.length = 0;
  },
};
