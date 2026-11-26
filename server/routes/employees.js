import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query } from '../db.js';
import { importFromExcelRows, importFromSource } from '../services/importEmployees.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  const { q, node_id } = req.query;
  const params = [];
  const where = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(e.name ILIKE $${params.length} OR e.english_name ILIKE $${params.length} OR e.main_class ILIKE $${params.length} OR e.email ILIKE $${params.length})`);
  }
  if (node_id) {
    params.push(node_id);
    where.push(`EXISTS (SELECT 1 FROM employee_nodes en WHERE en.employee_id = e.id AND en.node_id = $${params.length})`);
  }

  const sql = `
    SELECT e.*,
      COALESCE(json_agg(
        json_build_object('id', n.id, 'name', n.name, 'color', n.color)
        ORDER BY n.name
      ) FILTER (WHERE n.id IS NOT NULL), '[]') AS nodes
    FROM employees e
    LEFT JOIN employee_nodes en ON en.employee_id = e.id
    LEFT JOIN org_nodes n ON n.id = en.node_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY e.id
    ORDER BY e.name
  `;
  const result = await query(sql, params);
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await query(
    `SELECT e.*,
      COALESCE(json_agg(
        json_build_object('id', n.id, 'name', n.name, 'color', n.color, 'is_primary', en.is_primary)
      ) FILTER (WHERE n.id IS NOT NULL), '[]') AS nodes
     FROM employees e
     LEFT JOIN employee_nodes en ON en.employee_id = e.id
     LEFT JOIN org_nodes n ON n.id = en.node_id
     WHERE e.id = $1
     GROUP BY e.id`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const {
    name,
    english_name,
    email,
    phone,
    role_code,
    main_class,
    class_names = [],
    node_ids = [],
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const client = await (await import('../db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO employees (name, english_name, email, phone, role_code, main_class, class_names)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        name.trim(),
        english_name || null,
        email || null,
        phone || null,
        role_code || null,
        main_class || null,
        class_names.length ? class_names : main_class ? [main_class] : [],
      ]
    );
    const emp = ins.rows[0];
    for (const nodeId of node_ids) {
      await client.query(
        `INSERT INTO employee_nodes (employee_id, node_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [emp.id, nodeId]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(emp);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const fields = [
    'name',
    'english_name',
    'email',
    'phone',
    'role_code',
    'main_class',
    'class_names',
    'is_disabled',
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = $${i++}`);
      values.push(req.body[f]);
    }
  }
  if (!sets.length && !req.body.node_ids) return res.status(400).json({ error: 'no fields' });

  const client = await (await import('../db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    let emp;
    if (sets.length) {
      sets.push('updated_at = NOW()');
      values.push(req.params.id);
      const result = await client.query(
        `UPDATE employees SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      emp = result.rows[0];
      if (!emp) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'not found' });
      }
    } else {
      const result = await client.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
      emp = result.rows[0];
      if (!emp) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'not found' });
      }
    }

    if (Array.isArray(req.body.node_ids)) {
      await client.query('DELETE FROM employee_nodes WHERE employee_id = $1', [req.params.id]);
      for (const nodeId of req.body.node_ids) {
        await client.query(
          `INSERT INTO employee_nodes (employee_id, node_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, nodeId]
        );
      }
    }

    await client.query('COMMIT');
    res.json(emp);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM employees WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.post('/import/source', async (_req, res) => {
  const result = await importFromSource();
  res.json(result);
});

router.post('/import/excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const result = await importFromExcelRows(rows);
  res.json({ ...result, rows: rows.length });
});

export default router;
