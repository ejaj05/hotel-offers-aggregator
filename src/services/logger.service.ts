export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  [key: string]: unknown;
}

// ANSI Escape Codes for Terminal Colors
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export class LoggerService {
  private level: LogLevel;
  private defaultContext: string;
  private useColors: boolean;

  constructor(defaultContext = 'App') {
    this.defaultContext = defaultContext;
    this.useColors = process.env.NO_COLOR !== 'true';

    const envLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    switch (envLevel) {
      case 'DEBUG':
        this.level = LogLevel.DEBUG;
        break;
      case 'WARN':
        this.level = LogLevel.WARN;
        break;
      case 'ERROR':
        this.level = LogLevel.ERROR;
        break;
      case 'INFO':
      default:
        this.level = LogLevel.INFO;
        break;
    }
  }

  /**
   * Creates a contextual child logger with a preset module name
   */
  public forContext(context: string): LoggerService {
    const child = new LoggerService(context);
    child.level = this.level;
    child.useColors = this.useColors;
    return child;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(
    level: LogLevel,
    levelLabel: string,
    message: string,
    context?: string,
    meta?: LogContext
  ): string {
    const ctx = context || this.defaultContext;
    const timestamp = this.formatTimestamp();
    const metaString = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

    if (this.useColors) {
      let levelColor = ANSI.green;
      if (level === LogLevel.DEBUG) {
        levelColor = ANSI.magenta;
      } else if (level === LogLevel.WARN) {
        levelColor = ANSI.yellow;
      } else if (level === LogLevel.ERROR) {
        levelColor = ANSI.red;
      }

      const coloredTimestamp = `${ANSI.dim}[${timestamp}]${ANSI.reset}`;
      const coloredLevel = `${levelColor}${ANSI.bold}[${levelLabel}]${ANSI.reset}`;
      const coloredContext = `${ANSI.cyan}[${ctx}]${ANSI.reset}`;

      return `${coloredTimestamp} ${coloredLevel} ${coloredContext} ${message}${metaString}`;
    }

    return `[${timestamp}] [${levelLabel}] [${ctx}] ${message}${metaString}`;
  }

  public debug(message: string, meta?: LogContext, context?: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(this.formatMessage(LogLevel.DEBUG, 'DEBUG', message, context, meta));
    }
  }

  public info(message: string, meta?: LogContext, context?: string): void {
    if (this.level <= LogLevel.INFO) {
      console.info(this.formatMessage(LogLevel.INFO, 'INFO', message, context, meta));
    }
  }

  public warn(message: string, meta?: LogContext, context?: string): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage(LogLevel.WARN, 'WARN', message, context, meta));
    }
  }

  public error(
    message: string,
    error?: Error | unknown,
    meta?: LogContext,
    context?: string
  ): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage(LogLevel.ERROR, 'ERROR', message, context, meta);
      if (error instanceof Error) {
        console.error(formatted, `\nStack: ${error.stack}`);
      } else if (error) {
        console.error(formatted, error);
      } else {
        console.error(formatted);
      }
    }
  }
}

// Global default singleton instance
export const logger = new LoggerService();
