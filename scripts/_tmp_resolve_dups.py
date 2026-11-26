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


cur.execute(
    """
    SELECT id, source_id, name, english_name, username, main_class, school_ids, department_names, extra
    FROM employees
    WHERE name ILIKE %s OR name ILIKE %s OR name ILIKE %s OR name ILIKE %s
       OR name ILIKE %s OR name ILIKE %s OR english_name ILIKE %s
    ORDER BY name, source_id NULLS LAST
    """,
    (
        "%Nguyễn Thị Thanh%",
        "%Nguyễn Thị Minh%",
        "%Lương Thị Sâm%",
        "%Lê Thị Hồng Nguyệt%",
        "%Nguyễn Thị Phương%",
        "%Nguyễn Th%Linh%",
        "%Lucy%",
    ),
)
for e in cur.fetchall():
    print(
        f"source={e['source_id']} id={e['id']} | {e['name']!r} en={e['english_name']!r} "
        f"user={e['username']} main={e['main_class']} schools={e['school_ids']} "
        f"depts={e['department_names']} extra={e['extra']}"
    )

cur.execute("SELECT id, name FROM org_nodes WHERE name IN ('Y tế','Trông muộn','Đưa đón','Bếp','Hỗ trợ/đợi lớp','Hội đồng trường','Công đoàn','Tiếng anh','Tiếng việt')")
print("\nNODES")
for n in cur.fetchall():
    print(dict(n))
