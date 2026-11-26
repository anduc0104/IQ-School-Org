"""Clear all node memberships, then assign ONLY people listed in the Excel (Ha Dong)."""
import json
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import openpyxl
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(r"C:\Users\Admin\Desktop\IQ Diagram\.env")
HA_DONG_ID = 1
XLSX = r"C:\Users\Admin\Desktop\IQ Diagram\Phan_cong_nhan_su_4_luong_IQ.xlsx"


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFC", str(s)).strip().lower()
    return " ".join(s.split())


def split_names(text):
    if not text:
        return []
    text = re.sub(r"(?i)\b(TH|MN|P1|P2|P3|P4|P5|P2,3,4,5)\s*:\s*", " / ", str(text))
    parts = re.split(r"[/|,;]+", text)
    out = []
    for p in parts:
        p = p.strip().strip(" -–—\t")
        p = re.sub(r"^\d+\.?\s*", "", p).strip()
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
    "pháp chế": "Pháp chế",
    "kế toán": "Kế toán",
    "it": "IT",
    "bảo vệ": "Bảo vệ",
    "bảo trì": "Bảo trì",
    "vệ sinh": "Vệ sinh",
    "công đoàn": "Công đoàn",
}

MISSING_NODE_TITLES = {
    "hỗ trợ/đợi lớp": "Hỗ trợ/đợi lớp",
    "bếp": "BẾP",
    "số hoá": "Số hoá",
    "khác": "Khác",
}

STREAM_LEAD_TITLES = {
    "luồng 1": "Luồng 1",
    "luồng 2 – dịch vụ & chăm sóc học sinh": "Luồng 2",
    "luồng 3 – tuyển sinh & phát triển": "Luồng 3",
    "luồng 4 – quản trị & vận hành": "Luồng 4",
}

ALIASES = {
    "cao thị thu thuỳ": "Cao Thu Thùy",
    "cao thị thu thùy": "Cao Thu Thùy",
    "jermielyn": "Jermielyn (Kai)",
    "trần kim thiết": "Trần Thị Kim Thiết",
    "nguyễn thị vân thuý": "Nguyễn Thị Vân Thúy",
    "lê thị hòa": "Lê Thị Hoà",
    "nguyễn thị hoà": "Nguyễn Thị Hòa",
    "đỗ thị thuý": "Đỗ Thị Thúy",
    "nguyễn thị hàn ly": "Nguyễn Hàn Ly",
}

NODE_DEPT_HINTS = {
    "Tiếng việt": ["tiếng việt", "ngữ văn"],
    "Tiếng anh": ["tiếng anh"],
    "Toán": ["toán"],
    "Tiếng trung": ["tiếng trung"],
    "Năng Khiếu": ["mỹ thuật", "âm nhạc", "thể chất", "năng khiếu"],
    "GVNN": ["nước ngoài", "gvnn"],
    "CLB": ["mỹ thuật", "âm nhạc", "thể chất", "tiếng trung"],
    "Y tế": ["y tế"],
    "Kế toán": ["kế toán"],
    "IT": ["it", "số hóa", "số hoá"],
    "Đưa đón": ["mỹ thuật", "đưa đón"],
    "Pháp chế": ["pháp chế"],
    "tư vấn tuyển sinh": ["tuyển sinh"],
    "BẾP": ["bếp"],
    "Số hoá": ["số hóa", "số hoá"],
}

MINH_MY_THUAT_NODES = {
    "Năng Khiếu",
    "CLB",
    "Đưa đón",
    "Sự kiện dã ngoại",
    "Hội thảo",
}


