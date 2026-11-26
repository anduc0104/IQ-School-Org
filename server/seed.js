import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STREAM_COLORS = {
  leadership: '#0EA5E9',
  'Luồng 1': '#3B82F6',
  'Luồng 2': '#10B981',
  'Luồng 3': '#F59E0B',
  'Luồng 4': '#8B5CF6',
};

/** Map fuzzy source department names → org node names */
export const DEPARTMENT_NAME_MAP = [
  { node: 'HĐQT', patterns: [/^hđqt$/i, /^hdqt$/i] },
  { node: 'Hội đồng trường', patterns: [/^hiệu trưởng$/i] },
  { node: 'Tiếng việt', patterns: [/tiếng việt/i, /ngữ văn/i] },
  { node: 'Tiếng anh', patterns: [/tiếng anh/i] },
  { node: 'Toán', patterns: [/toán/i] },
  { node: 'Tiếng trung', patterns: [/tiếng trung/i] },
  { node: 'Năng Khiếu', patterns: [/âm nhạc/i, /mỹ thuật/i, /thể chất/i, /tin học/i, /năng khiếu/i] },
  { node: 'GVNN', patterns: [/nước ngoài/i, /^gvnn$/i] },
  { node: 'Đưa đón', patterns: [/đưa đón/i, /xe đưa/i] },
  { node: 'Y tế', patterns: [/^y tế$/i] },
  { node: 'tư vấn tuyển sinh', patterns: [/tuyển sinh/i] },
  { node: 'Marketing', patterns: [/^marketing$/i] },
  { node: 'Pháp chế', patterns: [/pháp chế/i] },
  { node: 'Kế toán', patterns: [/kế toán/i] },
  { node: 'IT', patterns: [/^it$/i, /số hóa/i] },
  { node: 'Bảo vệ', patterns: [/bảo vệ/i] },
  { node: 'Bảo trì', patterns: [/bảo trì/i] },
  { node: 'Vệ sinh', patterns: [/lao công/i, /vệ sinh/i] },
];

const TREE = {
  name: 'HĐQT',
  type: 'leadership',
  color: STREAM_COLORS.leadership,
  children: [
    {
      name: 'Hội đồng trường',
      type: 'leadership',
      color: STREAM_COLORS.leadership,
      children: [
        {
          name: 'CEO',
          type: 'leadership',
          color: STREAM_COLORS.leadership,
          children: [
            {
              name: 'Luồng 1',
              type: 'stream',
              color: STREAM_COLORS['Luồng 1'],
              children: [
                { name: 'Tiếng việt' },
                { name: 'Tiếng anh' },
                { name: 'Toán' },
                { name: 'Tiếng trung' },
                { name: 'Năng Khiếu' },
                { name: 'GVNN' },
              ],
            },
            {
              name: 'Luồng 2',
              type: 'stream',
              color: STREAM_COLORS['Luồng 2'],
              children: [
                { name: 'Học sinh' },
                { name: 'CLB' },
                { name: 'Đưa đón' },
                { name: 'Trông muộn' },
                { name: 'Sự kiện dã ngoại' },
                { name: 'Dự án' },
                { name: 'Y tế' },
              ],
            },
            {
              name: 'Luồng 3',
              type: 'stream',
              color: STREAM_COLORS['Luồng 3'],
              children: [
                { name: 'Quan hệ khách hàng' },
                { name: 'tư vấn tuyển sinh' },
                { name: 'Marketing' },
                { name: 'Content' },
                { name: 'Hội thảo' },
                { name: 'Quản lý CTV' },
              ],
            },
            {
              name: 'Luồng 4',
              type: 'stream',
              color: STREAM_COLORS['Luồng 4'],
              children: [
                { name: 'Pháp chế' },
                { name: 'Kế toán' },
                { name: 'IT' },
                { name: 'Bảo vệ' },
                { name: 'Bảo trì' },
                { name: 'Vệ sinh' },
                { name: 'Công đoàn' },
                { name: 'Bếp' },
                { name: 'Hỗ trợ/đợi lớp' },
                { name: 'Khác' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

async function insertNode(node, parentId, level, sortOrder, inheritedColor) {
  const color = node.color || inheritedColor || '#64748B';
  const type = node.type || 'department';
  const result = await query(
    `INSERT INTO org_nodes (parent_id, name, color, level, sort_order, node_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, color`,
    [parentId, node.name, color, level, sortOrder, type]
  );
  const row = result.rows[0];
  const children = node.children || [];
  for (let i = 0; i < children.length; i += 1) {
    await insertNode(children[i], row.id, level + 1, i, color);
  }
  return row;
}

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function seedTree(force = false) {
  const existing = await query('SELECT COUNT(*)::int AS n FROM org_nodes');
  if (existing.rows[0].n > 0 && !force) {
    console.log('org_nodes already seeded');
    return;
  }
  if (force) {
    await query('TRUNCATE employee_nodes, employees, org_nodes CASCADE');
  }
  await insertNode(TREE, null, 0, 0, STREAM_COLORS.leadership);
  console.log('Seeded org tree');
}

export function matchNodeName(departmentName) {
  for (const rule of DEPARTMENT_NAME_MAP) {
    if (rule.patterns.some((re) => re.test(departmentName))) {
      return rule.node;
    }
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const force = process.argv.includes('--force');
  migrate()
    .then(() => seedTree(force))
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
