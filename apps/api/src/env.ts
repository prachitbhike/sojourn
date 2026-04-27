import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(filename: string): void {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv('.env.local');
loadDotEnv('.env');

const DEFAULTS = {
  DATABASE_URL: 'file:./local.db',
  STUB_SOURCE: 'local' as 'local' | 'r2',
  CORS_ORIGIN: 'http://localhost:5173',
  PORT: '3000',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  MIGRATE_ON_BOOT: '0',
};

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? DEFAULTS.DATABASE_URL,
  STUB_SOURCE: (process.env.STUB_SOURCE ?? DEFAULTS.STUB_SOURCE) as 'local' | 'r2',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? DEFAULTS.CORS_ORIGIN,
  PORT: Number.parseInt(process.env.PORT ?? DEFAULTS.PORT, 10),
  NODE_ENV: process.env.NODE_ENV ?? DEFAULTS.NODE_ENV,
  MIGRATE_ON_BOOT: (process.env.MIGRATE_ON_BOOT ?? DEFAULTS.MIGRATE_ON_BOOT) === '1',
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  EDIT_KEY_PEPPER: process.env.EDIT_KEY_PEPPER,
};

export const isDev = env.NODE_ENV !== 'production';