def map_title(title_n):
    if title_n in STREAM_LEAD_TITLES:
        return STREAM_LEAD_TITLES[title_n], False
    if title_n in NODE_MAP:
        return NODE_MAP[title_n], False
    if title_n in MISSING_NODE_TITLES:
        return MISSING_NODE_TITLES[title_n], True
    for k, v in STREAM_LEAD_TITLES.items():
        if title_n.startswith(k.split("–")[0].strip()):
            return v, False
    return None, False


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
        or title_n in MISSING_NODE_TITLES
        or title_n in NODE_MAP
    ):
        mapped, _missing = map_title(title_n)
        if not mapped and title_n.startswith("luồng"):
            for k, v in STREAM_LEAD_TITLES.items():
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

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT COUNT(*) AS n FROM employee_nodes")
before = cur.fetchone()["n"]
cur.execute("DELETE FROM employee_nodes")
conn.commit()
print(f"Cleared employee_nodes (was {before})")

cur.execute("SELECT id, name FROM org_nodes")
nodes = cur.fetchall()
node_by_name = {norm(n["name"]): n for n in nodes}

cur.execute(
    """
    SELECT id, name, english_name, username, main_class, school_ids, department_names, extra
    FROM employees
    """
)
emps = cur.fetchall()
hd = [e for e in emps if HA_DONG_ID in (e.get("school_ids") or [])]
by_hd = defaultdict(list)
for e in hd:
    by_hd[norm(e["name"])].append(e)
    if e.get("english_name"):
        by_hd[norm(e["english_name"])].append(e)
by_all = defaultdict(list)
for e in emps:
    by_all[norm(e["name"])].append(e)


def dept_blob(e):
    return norm(" ".join(list(e.get("department_names") or []) + [e.get("name") or ""]))


def pick_one(node_name, cands):
    if len(cands) == 1:
        return cands[0]
    hints = NODE_DEPT_HINTS.get(node_name) or []
    if not hints:
        return None
    scored = []
    for e in cands:
        score = sum(1 for h in hints if h in dept_blob(e))
        if score:
            scored.append((score, e))
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    best = scored[0][0]
    tops = [e for s, e in scored if s == best]
    return tops[0] if len(tops) == 1 else None


def resolve(excel_name, node_name):
    n = norm(excel_name)
    if n in ALIASES:
        excel_name = ALIASES[n]
        n = norm(excel_name)
    n_strip = " ".join(re.sub(r"\(.*?\)", "", n).split())

    if n == "nguyễn thị minh" and node_name in MINH_MY_THUAT_NODES:
        art = next((e for e in hd if norm(e["name"]).startswith("nguyễn thị minh (mỹ")), None)
        if art:
            return "clear", art, "minh_my_thuat"

    if re.search(r"(?i)minh\s*89", excel_name):
        return "uncertain", [e for e in hd if "nguyễn thị minh" in norm(e["name"])], "minh_89"

    cands = list(by_hd.get(n) or by_hd.get(n_strip) or [])
    if not cands:
        for key, els in by_hd.items():
            if key.startswith(n + " ") or key.startswith(n + "("):
                cands.extend(els)
        cands = list({e["id"]: e for e in cands}.values())

    if len(cands) == 1:
        return "clear", cands[0], "exact"
    if len(cands) > 1:
        one = pick_one(node_name, cands)
        if one:
            return "clear", one, "disambiguated"
        return "uncertain", cands, "duplicate"

    fuzzy = []
    for key, els in by_hd.items():
        if len(n) >= 5 and (key.startswith(n + " ") or key.startswith(n + "(")):
            fuzzy.extend(els)
    uniq = list({e["id"]: e for e in fuzzy}.values())
    if len(uniq) == 1:
        return "clear", uniq[0], "fuzzy"
    if len(uniq) > 1:
        one = pick_one(node_name, uniq)
        if one:
            return "clear", one, "fuzzy_disambiguated"
        return "uncertain", uniq, "fuzzy_multi"

    if n in by_all or n_strip in by_all:
        return "other_school", by_all.get(n) or by_all.get(n_strip), "other_school"

    if "công ty" in n:
        return "org", [], "org"

    return "missing", [], "missing"


clear_actions = []
uncertain = []
missing_people = []
missing_nodes = []
skipped_org = []

