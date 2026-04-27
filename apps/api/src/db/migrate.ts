import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './client.js';

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;

await migrate(db, { migrationsFolder });
console.log(`migrations applied from ${migrationsFolder}`);
process.exit(0);
