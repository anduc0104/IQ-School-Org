import os
import unicodedata

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def norm(s):
    return " ".join(unicodedata.normalize("NFC", str(s or "")).strip().lower().split())


names = [
    "Trần Thị Hồng",
    "Bùi Thị Xuyên",
    "Trần Thị Hà",
    "Nguyễn Thị Ngân",
    "Mai Văn Hợp",
    "Nguyễn Văn Hậu",
    "Nguyễn Bích Liên",
    "Nguyễn Thị Hường",
    "Nguyễn Hà Phương",
    "Đỗ Thị Thúy",
    "Nguyễn Yến Nhi",
    "Bùi Thị Duyên",
    "Trần Thị Kim Thiết",
    "Bùi Công Huy",
    "Bùi Công Đạt",
    "Lê Đức Ân",
    "Đỗ Dũng Quang Minh",
    "Nguyễn Dũng Quang Minh",
    "Lê Ngọc Vân",
]
cur.execute("SELECT id, name, school_ids, department_names, username FROM employees")
emps = list(cur.fetchall())
for q in names:
    hits = [e for e in emps if norm(e["name"]) == norm(q) or norm(q) in norm(e["name"])]
    print(q, "->", [(e["name"], e["school_ids"], e["department_names"], e["username"]) for e in hits] or "MISSING")

cur.execute(
    "SELECT id, name, parent_id, sort_order, color, level FROM org_nodes WHERE name IN (%s,%s,%s) OR parent_id=(SELECT id FROM org_nodes WHERE name='Luồng 4') ORDER BY level, sort_order, name",
    ("Luồng 4", "IT", "Vệ sinh"),
)
print("\nNODES:")
for r in cur.fetchall():
    print(dict(r))
