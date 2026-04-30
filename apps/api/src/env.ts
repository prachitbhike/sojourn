import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0]!;
    const close = value.indexOf(quote, 1);
    if (close === -1) return value;
    return value.slice(1, close);
  }
  const commentIdx = value.search(/\s+#/);
  if (commentIdx === -1) return value;
  return value.slice(0, commentIdx).trimEnd();
}

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
    const value = parseValue(line.slice(eq + 1));
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv('.env.local');
loadDotEnv('.env');

function parseStubSource(value: string | undefined): 'local' | 'r2' {
  if (value === undefined || value === '') return 'local';
  if (value !== 'local' && value !== 'r2') {
    throw new Error(`STUB_SOURCE must be "local" or "r2" (got: "${value}")`);
  }
  return value;
}

const PORTRAIT_GENERATOR_IDS = ['stub', 'nano-banana'] as const;
type PortraitGeneratorId = (typeof PORTRAIT_GENERATOR_IDS)[number];
const SPRITE_GENERATOR_IDS = ['stub', 'pixellab'] as const;
type SpriteGeneratorId = (typeof SPRITE_GENERATOR_IDS)[number];

function parsePortraitGenerator(value: string | undefined): PortraitGeneratorId {
  const v = value ?? 'stub';
  if (!(PORTRAIT_GENERATOR_IDS as readonly string[]).includes(v)) {
    throw new Error(
      `PORTRAIT_GENERATOR must be one of: ${PORTRAIT_GENERATOR_IDS.join(', ')} (got: "${v}")`,
    );
  }
  return v as PortraitGeneratorId;
}

function parseSpriteGenerator(value: string | undefined): SpriteGeneratorId {
  // Default to the real pixellab generator now that Slice 2 has shipped.
  // Tests / CI / offline-dev still set SPRITE_GENERATOR=stub explicitly.
  const v = value ?? 'pixellab';
  if (!(SPRITE_GENERATOR_IDS as readonly string[]).includes(v)) {
    throw new Error(
      `SPRITE_GENERATOR must be one of: ${SPRITE_GENERATOR_IDS.join(', ')} (got: "${v}")`,
    );
  }
  return v as SpriteGeneratorId;
}

function parsePort(value: string | undefined): number {
  const raw = value ?? '3000';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a positive integer ≤ 65535 (got: "${raw}")`);
  }
  return port;
}

const REFERENCE_UPLOAD_MAX_BYTES_DEFAULT = 8 * 1024 * 1024; // 8 MiB

function parseReferenceUploadMaxBytes(value: string | undefined): number {
  if (value === undefined || value === '') return REFERENCE_UPLOAD_MAX_BYTES_DEFAULT;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`REFERENCE_UPLOAD_MAX_BYTES must be a positive integer (got: "${value}")`);
  }
  return n;
}

function parseEditKeyPepper(value: string | undefined, nodeEnv: string): string {
  const pepper = value ?? '';
  if (pepper === '') {
    if (nodeEnv === 'production') {
      throw new Error('EDIT_KEY_PEPPER must be set in production');
    }
    process.stderr.write(
      '[api] WARNING: EDIT_KEY_PEPPER is empty — edit-key hashes are unpeppered. Set EDIT_KEY_PEPPER in .env.local for parity with prod.\n',
    );
  }
  return pepper;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./local.db',
  STUB_SOURCE: parseStubSource(process.env.STUB_SOURCE),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: parsePort(process.env.PORT),
  NODE_ENV: nodeEnv,
  MIGRATE_ON_BOOT: process.env.MIGRATE_ON_BOOT === '1',
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  EDIT_KEY_PEPPER: parseEditKeyPepper(process.env.EDIT_KEY_PEPPER, nodeEnv),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  PORTRAIT_GENERATOR: parsePortraitGenerator(process.env.PORTRAIT_GENERATOR),
  SPRITE_GENERATOR: parseSpriteGenerator(process.env.SPRITE_GENERATOR),
  REFERENCE_UPLOAD_MAX_BYTES: parseReferenceUploadMaxBytes(
    process.env.REFERENCE_UPLOAD_MAX_BYTES,
  ),
};

export const isDev = env.NODE_ENV !== 'production';

export function resolveStubBaseUrl(): string {
  if (env.STUB_SOURCE === 'r2') {
    if (!env.R2_PUBLIC_BASE_URL) {
      throw new Error('STUB_SOURCE=r2 requires R2_PUBLIC_BASE_URL to be set');
    }
    const base = env.R2_PUBLIC_BASE_URL.endsWith('/')
      ? env.R2_PUBLIC_BASE_URL.slice(0, -1)
      : env.R2_PUBLIC_BASE_URL;
    return `${base}/stubs/v1`;
  }
  return '/api/stubs/v1';
}
