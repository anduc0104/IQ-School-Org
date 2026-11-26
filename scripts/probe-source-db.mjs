import pg from 'pg';

const { Client } = pg;

async function main() {
  const admin = new Client({
    host: '100.100.37.56',
    port: 5432,
    user: 'postgres',
    password: 'hZ@03092017',
    database: 'postgres',
  });

  await admin.connect();
  const dbs = await admin.query(
    "SELECT datname FROM pg_database WHERE datname ILIKE '%iq_dotnet%' ORDER BY datname"
  );
  console.log('databases:', dbs.rows);

  for (const { datname } of dbs.rows) {
    const c = new Client({
      host: '100.100.37.56',
      port: 5432,
      user: 'postgres',
      password: 'hZ@03092017',
      database: datname,
    });
    await c.connect();
    try {
      const tables = await c.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'SCH_Employees', 'SCH_Departments', 'SCH_EmployeeInDepartments',
            'SCH_Classes', 'SCH_EmployeeInClasses'
          )
        ORDER BY table_name
      `);
      console.log(`\n${datname} tables:`, tables.rows.map((r) => r.table_name));
      if (tables.rows.some((r) => r.table_name === 'SCH_Employees')) {
        const count = await c.query('SELECT COUNT(*)::int AS n FROM "SCH_Employees" WHERE "IsDeleted" IS NOT TRUE');
        console.log(`${datname} employees:`, count.rows[0].n);
      }
    } catch (e) {
      console.log(`${datname} error:`, e.message);
    } finally {
      await c.end();
    }
  }

  await admin.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
