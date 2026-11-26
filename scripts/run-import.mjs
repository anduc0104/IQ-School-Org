import { migrate, seedTree } from '../server/seed.js';
import { importFromSource } from '../server/services/importEmployees.js';
import { pool, sourcePool } from '../server/db.js';

await migrate();
await seedTree(false);
const result = await importFromSource();
console.log(result);
await pool.end();
await sourcePool.end();
