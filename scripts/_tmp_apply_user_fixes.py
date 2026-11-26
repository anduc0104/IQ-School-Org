"""Create missing vệ sinh staff + Luồng 4 nodes (Bếp/Khác/Hỗ trợ), assign Excel people. Skip duplicate-name cases."""
import os
import unicodedata

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
HA_DONG = 1

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def norm(s):
    return " ".join(unicodedata.normalize("NFC", str(s or "")).strip().lower().split())


def find_emp(name):
    cur.execute("SELECT * FROM employees")
    hits = [e for e in cur.fetchall() if norm(e["name"]) == norm(name)]
    return hits


def ensure_emp(name, *, department_names=None, school_ids=None, notes=None):
    hits = find_emp(name)
    if hits:
        emp = hits[0]
        # ensure Ha Dong school tag if creating context needs it
        schools = list(emp.get("school_ids") or [])
        if school_ids:
            for s in school_ids:
                if s not in schools:
                    schools.append(s)
            cur.execute(
                "UPDATE employees SET school_ids=%s, department_names=COALESCE(NULLIF(department_names,'{}'), %s), updated_at=NOW() WHERE id=%s RETURNING *",
                (schools, department_names or emp.get("department_names") or [], emp["id"]),
            )
            return cur.fetchone(), False
        return emp, False

    cur.execute(
        """
        INSERT INTO employees (name, school_ids, department_names, extra)
        VALUES (%s, %s, %s, %s::jsonb)
        RETURNING *
        """,
        (
            name,
            school_ids or [HA_DONG],
            department_names or [],
            psycopg2.extras.Json({"manual": True, "note": notes or "Thêm tay từ Excel phân công Hà Đông"}),
        ),
    )
    return cur.fetchone(), True


def ensure_node(name, parent_id, color, level, sort_order):
    cur.execute(
        "SELECT * FROM org_nodes WHERE parent_id IS NOT DISTINCT FROM %s AND lower(name)=lower(%s)",
        (parent_id, name),
    )
    row = cur.fetchone()
    if row:
        return row, False
    cur.execute(
        """
        INSERT INTO org_nodes (parent_id, name, color, level, sort_order, node_type)
        VALUES (%s,%s,%s,%s,%s,'department')
        RETURNING *
        """,
        (parent_id, name, color, level, sort_order),
    )
    return cur.fetchone(), True


def link(emp_id, node_id, primary=False):
    cur.execute(
        """
        INSERT INTO employee_nodes (employee_id, node_id, is_primary)
        VALUES (%s,%s,%s)
        ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
        """,
        (emp_id, node_id, primary),
    )


cur.execute("SELECT * FROM org_nodes WHERE name='Luồng 4'")
luong4 = cur.fetchone()
assert luong4, "Luồng 4 missing"
color = luong4["color"]
level = luong4["level"] + 1

cur.execute(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM org_nodes WHERE parent_id=%s",
    (luong4["id"],),
)
next_sort = cur.fetchone()["m"] + 1

created_nodes = []
for name in ["Bếp", "Hỗ trợ/đợi lớp", "Khác"]:
    node, created = ensure_node(name, luong4["id"], color, level, next_sort)
    if created:
        next_sort += 1
        created_nodes.append(name)
    print(("CREATED" if created else "EXISTS"), "node", node["name"], node["id"])

# lookup nodes
cur.execute("SELECT id, name FROM org_nodes")
nodes = {norm(n["name"]): n for n in cur.fetchall()}

# --- Vệ sinh staff (manual create) ---
vesinh_people = [
    ("Trần Thị Hồng", True),
    ("Bùi Thị Xuyên", False),
    ("Trần Thị Hà", False),
    ("Nguyễn Thị Ngân", False),
]
vesinh_node = nodes[norm("Vệ sinh")]
for name, primary in vesinh_people:
    emp, created = ensure_emp(name, department_names=["Vệ sinh"], school_ids=[HA_DONG])
    link(emp["id"], vesinh_node["id"], primary)
    print(("CREATED" if created else "EXISTS"), "vesinh", emp["name"], "-> Vệ sinh", "LEAD" if primary else "")

