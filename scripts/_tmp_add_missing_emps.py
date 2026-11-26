import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
HA_DONG = 1

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

people = [
    {
        "name": "Nguyễn Thu Trang",
        "department_names": ["Giáo Viên Tiếng Anh"],
        "node": "Tiếng anh",
        "primary": False,
    },
    {
        "name": "Lã Thị Yến",
        "department_names": ["Y Tế"],
        "node": "Y tế",
        "primary": False,
    },
    {
        "name": "Nguyễn Thị Thu Thảo",
        "department_names": ["Pháp chế"],
        "node": "Pháp chế",
        "primary": True,
    },
]

for p in people:
    cur.execute("SELECT id, name FROM employees WHERE lower(name)=lower(%s)", (p["name"],))
    existing = cur.fetchone()
    if existing:
        emp_id = existing["id"]
        print("EXISTS", existing["name"], emp_id)
    else:
        cur.execute(
            """
            INSERT INTO employees (name, school_ids, department_names, extra)
            VALUES (%s, %s, %s, %s::jsonb)
            RETURNING id, name
            """,
            (
                p["name"],
                [HA_DONG],
                p["department_names"],
                psycopg2.extras.Json(
                    {"manual": True, "note": "Thêm tay từ Excel phân công Hà Đông"}
                ),
            ),
        )
        row = cur.fetchone()
        emp_id = row["id"]
        print("CREATED", row["name"], emp_id)

    cur.execute("SELECT id, name FROM org_nodes WHERE name=%s", (p["node"],))
    node = cur.fetchone()
    if not node:
        raise SystemExit(f"missing node {p['node']}")

    cur.execute(
        """
        INSERT INTO employee_nodes (employee_id, node_id, is_primary)
        VALUES (%s, %s, %s)
        ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
        """,
        (emp_id, node["id"], p["primary"]),
    )
    print(f"  -> {p['node']}{' LEAD' if p['primary'] else ''}")

conn.commit()

print("\nVERIFY")
for p in people:
    cur.execute(
        """
        SELECT e.name, n.name AS node, en.is_primary
        FROM employees e
        JOIN employee_nodes en ON en.employee_id = e.id
        JOIN org_nodes n ON n.id = en.node_id
        WHERE lower(e.name)=lower(%s)
        ORDER BY n.name
        """,
        (p["name"],),
    )
    for r in cur.fetchall():
        print(dict(r))

cur.close()
conn.close()
print("Done")
