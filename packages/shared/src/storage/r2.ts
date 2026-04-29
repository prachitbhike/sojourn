import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function readConfig(): R2Config {
  const required = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `R2 storage helper requires env vars: ${missing.join(', ')}. ` +
        'Set them in .env.local or pass via your deploy environment.',
    );
  }
  return {
    accountId: required.R2_ACCOUNT_ID!,
    accessKeyId: required.R2_ACCESS_KEY_ID!,
    secretAccessKey: required.R2_SECRET_ACCESS_KEY!,
    bucket: required.R2_BUCKET!,
    publicBaseUrl: required.R2_PUBLIC_BASE_URL!.replace(/\/$/, ''),
  };
}

function getClient(): { client: S3Client; config: R2Config } {
  if (cachedClient && cachedConfig) {
    return { client: cachedClient, config: cachedConfig };
  }
  const config = readConfig();
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClient = client;
  cachedConfig = config;
  return { client, config };
}

export function resetR2Client(): void {
  cachedClient = null;
  cachedConfig = null;
}

export function publicUrlFor(key: string): string {
  const { config } = getClient();
  return `${config.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { client, config } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
  return `${config.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
}

// Returns a presigned PUT URL the browser can upload to directly.
// The signature covers a `content-length-range` header — the client MUST send
// `Content-Length-Range: bytes=0-<maxBytes>` exactly, or the signature fails.
// Combined with the Content-Length the client sends, R2 enforces the size cap.
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number,
  maxBytes: number,
): Promise<string> {
  const { client, config } = getClient();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });
  command.middlewareStack.add(
    (next) => (args) => {
      const request = args.request as { headers: Record<string, string> };
      request.headers['content-length-range'] = `bytes=0-${maxBytes}`;
      return next(args);
    },
    { step: 'build', name: 'addContentLengthRange' },
  );
  return getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
    signableHeaders: new Set(['content-type', 'content-length-range']),
  });
}