# --- IT = Số hoá ---
it_node = nodes[norm("IT")]
# keep/ensure Lê Ngọc Vân as lead
van_hits = find_emp("Lê Ngọc Vân")
if van_hits:
    link(van_hits[0]["id"], it_node["id"], True)
    print("IT lead Lê Ngọc Vân")

sohoa = [
    ("Bùi Công Huy", False),
    ("Bùi Công Đạt", False),
    ("Lê Đức Ân", False),
    ("Đỗ Dũng Quang Minh", False),  # Excel: Nguyễn Dũng Quang Minh → đối chiếu Đỗ...
]
for name, primary in sohoa:
    hits = find_emp(name)
    if not hits:
        print("MISSING IT person", name)
        continue
    link(hits[0]["id"], it_node["id"], primary)
    print("IT member", hits[0]["name"])

# --- Bếp ---
bep_node = nodes[norm("Bếp")]
bep_assign = [
    ("Mai Văn Hợp", True),
    ("Nguyễn Văn Hậu", False),
    ("Nguyễn Bích Liên", False),
    # Nguyễn Thị Thanh — trùng tên, bỏ qua theo yêu cầu
    ("Nguyễn Thị Hường", False),
    ("Nguyễn Hà Phương", False),
]
for name, primary in bep_assign:
    hits = find_emp(name)
    if not hits:
        emp, created = ensure_emp(name, department_names=["Bếp"], school_ids=[HA_DONG])
        print(("CREATED" if created else "EXISTS"), "bep emp", emp["name"])
    else:
        emp = hits[0]
        # if multiple, skip (user handles duplicates)
        if len(hits) > 1:
            print("SKIP duplicate", name, "for Bếp")
            continue
        print("EXISTS bep", emp["name"])
    link(emp["id"], bep_node["id"], primary)

# --- Khác ---
khac_node = nodes[norm("Khác")]
for name in ["Đỗ Thị Thúy", "Nguyễn Yến Nhi"]:
    hits = find_emp(name)
    if not hits:
        emp, _ = ensure_emp(name, school_ids=[HA_DONG])
    elif len(hits) > 1:
        print("SKIP duplicate", name, "for Khác")
        continue
    else:
        emp = hits[0]
    link(emp["id"], khac_node["id"], False)
    print("Khác", emp["name"])

# --- Hỗ trợ/đợi lớp ---
hotro_node = nodes[norm("Hỗ trợ/đợi lớp")]
hotro = [
    ("Bùi Thị Duyên", False),
    ("Trần Thị Kim Thiết", False),
    # Nguyễn Thị Minh 89 — trùng/không chắc, bỏ qua
]
for name, primary in hotro:
    hits = find_emp(name)
    if not hits:
        print("MISSING hotro", name)
        continue
    if len(hits) > 1:
        print("SKIP duplicate", name, "for Hỗ trợ")
        continue
    link(hits[0]["id"], hotro_node["id"], primary)
    print("Hỗ trợ", hits[0]["name"])

conn.commit()

# summary
print("\n=== SUMMARY COUNTS ===")
cur.execute(
    """
    SELECT n.name, COUNT(*)::int AS c,
      COALESCE(string_agg(e.name, ', ' ORDER BY en.is_primary DESC, e.name), '') AS people
    FROM org_nodes n
    LEFT JOIN employee_nodes en ON en.node_id = n.id
    LEFT JOIN employees e ON e.id = en.employee_id
    WHERE n.name IN ('Vệ sinh','IT','Bếp','Khác','Hỗ trợ/đợi lớp')
    GROUP BY n.name
    ORDER BY n.name
    """
)
for r in cur.fetchall():
    print(f"{r['name']}: {r['c']} — {r['people']}")

cur.close()
conn.close()
print("Done. Created nodes:", created_nodes)
