"""Apply user resolutions for duplicate-name cases."""
import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def node(name):
    cur.execute("SELECT id, name FROM org_nodes WHERE name=%s", (name,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"missing node {name}")
    return row


def emp_by_source(source_id):
    cur.execute("SELECT * FROM employees WHERE source_id=%s", (source_id,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"missing employee source_id={source_id}")
    return row


def link(emp_id, node_id, primary=False):
    cur.execute(
        """
        INSERT INTO employee_nodes (employee_id, node_id, is_primary)
        VALUES (%s,%s,%s)
        ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
        """,
        (emp_id, node_id, primary),
    )


def unlink(emp_id, node_id):
    cur.execute(
        "DELETE FROM employee_nodes WHERE employee_id=%s AND node_id=%s",
        (emp_id, node_id),
    )


nodes = {
    n: node(n)
    for n in [
        "Y tế",
        "Trông muộn",
        "Đưa đón",
        "Bếp",
        "Hỗ trợ/đợi lớp",
        "Hội đồng trường",
        "Công đoàn",
        "Tiếng anh",
        "Tiếng việt",
    ]
}

# --- Nguyễn Thị Thanh ---
thanh_yte = emp_by_source(358)  # Y Tế
thanh_bep = emp_by_source(141)  # Bếp
link(thanh_yte["id"], nodes["Y tế"]["id"], False)
link(thanh_yte["id"], nodes["Trông muộn"]["id"], False)
link(thanh_yte["id"], nodes["Đưa đón"]["id"], False)
link(thanh_bep["id"], nodes["Bếp"]["id"], False)
print(f"Thanh Y tế → Y tế, Trông muộn, Đưa đón ({thanh_yte['id']})")
print(f"Thanh Bếp → Bếp ({thanh_bep['id']})")

# --- Nguyễn Thị Minh source 124 ---
minh = emp_by_source(124)
minh_art = emp_by_source(92)  # Mỹ thuật — bỏ khỏi Đưa đón nếu đang là lead/member do nhầm
unlink(minh_art["id"], nodes["Đưa đón"]["id"])
link(minh["id"], nodes["Đưa đón"]["id"], True)  # phụ trách đưa đón
link(minh["id"], nodes["Hỗ trợ/đợi lớp"]["id"], False)
print(f"Minh source 124 → Đưa đón (LEAD) + Hỗ trợ/đợi lớp; removed Mỹ thuật from Đưa đón")

# --- Lương Thị Sâm → Trông muộn ---
sam = emp_by_source(109)
link(sam["id"], nodes["Trông muộn"]["id"], False)
print(f"Lương Thị Sâm → Trông muộn ({sam['id']})")

# --- Lê Thị Hồng Nguyệt → HĐ trường + Công đoàn ---
nguyet = emp_by_source(122)
link(nguyet["id"], nodes["Hội đồng trường"]["id"], False)
link(nguyet["id"], nodes["Công đoàn"]["id"], True)
print(f"Lê Thị Hồng Nguyệt → Hội đồng trường + Công đoàn LEAD ({nguyet['id']})")

# --- Nguyễn Thị Phương ---
# Lucy (english_name) source 47 → Tiếng anh
# Remaining HD exact name TV teachers → Tiếng việt
phuong_lucy = emp_by_source(47)
link(phuong_lucy["id"], nodes["Tiếng anh"]["id"], False)
# ensure Lucy not wrongly only elsewhere; OK
print(f"Phương Lucy → Tiếng anh ({phuong_lucy['name']} en={phuong_lucy['english_name']})")

for sid in (232, 363):
    p = emp_by_source(sid)
    link(p["id"], nodes["Tiếng việt"]["id"], False)
    # remove from Tiếng anh if somehow linked
    unlink(p["id"], nodes["Tiếng anh"]["id"])
    print(f"Phương TV source {sid} → Tiếng việt ({p['id']} main={p['main_class']})")

# --- Nguyễn Thùy Linh ---
linh_en = emp_by_source(302)  # 2N1 → Tiếng anh
linh_tv = emp_by_source(233)  # 2A3 TV → Tiếng việt
link(linh_en["id"], nodes["Tiếng anh"]["id"], False)
unlink(linh_en["id"], nodes["Tiếng việt"]["id"])
link(linh_tv["id"], nodes["Tiếng việt"]["id"], False)
unlink(linh_tv["id"], nodes["Tiếng anh"]["id"])
print(f"Thùy Linh 2N1 → Tiếng anh ({linh_en['id']})")
print(f"Thùy Linh 2A3 → Tiếng việt ({linh_tv['id']})")

conn.commit()

# verify
print("\n=== VERIFY ===")
checks = [
    (thanh_yte["id"], "Thanh Y tế"),
    (thanh_bep["id"], "Thanh Bếp"),
    (minh["id"], "Minh 124"),
    (minh_art["id"], "Minh Mỹ thuật"),
    (sam["id"], "Sâm"),
    (nguyet["id"], "Hồng Nguyệt"),
    (phuong_lucy["id"], "Phương Lucy"),
    (emp_by_source(232)["id"], "Phương 232"),
    (emp_by_source(363)["id"], "Phương 363"),
    (linh_en["id"], "Linh 2N1"),
    (linh_tv["id"], "Linh 2A3"),
]
for emp_id, label in checks:
    cur.execute(
        """
        SELECT n.name, en.is_primary
        FROM employee_nodes en
        JOIN org_nodes n ON n.id = en.node_id
        WHERE en.employee_id=%s
        ORDER BY n.name
        """,
        (emp_id,),
    )
    rows = cur.fetchall()
    print(f"{label}: {[(r['name'], 'LEAD' if r['is_primary'] else 'mem') for r in rows]}")

cur.close()
conn.close()
print("Done")
