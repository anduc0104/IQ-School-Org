import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: '100.100.37.56',
  port: 5432,
  user: 'postgres',
  password: 'hZ@03092017',
  database: 'iq_dotnet_api',
});

await client.connect();

const depts = await client.query(`
  SELECT d."Id", d."Name", d."cfDepartmentType",
         COUNT(e."Id") FILTER (WHERE e."IsActive" IS TRUE OR e."IsActive" IS NULL) AS emp_count
  FROM "SCH_Departments" d
  LEFT JOIN "SCH_EmployeeInDepartments" e ON e."DepartmentId" = d."Id" AND e."IsDeleted" IS NOT TRUE
  WHERE d."IsDeleted" IS NOT TRUE
  GROUP BY d."Id", d."Name", d."cfDepartmentType"
  ORDER BY d."Name"
`);
console.log('departments:', JSON.stringify(depts.rows, null, 2));

const sampleEmp = await client.query(`
  SELECT e."Id", e."Name", e."EnglishName", e."Email", e."PhoneNumber", e."cfRole", e."MainSchoolId"
  FROM "SCH_Employees" e
  WHERE e."IsDeleted" IS NOT TRUE
  ORDER BY e."Id"
  LIMIT 3
`);
console.log('sample employees:', sampleEmp.rows);

const classes = await client.query(`
  SELECT eic."EmployeeId", c."Name" AS class_name, eic."cfRole", eic."IsDefault"
  FROM "SCH_EmployeeInClasses" eic
  JOIN "SCH_Classes" c ON c."Id" = eic."ClassId"
  WHERE eic."IsDeleted" IS NOT TRUE AND (eic."IsActive" IS TRUE OR eic."IsActive" IS NULL)
  ORDER BY eic."EmployeeId"
  LIMIT 20
`);
console.log('sample classes:', classes.rows);

const cols = await client.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'SCH_Employees'
  ORDER BY ordinal_position
`);
console.log('employee columns:', cols.rows.map((r) => r.column_name).join(', '));

await client.end();
