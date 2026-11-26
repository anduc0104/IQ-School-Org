/**
 * Export org data from local Postgres → client/public/data/*.json
 *
 * Chỉ dùng khi máy còn DB (thường checkout nhánh with-backend rồi chạy,
 * hoặc cài tạm: npm install dotenv pg).
 *
 *   node scripts/export-static-data.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL trong .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

function buildTree(rows, parentId = null) {
  return rows
    .filter((r) => (r.parent_id || null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      ...r,
      children: buildTree(rows, r.id),
    }))
}

async function main() {
  const outDir = path.join(root, 'client', 'public', 'data')
  fs.mkdirSync(outDir, { recursive: true })

  const nodesRes = await pool.query(`
    SELECT n.*,
      COALESCE((
        SELECT COUNT(*)::int FROM employee_nodes en WHERE en.node_id = n.id
      ), 0) AS member_count
    FROM org_nodes n
    ORDER BY n.level, n.sort_order, n.name
  `)
  const flat = nodesRes.rows
  const tree = buildTree(flat)

  const employeesRes = await pool.query(`
    SELECT e.*,
      COALESCE(json_agg(
        json_build_object('id', n.id, 'name', n.name, 'color', n.color, 'is_primary', en.is_primary)
        ORDER BY n.name
      ) FILTER (WHERE n.id IS NOT NULL), '[]') AS nodes
    FROM employees e
    LEFT JOIN employee_nodes en ON en.employee_id = e.id
    LEFT JOIN org_nodes n ON n.id = en.node_id
    GROUP BY e.id
    ORDER BY e.name
  `)

  const schoolsRes = await pool.query(
    `SELECT id, name, address FROM source_schools ORDER BY name`,
  )
  const classesRes = await pool.query(
    `SELECT id, school_id, name, school_year, grade, class_type, is_active
     FROM source_classes ORDER BY name`,
  )
  const departmentsRes = await pool.query(
    `SELECT id, name, dept_type FROM source_departments ORDER BY name`,
  )

  const exportedAt = new Date().toISOString()
  const meta = {
    exportedAt,
    counts: {
      nodes: flat.length,
      employees: employeesRes.rows.length,
      schools: schoolsRes.rows.length,
      classes: classesRes.rows.length,
      departments: departmentsRes.rows.length,
    },
  }

  const write = (name, data) => {
    const p = path.join(outDir, name)
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
    console.log(`Wrote ${name}`)
  }

  write('nodes.json', { flat, tree, exportedAt })
  write('employees.json', { employees: employeesRes.rows, exportedAt })
  write('schools.json', schoolsRes.rows)
  write('classes.json', classesRes.rows)
  write('departments.json', departmentsRes.rows)
  write('meta.json', meta)

  console.log('Done.', meta.counts)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
