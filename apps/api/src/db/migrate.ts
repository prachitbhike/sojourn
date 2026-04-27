import { runMigrations } from './migrate-runner.js';

const folder = await runMigrations();
console.log(`migrations applied from ${folder}`);
process.exit(0);