for node_name, data in assignments.items():
    node = node_by_name.get(norm(node_name))
    if not node:
        missing_nodes.append({"node": node_name, "leads": data["leads"], "members": data["members"]})
        continue

    seen = set()
    for role, names in [("lead", data["leads"]), ("member", data["members"])]:
        for excel_name in names:
            status, match, how = resolve(excel_name, node["name"])
            primary = role == "lead"

            if status == "clear":
                if match["id"] in seen:
                    if primary:
                        clear_actions.append(
                            (node["id"], node["name"], match["id"], match["name"], True, excel_name, how)
                        )
                    continue
                seen.add(match["id"])
                clear_actions.append(
                    (node["id"], node["name"], match["id"], match["name"], primary, excel_name, how)
                )
            elif status in ("uncertain", "other_school"):
                uncertain.append(
                    {
                        "reason": how,
                        "excel_name": excel_name,
                        "role": role,
                        "node": node["name"],
                        "candidates": [
                            {
                                "id": str(e["id"]),
                                "name": e["name"],
                                "schools": e.get("school_ids"),
                                "depts": e.get("department_names"),
                                "username": e.get("username"),
                                "main_class": e.get("main_class"),
                            }
                            for e in (match or [])
                        ],
                    }
                )
            elif status == "org":
                skipped_org.append({"excel_name": excel_name, "node": node["name"], "role": role})
            else:
                missing_people.append({"excel_name": excel_name, "role": role, "node": node["name"]})

# Deduplicate actions by (node, emp) keeping primary=True if any
final = {}
for node_id, node_name, emp_id, emp_name, primary, excel_name, how in clear_actions:
    key = (str(node_id), str(emp_id))
    prev = final.get(key)
    if not prev or (primary and not prev[4]):
        final[key] = (node_id, node_name, emp_id, emp_name, primary, excel_name, how)

print(f"Inserting {len(final)} memberships...")
for node_id, node_name, emp_id, emp_name, primary, excel_name, how in final.values():
    cur.execute(
        """
        INSERT INTO employee_nodes (employee_id, node_id, is_primary)
        VALUES (%s, %s, %s)
        ON CONFLICT (employee_id, node_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
        """,
        (emp_id, node_id, primary),
    )
conn.commit()

cur.execute(
    """
    SELECT n.name, COUNT(*)::int AS c
    FROM employee_nodes en
    JOIN org_nodes n ON n.id = en.node_id
    GROUP BY n.name
    ORDER BY n.name
    """
)
print("\n=== MEMBER COUNTS ===")
total = 0
for row in cur.fetchall():
    print(f"  {row['name']}: {row['c']}")
    total += row["c"]
print(f"Total: {total}")

by_node = defaultdict(list)
for node_id, node_name, emp_id, emp_name, primary, excel_name, how in final.values():
    by_node[node_name].append((emp_name, primary, excel_name, how))

print("\n=== APPLIED ===")
for nn in sorted(by_node):
    print(f"\n{nn}")
    for emp_name, primary, excel_name, how in by_node[nn]:
        tag = "LEAD" if primary else "mem"
        alias = f" ← {excel_name}" if norm(excel_name) != norm(emp_name) else ""
        print(f"  [{tag}] {emp_name}{alias} ({how})")

result = {
    "applied": len(final),
    "uncertain": uncertain,
    "missing_people": missing_people,
    "missing_nodes": missing_nodes,
    "skipped_org": skipped_org,
    "by_node": {
        k: [{"name": n, "primary": p, "excel": x, "how": h} for n, p, x, h in v]
        for k, v in by_node.items()
    },
}
out = Path(r"C:\Users\Admin\Desktop\IQ Diagram\scripts\_tmp_excel_only_result.json")
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print("\n=== UNCERTAIN ===")
print(json.dumps(uncertain, ensure_ascii=False, indent=2))
print("\n=== MISSING PEOPLE ===")
print(json.dumps(missing_people, ensure_ascii=False, indent=2))
print("\n=== MISSING NODES ===")
print(json.dumps(missing_nodes, ensure_ascii=False, indent=2))
print("\n=== ORG SKIPPED ===")
print(json.dumps(skipped_org, ensure_ascii=False, indent=2))

cur.close()
conn.close()
print("Wrote", out)
