"""
Full resync from Excel (Ha Dong) + user-confirmed duplicate resolutions.
Clears employee_nodes, then assigns only Excel people.
"""
import os
import re
import unicodedata
from collections import defaultdict

import openpyxl
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
HA_DONG = 1
XLSX = r"C:\Users\Admin\Desktop\IQ Diagram\Phan_cong_nhan_su_4_luong_IQ.xlsx"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def norm(s):
    return " ".join(unicodedata.normalize("NFC", str(s or "")).strip().lower().split())


def split_names(text):
    if not text:
        return []
    text = re.sub(r"(?i)\b(TH|MN|P1|P2|P3|P4|P5|P2,3,4,5)\s*:\s*", " / ", str(text))
    out = []
    for p in re.split(r"[/|,;]+", text):
        p = re.sub(r"^\d+\.?\s*", "", p.strip().strip(" -–—\t")).strip()
        if p:
            out.append(p)
    return out


def dedupe(xs):
    seen, out = set(), []
    for x in xs:
        k = norm(x)
        if k in seen:
            continue
        seen.add(k)
        out.append(x)
    return out


def link(emp_id, node_id, primary=False):
    cur.execute(
        """
        INSERT INTO employee_nodes (employee_id, node_id, is_primary)
        VALUES (%s,%s,%s)
        ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
        """,
        (emp_id, node_id, primary),
    )


def emp_source(sid):
    cur.execute("SELECT * FROM employees WHERE source_id=%s", (sid,))
    e = cur.fetchone()
    if not e:
        raise SystemExit(f"missing source_id={sid}")
    return e


def emp_name(name):
    cur.execute("SELECT * FROM employees WHERE lower(name)=lower(%s)", (name,))
    rows = cur.fetchall()
    return rows


