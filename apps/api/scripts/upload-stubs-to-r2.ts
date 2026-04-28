import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';

// One-shot script: pushes apps/api/fixtures/stubs/v1/* into R2 under stubs/v1/
// so STUB_SOURCE=r2 (with R2_PUBLIC_BASE_URL set) can serve the same catalog.
// Skips uploads when the remote object already matches by content (md5/size),
// so re-runs are cheap and idempotent.

type EnvShape = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
};

function readEnv(): EnvShape {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `missing required env vars: ${missing.join(', ')}. Set them in apps/api/.env.local or your shell.`,
    );
  }
  return {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_BUCKET: process.env.R2_BUCKET!,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};

function contentTypeFor(name: string): string {
  return CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

const STUBS_DIR = fileURLToPath(new URL('../fixtures/stubs/v1/', import.meta.url));
const KEY_PREFIX = 'stubs/v1/';

async function main(): Promise<void> {
  // env.ts loads .env / .env.local for the API; mirror that here so the script
  // works without exporting credentials manually.
  await import('../src/env.js');
  const env = readEnv();

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  let entries: string[];
  try {
    entries = await readdir(STUBS_DIR);
  } catch (err) {
    throw new Error(`could not read stub dir at ${STUBS_DIR}: ${(err as Error).message}`);
  }

  let uploaded = 0;
  let skipped = 0;
  for (const name of entries.sort()) {
    const localPath = join(STUBS_DIR, name);
    const stats = await stat(localPath);
    if (!stats.isFile()) continue;
    const body = await readFile(localPath);
    const localMd5 = createHash('md5').update(body).digest('hex');
    const key = `${KEY_PREFIX}${name}`;

    if (await remoteMatches(client, env.R2_BUCKET, key, body.length, localMd5)) {
      console.log(`skip   ${key} (already matches, ${body.length} bytes)`);
      skipped += 1;
      continue;
    }

    const params: PutObjectCommandInput = {
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentTypeFor(name),
      ContentLength: body.length,
      CacheControl: 'public, max-age=3600, must-revalidate',
    };
    await client.send(new PutObjectCommand(params));
    console.log(`upload ${key} (${body.length} bytes, ${contentTypeFor(name)})`);
    uploaded += 1;
  }

  console.log(`\ndone. uploaded=${uploaded} skipped=${skipped}`);
  if (process.env.R2_PUBLIC_BASE_URL) {
    console.log(`public base: ${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${KEY_PREFIX}`);
  } else {
    console.log('R2_PUBLIC_BASE_URL not set — set it before flipping STUB_SOURCE=r2.');
  }
}

async function remoteMatches(
  client: S3Client,
  bucket: string,
  key: string,
  size: number,
  md5Hex: string,
): Promise<boolean> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (typeof res.ContentLength === 'number' && res.ContentLength !== size) return false;
    const remoteEtag = (res.ETag ?? '').replace(/"/g, '').toLowerCase();
    if (!remoteEtag) return false;
    return remoteEtag === md5Hex.toLowerCase();
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFound') return false;
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

await main();
