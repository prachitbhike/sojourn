import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '../env.js';

export const libsql = createClient({ url: env.DATABASE_URL });
export const db = drizzle(libsql);
export type DB = typeof db;