def ensure_emp(name, department_names=None):
    rows = emp_name(name)
    if rows:
        return rows[0], False
    cur.execute(
        """
        INSERT INTO employees (name, school_ids, department_names, extra)
        VALUES (%s, %s, %s, %s::jsonb) RETURNING *
        """,
        (
            name,
            [HA_DONG],
            department_names or [],
            psycopg2.extras.Json({"manual": True, "note": "Thêm tay từ Excel Hà Đông"}),
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
        return row
    cur.execute(
        """
        INSERT INTO org_nodes (parent_id, name, color, level, sort_order, node_type)
        VALUES (%s,%s,%s,%s,%s,'department') RETURNING *
        """,
        (parent_id, name, color, level, sort_order),
    )
    return cur.fetchone()


NODE_MAP = {
    "hđqt (hội đồng quản trị)": "HĐQT",
    "hội đồng trường": "Hội đồng trường",
    "ceo": "CEO",
    "luồng 1": "Luồng 1",
    "tiếng việt": "Tiếng việt",
    "tiếng anh": "Tiếng anh",
    "toán": "Toán",
    "tiếng trung": "Tiếng trung",
    "năng khiếu": "Năng Khiếu",
    "gvnn (giáo viên nước ngoài)": "GVNN",
    "học sinh": "Học sinh",
    "clb (câu lạc bộ)": "CLB",
    "đưa đón": "Đưa đón",
    "trông muộn": "Trông muộn",
    "sự kiện dã ngoại": "Sự kiện dã ngoại",
    "dự án": "Dự án",
    "y tế": "Y tế",
    "quan hệ khách hàng": "Quan hệ khách hàng",
    "tư vấn tuyển sinh": "tư vấn tuyển sinh",
    "marketing": "Marketing",
    "content": "Content",
    "hội thảo": "Hội thảo",
    "quản lý ctv": "Quản lý CTV",
    "luồng 4 – quản trị & vận hành": "Luồng 4",
    "pháp chế": "Pháp chế",
    "kế toán": "Kế toán",
    "it": "IT",
    "bảo vệ": "Bảo vệ",
    "bảo trì": "Bảo trì",
    "vệ sinh": "Vệ sinh",
    "công đoàn": "Công đoàn",
    "bếp": "Bếp",
    "số hoá": "IT",  # Số hoá = IT
    "hỗ trợ/đợi lớp": "Hỗ trợ/đợi lớp",
    "khác": "Khác",
}

STREAM_LEAD = {
    "luồng 1": "Luồng 1",
    "luồng 2 – dịch vụ & chăm sóc học sinh": "Luồng 2",
    "luồng 3 – tuyển sinh & phát triển": "Luồng 3",
    "luồng 4 – quản trị & vận hành": "Luồng 4",
}

ALIASES = {
    "cao thị thu thuỳ": "Cao Thu Thùy",
    "jermielyn": "Jermielyn (Kai)",
    "trần kim thiết": "Trần Thị Kim Thiết",
    "nguyễn thị vân thuý": "Nguyễn Thị Vân Thúy",
    "lê thị hòa": "Lê Thị Hoà",
    "nguyễn thị hoà": "Nguyễn Thị Hòa",
    "đỗ thị thuý": "Đỗ Thị Thúy",
    "nguyễn thị hàn ly": "Nguyễn Hàn Ly",
    "nguyễn dũng quang minh": "Đỗ Dũng Quang Minh",
}

# Explicit resolutions (excel_name + node) -> source_id or special
# None means skip org labels
RESOLVED = {
    ("nguyễn thị thanh", "Y tế"): 358,
    ("nguyễn thị thanh", "Trông muộn"): 358,
    ("nguyễn thị thanh", "Đưa đón"): 358,
    ("nguyễn thị thanh", "Bếp"): 141,
    ("nguyễn thị minh 89", "Đưa đón"): 124,
    ("nguyễn thị minh 89", "Hỗ trợ/đợi lớp"): 124,
    ("nguyễn thị minh", "Đưa đón"): 124,  # phụ trách đưa đón
    ("nguyễn thị minh", "Hỗ trợ/đợi lớp"): 124,
    ("nguyễn thị minh", "Năng Khiếu"): 92,  # Mỹ thuật
    ("nguyễn thị minh", "CLB"): 92,
    ("nguyễn thị minh", "Sự kiện dã ngoại"): 92,
    ("nguyễn thị minh", "Hội thảo"): 92,
    ("lương thị sâm", "Trông muộn"): 109,
    ("lê thị hồng nguyệt", "Hội đồng trường"): 122,
    ("lê thị hồng nguyệt", "Công đoàn"): 122,
    ("nguyễn thị phương", "Tiếng anh"): 47,  # Lucy
    ("nguyễn thị phương", "Tiếng việt"): "BOTH_TV_PHUONG",  # 232 + 363
    ("nguyễn thùy linh", "Tiếng anh"): 302,  # 2N1
    ("nguyễn thùy linh", "Tiếng việt"): 233,  # 2A3
    ("nguyễn thuỳ linh", "Tiếng anh"): 302,
    ("nguyễn thuỳ linh", "Tiếng việt"): 233,
}

# 1) Ensure Luồng 4 extra nodes
cur.execute("SELECT * FROM org_nodes WHERE name='Luồng 4'")
luong4 = cur.fetchone()
cur.execute(
    "SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM org_nodes WHERE parent_id=%s",
    (luong4["id"],),
)
sort_n = cur.fetchone()["n"]
for nm in ["Bếp", "Hỗ trợ/đợi lớp", "Khác"]:
    ensure_node(nm, luong4["id"], luong4["color"], luong4["level"] + 1, sort_n)
    sort_n += 1

# 2) Ensure vệ sinh staff exist
for name in ["Trần Thị Hồng", "Bùi Thị Xuyên", "Trần Thị Hà", "Nguyễn Thị Ngân"]:
    ensure_emp(name, ["Vệ sinh"])

# 3) Parse excel
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(min_row=4, max_row=47, max_col=4, values_only=True))
assignments = defaultdict(lambda: {"leads": [], "members": []})
current = None

for stt, title, lead, note in rows:
    title_n = norm(title) if title else ""
    if title and (
        stt
        or title_n.startswith("luồng")
        or title_n in NODE_MAP
        or title_n in STREAM_LEAD
    ):
        mapped = STREAM_LEAD.get(title_n) or NODE_MAP.get(title_n)
        if not mapped and title_n.startswith("luồng"):
            for k, v in STREAM_LEAD.items():
                if title_n.startswith(k[:8]):
                    mapped = v
                    break
        if mapped:
            current = mapped
            if mapped == "CLB":
                if note:
                    assignments[current]["members"].extend(split_names(note))
            else:
                if lead:
                    assignments[current]["leads"].extend(split_names(lead))
                if note:
                    assignments[current]["members"].extend(split_names(note))
            continue
        current = None
        continue
    if current and (lead or note):
        if current == "CLB":
            if note:
                assignments[current]["members"].extend(split_names(note))
        elif current in ("Tiếng việt", "Tiếng anh") and lead:
            assignments[current]["leads"].extend(split_names(lead))
            if note:
                assignments[current]["members"].extend(split_names(note))
        else:
            if lead:
                assignments[current]["members"].extend(split_names(lead))
            if note:
                assignments[current]["members"].extend(split_names(note))

for k in assignments:
    assignments[k]["leads"] = dedupe(assignments[k]["leads"])
    assignments[k]["members"] = dedupe(assignments[k]["members"])

# 4) Clear all memberships
cur.execute("DELETE FROM employee_nodes")
print("Cleared employee_nodes")

# 5) Index employees
cur.execute("SELECT * FROM employees")
emps = cur.fetchall()
by_source = {e["source_id"]: e for e in emps if e.get("source_id") is not None}
by_hd = defaultdict(list)
by_all = defaultdict(list)
for e in emps:
    by_all[norm(e["name"])].append(e)
    if HA_DONG in (e.get("school_ids") or []) or e.get("source_id") in (109, 122):
        # include Hoàng Mai people we explicitly allow
        by_hd[norm(e["name"])].append(e)
    if e.get("english_name"):
        by_all[norm(e["english_name"])].append(e)

cur.execute("SELECT id, name FROM org_nodes")
nodes = {norm(n["name"]): n for n in cur.fetchall()}

NODE_HINTS = {
    "Tiếng việt": ["tiếng việt"],
    "Tiếng anh": ["tiếng anh"],
    "Toán": ["toán"],
    "Tiếng trung": ["tiếng trung"],
    "Năng Khiếu": ["mỹ thuật", "âm nhạc", "thể chất", "năng khiếu"],
    "Y tế": ["y tế"],
    "Kế toán": ["kế toán"],
    "IT": ["it", "số hóa", "số hoá"],
    "Bếp": ["bếp"],
}


def pick_one(node_name, cands):
    if len(cands) == 1:
        return cands[0]
    hints = NODE_HINTS.get(node_name) or []
    scored = []
    for e in cands:
        blob = norm(" ".join(list(e.get("department_names") or []) + [e.get("name") or ""]))
        score = sum(1 for h in hints if h in blob)
        if score:
            scored.append((score, e))
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    best = scored[0][0]
    tops = [e for s, e in scored if s == best]
    return tops[0] if len(tops) == 1 else None


def resolve_emps(excel_name, node_name):
    key = (norm(excel_name), node_name)
    # minh 89 normalize
    if re.search(r"(?i)minh\s*89", excel_name):
        key = ("nguyễn thị minh 89", node_name)

    if key in RESOLVED:
        val = RESOLVED[key]
        if val == "BOTH_TV_PHUONG":
            return [by_source[232], by_source[363]], "resolved_both"
        return [by_source[val]], "resolved"

    if "công ty" in norm(excel_name):
        return [], "org"

    n = norm(excel_name)
    if n in ALIASES:
        n = norm(ALIASES[n])
        excel_name = ALIASES[norm(excel_name)] if norm(excel_name) in ALIASES else excel_name

    # Prefer HD; allow known HM people via RESOLVED only
    cands = list(by_hd.get(n) or [])
    if not cands:
        for kn, els in by_hd.items():
            if kn.startswith(n + " ") or kn.startswith(n + "("):
                cands.extend(els)
        cands = list({e["id"]: e for e in cands}.values())

    if len(cands) == 1:
        return cands, "exact"
    if len(cands) > 1:
        one = pick_one(node_name, cands)
        if one:
            return [one], "hint"
        return cands, "dup_unresolved"

    # fuzzy extend
    fuzzy = []
    for kn, els in by_hd.items():
        if len(n) >= 5 and (kn.startswith(n + " ") or kn.startswith(n + "(")):
            fuzzy.extend(els)
    uniq = list({e["id"]: e for e in fuzzy}.values())
    if len(uniq) == 1:
        return uniq, "fuzzy"
    if len(uniq) > 1:
        one = pick_one(node_name, uniq)
        if one:
            return [one], "fuzzy_hint"
        return uniq, "dup_unresolved"

    # other school only if unique and not already handled
    if n in by_all and len(by_all[n]) == 1:
        return [], "other_school_skip"
    return [], "missing"


applied = 0
skipped = []
for node_name, data in assignments.items():
    node = nodes.get(norm(node_name))
    if not node:
        skipped.append(("missing_node", node_name, data))
        continue
    seen = set()
    for role, names in [("lead", data["leads"]), ("member", data["members"])]:
        for excel_name in names:
            emps_res, how = resolve_emps(excel_name, node["name"])
            if how in ("org", "missing", "other_school_skip", "dup_unresolved"):
                skipped.append((how, node["name"], excel_name, [{"id": str(e["id"]), "name": e["name"], "source": e.get("source_id")} for e in emps_res]))
                continue
            for e in emps_res:
                primary = role == "lead"
                # Đưa đón lead is Minh 124
                if node["name"] == "Đưa đón" and e.get("source_id") == 124:
                    primary = True
                if node["name"] == "Công đoàn" and e.get("source_id") == 122:
                    primary = True
                if e["id"] in seen and not primary:
                    continue
                seen.add(e["id"])
                link(e["id"], node["id"], primary)
                applied += 1

conn.commit()

# summary
cur.execute(
    """
    SELECT n.name, COUNT(*)::int AS c
    FROM employee_nodes en JOIN org_nodes n ON n.id=en.node_id
    GROUP BY n.name ORDER BY n.name
    """
)
print(f"\nApplied link ops~{applied}")
print("=== COUNTS ===")
total = 0
for r in cur.fetchall():
    print(f"  {r['name']}: {r['c']}")
    total += r["c"]
print("Total memberships:", total)

print("\n=== SKIPPED ===")
for item in skipped:
    print(item)

# verify key people
print("\n=== KEY PEOPLE ===")
for sid, label in [
    (358, "Thanh Y tế"),
    (141, "Thanh Bếp"),
    (124, "Minh 124"),
    (92, "Minh Mỹ thuật"),
    (109, "Sâm"),
    (122, "Hồng Nguyệt"),
    (47, "Phương Lucy"),
    (232, "Phương 232"),
    (363, "Phương 363"),
    (302, "Linh 2N1"),
    (233, "Linh 2A3"),
]:
    cur.execute(
        """
        SELECT n.name, en.is_primary FROM employee_nodes en
        JOIN org_nodes n ON n.id=en.node_id
        JOIN employees e ON e.id=en.employee_id
        WHERE e.source_id=%s ORDER BY n.name
        """,
        (sid,),
    )
    print(label, [(r["name"], "L" if r["is_primary"] else "m") for r in cur.fetchall()])

cur.close()
conn.close()
print("Done")
