import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute(
    """
    SELECT n.name, COUNT(en.employee_id)::int AS c
    FROM org_nodes n
    LEFT JOIN employee_nodes en ON en.node_id = n.id
    GROUP BY n.name
    ORDER BY c DESC, n.name
    """
)
for r in cur.fetchall():
    print(f"{r['c']:3} {r['name']}")
cur.execute("SELECT COUNT(*) AS n FROM employee_nodes")
print("total", cur.fetchone()["n"])
