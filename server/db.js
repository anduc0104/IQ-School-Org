import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const sourcePool = new Pool({
  connectionString: process.env.SOURCE_DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}
