import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { migrate, seedTree } from './seed.js';
import nodesRouter from './routes/nodes.js';
import employeesRouter from './routes/employees.js';
import metaRouter from './routes/meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5050);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/nodes', nodesRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/meta', metaRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

async function start() {
  for (let i = 0; i < 20; i += 1) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await migrate();
  await seedTree(false);

  app.listen(PORT, () => {
    console.log(`IQ Diagram API http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
