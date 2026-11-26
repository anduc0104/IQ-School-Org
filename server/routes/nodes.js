import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

function buildTree(rows, parentId = null) {
  return rows
    .filter((r) => (r.parent_id || null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      ...r,
      children: buildTree(rows, r.id),
    }));
}

router.get('/', async (_req, res) => {
  const nodes = await query(`
    SELECT n.*,
      COALESCE((
        SELECT COUNT(*)::int FROM employee_nodes en WHERE en.node_id = n.id
      ), 0) AS member_count
    FROM org_nodes n
    ORDER BY n.level, n.sort_order, n.name
  `);
  res.json({ flat: nodes.rows, tree: buildTree(nodes.rows) });
});

router.get('/:id/members', async (req, res) => {
  const result = await query(
    `SELECT e.*,
       en_focus.is_primary,
       COALESCE((
         SELECT json_agg(
           json_build_object('id', n.id, 'name', n.name, 'color', n.color)
           ORDER BY n.name
         )
         FROM employee_nodes en_all
         JOIN org_nodes n ON n.id = en_all.node_id
         WHERE en_all.employee_id = e.id
       ), '[]') AS nodes
     FROM employee_nodes en_focus
     JOIN employees e ON e.id = en_focus.employee_id
     WHERE en_focus.node_id = $1
     ORDER BY en_focus.is_primary DESC, e.name`,
    [req.params.id]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { parent_id, name, color, node_type = 'department', show_members_on_tree = false } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  let level = 0;
  let inheritedColor = color;
  if (parent_id) {
    const parent = await query('SELECT level, color FROM org_nodes WHERE id = $1', [parent_id]);
    if (!parent.rows[0]) return res.status(404).json({ error: 'parent not found' });
    level = parent.rows[0].level + 1;
    if (!inheritedColor) inheritedColor = parent.rows[0].color;
  }

  const sort = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM org_nodes WHERE parent_id IS NOT DISTINCT FROM $1',
    [parent_id || null]
  );

  const result = await query(
    `INSERT INTO org_nodes (parent_id, name, color, level, sort_order, node_type, show_members_on_tree)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      parent_id || null,
      name.trim(),
      inheritedColor || '#64748B',
      level,
      sort.rows[0].next,
      node_type,
      Boolean(show_members_on_tree),
    ]
  );
  res.status(201).json(result.rows[0]);
});

/** Đổi cha + thứ tự: body { parent_id, before_id? } — before_id = null → cuối danh sách */
router.post('/:id/move', async (req, res) => {
  const nodeId = req.params.id;
  const { parent_id = null, before_id = null } = req.body || {};

  if (parent_id === nodeId) {
    return res.status(400).json({ error: 'Không thể đặt node làm cha của chính nó' });
  }

  const nodeRes = await query('SELECT * FROM org_nodes WHERE id = $1', [nodeId]);
  if (!nodeRes.rows[0]) return res.status(404).json({ error: 'not found' });

  if (parent_id) {
    const parent = await query('SELECT id, level FROM org_nodes WHERE id = $1', [parent_id]);
    if (!parent.rows[0]) return res.status(404).json({ error: 'parent not found' });

    // Chặn kéo vào descendant
    const cycle = await query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM org_nodes WHERE id = $1
         UNION ALL
         SELECT n.id FROM org_nodes n JOIN subtree s ON n.parent_id = s.id
       )
       SELECT 1 FROM subtree WHERE id = $2 LIMIT 1`,
      [nodeId, parent_id]
    );
    if (cycle.rows[0]) {
      return res.status(400).json({ error: 'Không thể kéo vào node con của chính nó' });
    }
  }

  const siblings = await query(
    `SELECT id FROM org_nodes
     WHERE parent_id IS NOT DISTINCT FROM $1 AND id <> $2
     ORDER BY sort_order, name`,
    [parent_id, nodeId]
  );

  const ordered = siblings.rows.map((r) => r.id);
  if (before_id && ordered.includes(before_id)) {
    const idx = ordered.indexOf(before_id);
    ordered.splice(idx, 0, nodeId);
  } else {
    ordered.push(nodeId);
  }

  const client = await (await import('../db.js')).pool.connect();
  try {
    await client.query('BEGIN');
    let level = 0;
    if (parent_id) {
      const p = await client.query('SELECT level FROM org_nodes WHERE id = $1', [parent_id]);
      level = p.rows[0].level + 1;
    }
    await client.query(
      `UPDATE org_nodes SET parent_id = $1, level = $2, updated_at = NOW() WHERE id = $3`,
      [parent_id, level, nodeId]
    );
    for (let i = 0; i < ordered.length; i += 1) {
      await client.query(`UPDATE org_nodes SET sort_order = $1, updated_at = NOW() WHERE id = $2`, [
        i,
        ordered[i],
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updated = await query('SELECT * FROM org_nodes WHERE id = $1', [nodeId]);
  res.json(updated.rows[0]);
});

router.patch('/:id', async (req, res) => {
  const allowed = {
    name: req.body.name,
    color: req.body.color,
    node_type: req.body.node_type,
    show_members_on_tree: req.body.show_members_on_tree,
    notes: req.body.notes,
    sort_order: req.body.sort_order,
    parent_id: req.body.parent_id,
  };

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(allowed)) {
    if (value !== undefined) {
      values.push(value);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (req.body.parent_id !== undefined) {
    if (req.body.parent_id) {
      const parent = await query('SELECT level FROM org_nodes WHERE id = $1', [req.body.parent_id]);
      if (!parent.rows[0]) return res.status(404).json({ error: 'parent not found' });
      values.push(parent.rows[0].level + 1);
    } else {
      values.push(0);
    }
    sets.push(`level = $${values.length}`);
  }

  if (!sets.length) return res.status(400).json({ error: 'no fields' });
  sets.push('updated_at = NOW()');
  values.push(req.params.id);

  const result = await query(
    `UPDATE org_nodes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'not found' });

  if (req.body.color && req.body.cascade_color) {
    await query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM org_nodes WHERE id = $1
         UNION ALL
         SELECT n.id FROM org_nodes n JOIN subtree s ON n.parent_id = s.id
       )
       UPDATE org_nodes SET color = $2, updated_at = NOW()
       WHERE id IN (SELECT id FROM subtree) AND id <> $1`,
      [req.params.id, req.body.color]
    );
  }

  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM org_nodes WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.post('/:id/members', async (req, res) => {
  const { employee_id, is_primary = false } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
  await query(
    `INSERT INTO employee_nodes (employee_id, node_id, is_primary)
     VALUES ($1,$2,$3)
     ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [employee_id, req.params.id, Boolean(is_primary)]
  );
  res.status(201).json({ ok: true });
});

router.delete('/:id/members/:employeeId', async (req, res) => {
  await query('DELETE FROM employee_nodes WHERE node_id = $1 AND employee_id = $2', [
    req.params.id,
    req.params.employeeId,
  ]);
  res.json({ ok: true });
});

export default router;
