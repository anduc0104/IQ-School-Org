import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

router.get('/schools', async (_req, res) => {
  const result = await query(`
    SELECT id, name, address
    FROM source_schools
    ORDER BY name
  `)
  res.json(result.rows)
})

router.get('/classes', async (req, res) => {
  const { school_id, active } = req.query
  const params = []
  const where = []

  if (school_id) {
    params.push(Number(school_id))
    where.push(`school_id = $${params.length}`)
  }
  if (active === '1' || active === 'true') {
    where.push('is_active IS TRUE')
  }

  const result = await query(
    `
    SELECT id, school_id, name, school_year, grade, class_type, is_active
    FROM source_classes
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY school_year DESC NULLS LAST, name
  `,
    params,
  )
  res.json(result.rows)
})

router.get('/departments', async (_req, res) => {
  const result = await query(`
    SELECT id, name, dept_type
    FROM source_departments
    ORDER BY name
  `)
  res.json(result.rows)
})

export default router
