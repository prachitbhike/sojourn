import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export type PresignedPost = {
  url: string;
  fields: Record<string, string>;
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

// Presigned POST for browser-direct uploads with a server-enforced size cap.
// Returns `{ url, fields }`: the browser builds a multipart/form-data body
// containing every entry in `fields` (policy, signature, key, etc.) followed
// by the file as the final `file` field, then POSTs to `url`. R2 enforces the
// `content-length-range` policy condition on its side — uploads above
// `maxBytes` are rejected without us having to trust the client's headers.
export async function presignPostUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number,
  maxBytes: number,
): Promise<PresignedPost> {
  const { client, config } = getClient();
  const result = await createPresignedPost(client, {
    Bucket: config.bucket,
    Key: key,
    Conditions: [
      ['content-length-range', 0, maxBytes],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: {
      'Content-Type': contentType,
    },
    Expires: expiresInSeconds,
  });
  return { url: result.url, fields: result.fields };
}
