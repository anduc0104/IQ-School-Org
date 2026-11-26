import { pool, sourcePool, query } from '../db.js';
import { matchNodeName } from '../seed.js';

export async function importFromSource() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nodesRes = await client.query('SELECT id, name FROM org_nodes');
    const nodeByName = new Map(nodesRes.rows.map((n) => [n.name.toLowerCase(), n]));

    // --- Lookup tables (không ảnh hưởng cấu trúc sơ đồ) ---
    const schools = await sourcePool.query(`
      SELECT "Id", "Name", "Address"
      FROM "SCH_Schools"
      WHERE "IsDeleted" IS NOT TRUE
    `);
    for (const s of schools.rows) {
      await client.query(
        `INSERT INTO source_schools (id, name, address, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           address = EXCLUDED.address,
           updated_at = NOW()`,
        [s.Id, s.Name, s.Address || null],
      );
    }

    const classes = await sourcePool.query(`
      SELECT "Id", "SchoolId", "Name", "cfSchoolYear", "cfGrade", "cfType", "isActive"
      FROM "SCH_Classes"
      WHERE "IsDeleted" IS NOT TRUE
    `);
    const classById = new Map();
    for (const c of classes.rows) {
      classById.set(c.Id, c);
      await client.query(
        `INSERT INTO source_classes (
           id, school_id, name, school_year, grade, class_type, is_active, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (id) DO UPDATE SET
           school_id = EXCLUDED.school_id,
           name = EXCLUDED.name,
           school_year = EXCLUDED.school_year,
           grade = EXCLUDED.grade,
           class_type = EXCLUDED.class_type,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()`,
        [
          c.Id,
          c.SchoolId,
          c.Name,
          c.cfSchoolYear || null,
          c.cfGrade || null,
          c.cfType || null,
          c.isActive !== false,
        ],
      );
    }

    const depts = await sourcePool.query(`
      SELECT "Id", "Name", "cfDepartmentType"
      FROM "SCH_Departments"
      WHERE "IsDeleted" IS NOT TRUE
    `);

    const deptById = new Map();
    const deptToNodeId = new Map();
    const unmatchedDepartments = [];
    for (const dept of depts.rows) {
      deptById.set(dept.Id, dept);
      await client.query(
        `INSERT INTO source_departments (id, name, dept_type, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           dept_type = EXCLUDED.dept_type,
           updated_at = NOW()`,
        [dept.Id, dept.Name, dept.cfDepartmentType || null],
      );

      const mapped = matchNodeName(dept.Name || '');
      if (!mapped) {
        unmatchedDepartments.push(dept.Name);
        continue;
      }
      const node = nodeByName.get(mapped.toLowerCase());
      if (!node) {
        unmatchedDepartments.push(dept.Name);
        continue;
      }
      deptToNodeId.set(dept.Id, node.id);
      await client.query(
        `UPDATE org_nodes
         SET source_department_ids = (
           SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(source_department_ids, '{}') || $2::int[]) AS x)
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [node.id, [dept.Id]],
      );
    }

    const employees = await sourcePool.query(`
      SELECT
        e."Id", e."Name", e."EnglishName", e."Email", e."PhoneNumber",
        e."cfRole", e."Username", e."IsDisabled", e."MainSchoolId"
      FROM "SCH_Employees" e
      WHERE e."IsDeleted" IS NOT TRUE
      ORDER BY e."Id"
    `);

    const classRows = await sourcePool.query(`
      SELECT
        eic."EmployeeId",
        eic."ClassId",
        c."Name" AS class_name,
        c."SchoolId" AS school_id,
        eic."IsDefault",
        eic."cfRole"
      FROM "SCH_EmployeeInClasses" eic
      JOIN "SCH_Classes" c ON c."Id" = eic."ClassId"
      WHERE eic."IsDeleted" IS NOT TRUE
        AND (eic."IsActive" IS TRUE OR eic."IsActive" IS NULL)
        AND c."IsDeleted" IS NOT TRUE
      ORDER BY eic."EmployeeId", eic."IsDefault" DESC NULLS LAST
    `);

    const classesByEmp = new Map();
    for (const row of classRows.rows) {
      if (!classesByEmp.has(row.EmployeeId)) classesByEmp.set(row.EmployeeId, []);
      classesByEmp.get(row.EmployeeId).push(row);
    }

    const memberships = await sourcePool.query(`
      SELECT "EmployeeId", "DepartmentId", "IsMainDepartment"
      FROM "SCH_EmployeeInDepartments"
      WHERE "IsDeleted" IS NOT TRUE
        AND ("IsActive" IS TRUE OR "IsActive" IS NULL)
    `);

    const membershipsByEmp = new Map();
    for (const row of memberships.rows) {
      if (!membershipsByEmp.has(row.EmployeeId)) membershipsByEmp.set(row.EmployeeId, []);
      membershipsByEmp.get(row.EmployeeId).push(row);
    }

    let upserted = 0;
    let linked = 0;

    for (const emp of employees.rows) {
      const classInfos = classesByEmp.get(emp.Id) || [];
      const classNames = [...new Set(classInfos.map((c) => c.class_name).filter(Boolean))];
      const classIds = [...new Set(classInfos.map((c) => c.ClassId).filter(Boolean))];
      const schoolIds = new Set();
      if (emp.MainSchoolId) schoolIds.add(emp.MainSchoolId);
      for (const c of classInfos) {
        if (c.school_id) schoolIds.add(c.school_id);
      }
      // Mô tả ưu tiên: GVCN (MAIN_TEACHER) → GVBM (SUBJECT_TEACHER) → phòng ban
      const gvcnClass =
        classInfos.find((c) => c.cfRole === 'MAIN_TEACHER')?.class_name || null;
      const gvbmClass =
        classInfos.find((c) => c.cfRole === 'SUBJECT_TEACHER')?.class_name || null;
      const mainClass = gvcnClass || gvbmClass || null;

      const empDepts = membershipsByEmp.get(emp.Id) || [];
      const departmentIds = [...new Set(empDepts.map((m) => m.DepartmentId).filter(Boolean))];
      const departmentNames = departmentIds
        .map((id) => deptById.get(id)?.Name)
        .filter(Boolean);

      const upsert = await client.query(
        `INSERT INTO employees (
           source_id, name, english_name, email, phone, role_code, username,
           class_names, main_class, school_ids, class_ids, department_ids, department_names,
           is_disabled, extra, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         ON CONFLICT (source_id) DO UPDATE SET
           name = EXCLUDED.name,
           english_name = EXCLUDED.english_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           role_code = EXCLUDED.role_code,
           username = EXCLUDED.username,
           class_names = EXCLUDED.class_names,
           main_class = EXCLUDED.main_class,
           school_ids = EXCLUDED.school_ids,
           class_ids = EXCLUDED.class_ids,
           department_ids = EXCLUDED.department_ids,
           department_names = EXCLUDED.department_names,
           is_disabled = EXCLUDED.is_disabled,
           extra = EXCLUDED.extra,
           updated_at = NOW()
         RETURNING id`,
        [
          emp.Id,
          emp.Name || `NV-${emp.Id}`,
          emp.EnglishName,
          emp.Email,
          emp.PhoneNumber,
          emp.cfRole,
          emp.Username,
          classNames,
          mainClass,
          [...schoolIds],
          classIds,
          departmentIds,
          departmentNames,
          Boolean(emp.IsDisabled),
          JSON.stringify({
            mainSchoolId: emp.MainSchoolId,
            gvcn_class: gvcnClass,
            gvbm_class: gvbmClass,
          }),
        ],
      );

      const employeeId = upsert.rows[0].id;
      upserted += 1;

      await client.query('DELETE FROM employee_nodes WHERE employee_id = $1', [employeeId]);

      const seenNodes = new Set();
      for (const m of empDepts) {
        const nodeId = deptToNodeId.get(m.DepartmentId);
        if (!nodeId || seenNodes.has(nodeId)) continue;
        seenNodes.add(nodeId);
        await client.query(
          `INSERT INTO employee_nodes (employee_id, node_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [employeeId, nodeId, Boolean(m.IsMainDepartment)],
        );
        linked += 1;
      }
    }

    await client.query('COMMIT');
    return {
      employees: upserted,
      links: linked,
      schools: schools.rows.length,
      classes: classes.rows.length,
      departments: depts.rows.length,
      unmatchedDepartments: [...new Set(unmatchedDepartments)],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function importFromExcelRows(rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodesRes = await client.query('SELECT id, name FROM org_nodes');
    const nodeByName = new Map(nodesRes.rows.map((n) => [n.name.toLowerCase().trim(), n.id]));

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const name = String(row.name || row.Name || row['Họ tên'] || row['Ho ten'] || '').trim();
      if (!name) continue;

      const englishName = row.english_name || row.EnglishName || row['Tên tiếng Anh'] || null;
      const email = row.email || row.Email || null;
      const phone = row.phone || row.Phone || row['SĐT'] || null;
      const role = row.role || row.cfRole || row['Vai trò'] || null;
      const mainClass = row.main_class || row.class || row['Lớp'] || null;
      const classNames = mainClass ? [String(mainClass)] : [];
      const deptsRaw = row.departments || row.nodes || row['Phòng ban'] || '';
      const deptNames = String(deptsRaw)
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const existing = await client.query(
        `SELECT id FROM employees WHERE LOWER(name) = LOWER($1) AND ($2::text IS NULL OR email = $2) LIMIT 1`,
        [name, email]
      );

      let employeeId;
      if (existing.rows[0]) {
        employeeId = existing.rows[0].id;
        await client.query(
          `UPDATE employees SET
             english_name = COALESCE($2, english_name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             role_code = COALESCE($5, role_code),
             main_class = COALESCE($6, main_class),
             class_names = CASE WHEN cardinality($7::text[]) > 0 THEN $7 ELSE class_names END,
             updated_at = NOW()
           WHERE id = $1`,
          [employeeId, englishName, email, phone, role, mainClass, classNames]
        );
        updated += 1;
      } else {
        const ins = await client.query(
          `INSERT INTO employees (name, english_name, email, phone, role_code, class_names, main_class)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [name, englishName, email, phone, role, classNames, mainClass]
        );
        employeeId = ins.rows[0].id;
        created += 1;
      }

      for (const deptName of deptNames) {
        const nodeId = nodeByName.get(deptName.toLowerCase());
        if (!nodeId) continue;
        await client.query(
          `INSERT INTO employee_nodes (employee_id, node_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [employeeId, nodeId]
        );
      }
    }

    await client.query('COMMIT');
    return { created, updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
