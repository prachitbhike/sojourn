import { pino, type Logger } from 'pino';

export type { Logger };

export type LoggerOptions = {
  level?: string;
  silent?: boolean;
};

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino({
    name: 'sojourn-api',
    level: options.silent ? 'silent' : (options.level ?? 'info'),
  });
}
