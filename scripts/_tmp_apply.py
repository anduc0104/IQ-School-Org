"""Match Excel Ha Dong assignments → org nodes, apply clear matches, report uncertain."""
import json
import re
import urllib.request
import unicodedata
from collections import defaultdict

import openpyxl

API = "http://localhost:5050"
HA_DONG_ID = 1
XLSX = r"C:\Users\Admin\Desktop\IQ Diagram\Phan_cong_nhan_su_4_luong_IQ.xlsx"


def get(path):
    return json.load(urllib.request.urlopen(API + path))


def post(path, body):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFC", str(s)).strip().lower()
    return " ".join(s.split())


def split_names(text):
    if not text:
        return []
    text = str(text)
    text = re.sub(r"(?i)\b(TH|MN|P1|P2|P3|P4|P5|P2,3,4,5)\s*:\s*", " / ", text)
    parts = re.split(r"[/|,;]+", text)
    names = []
    for p in parts:
        p = p.strip().strip(" -–—\t")
        p = re.sub(r"^\d+\.?\s*", "", p).strip()
        if p:
            names.append(p)
    return names


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

# Manual aliases Excel → DB name (Ha Đông)
ALIASES = {
    "cao thị thu thuỳ": "Cao Thu Thùy",
    "cao thị thu thùy": "Cao Thu Thùy",
    "jermielyn": "Jermielyn (Kai)",
    "trần kim thiết": "Trần Thị Kim Thiết",
    "trần thị kim thiết": "Trần Thị Kim Thiết",
    "nguyễn thị vân thuý": "Nguyễn Thị Vân Thúy",
    "nguyễn thị vân thúy": "Nguyễn Thị Vân Thúy",
    "lê thị hòa": "Lê Thị Hoà",
    "lê thị hoà": "Lê Thị Hoà",
    "nguyễn thị hoà": "Nguyễn Thị Hòa",
    "nguyễn thị hòa": "Nguyễn Thị Hòa",
    "đỗ thị thuý": "Đỗ Thị Thúy",
    "đỗ thị thúy": "Đỗ Thị Thúy",
    "nguyễn thị hàn ly": "Nguyễn Hàn Ly",
    "nguyễn hàn ly": "Nguyễn Hàn Ly",
}

# Khi trùng tên: ưu tiên theo dept/keyword gắn với node
NODE_DEPT_HINTS = {
    "Tiếng việt": ["tiếng việt", "ngữ văn"],
    "Tiếng anh": ["tiếng anh"],
    "Toán": ["toán"],
    "Tiếng trung": ["tiếng trung"],
    "Năng Khiếu": ["mỹ thuật", "âm nhạc", "thể chất", "năng khiếu", "tin học"],
    "GVNN": ["nước ngoài", "gvnn"],
    "CLB": ["mỹ thuật", "âm nhạc", "thể chất", "tiếng trung"],
    "Y tế": ["y tế"],
    "Kế toán": ["kế toán"],
    "IT": ["it", "số hóa", "số hoá"],
    "BẾP": ["bếp"],
    "Số hoá": ["số hóa", "số hoá"],
    "Đưa đón": ["đưa đón", "mỹ thuật"],
    "Trông muộn": [],
    "Pháp chế": ["pháp chế"],
    "Marketing": ["marketing"],
    "Content": [],
    "tư vấn tuyển sinh": ["tuyển sinh"],
}


def map_title(title_n):
    if title_n in STREAM_LEAD_TITLES:
        return STREAM_LEAD_TITLES[title_n], False
    if title_n in NODE_MAP:
        return NODE_MAP[title_n], False
    if title_n in MISSING_NODE_TITLES:
        return MISSING_NODE_TITLES[title_n], True
    # exact-ish: startswith stream
    for k, v in STREAM_LEAD_TITLES.items():
        if title_n.startswith(k.split("–")[0].strip()):
            return v, False
    return None, False


wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(min_row=4, max_row=47, max_col=4, values_only=True))

assignments = defaultdict(lambda: {"leads": [], "members": []})
current = None
is_missing_node = False

for stt, title, lead, note in rows:
    title_n = norm(title) if title else ""

    if title and (stt or title_n.startswith("luồng") or title_n in MISSING_NODE_TITLES or title_n in NODE_MAP):
        mapped, missing = map_title(title_n)
        if not mapped and title_n.startswith("luồng"):
            # looser stream
            for k, v in STREAM_LEAD_TITLES.items():
                if title_n.startswith(k[:8]):
                    mapped, missing = v, False
                    break
        if mapped:
            current = mapped
            is_missing_node = missing
            # CLB: first row C is club type not person
            if mapped == "CLB":
                if note:
                    assignments[current]["members"].extend(split_names(note))
            else:
                if lead:
                    assignments[current]["leads"].extend(split_names(lead))
                if note:
                    assignments[current]["members"].extend(split_names(note))
            continue
        if title_n in ("cấp quản lý",):
            current = None
            continue
        print("UNMAPPED", title)
        current = None
        continue

    # continuation row
    if current and (lead or note):
        if current == "CLB":
            # C = club name, D = people
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

# cleanup
for k in list(assignments.keys()):
    assignments[k]["leads"] = dedupe(assignments[k]["leads"])
    assignments[k]["members"] = dedupe(assignments[k]["members"])
    # remove leads duplicated in members list? keep both roles — lead flagged primary

nodes = get("/api/nodes")["flat"]
node_by_name = {norm(n["name"]): n for n in nodes}
emps = get("/api/employees")
hd = [e for e in emps if HA_DONG_ID in (e.get("school_ids") or [])]
all_emps = emps

by_hd = defaultdict(list)
for e in hd:
    by_hd[norm(e["name"])].append(e)
    if e.get("english_name"):
        by_hd[norm(e["english_name"])].append(e)

by_all = defaultdict(list)
for e in all_emps:
    by_all[norm(e["name"])].append(e)


def dept_blob(e):
    parts = list(e.get("department_names") or [])
    parts.append(e.get("name") or "")
    return norm(" ".join(parts))


def pick_by_node_hint(node_name, candidates):
    """Return (mode, value):
    - ('one', emp) unique best
    - ('all', [emps]) every candidate matches hint equally (2 giáo viên cùng tên)
    - None no hint match
    """
    hints = NODE_DEPT_HINTS.get(node_name) or []
    if not hints:
        return None
    scored = []
    for e in candidates:
        blob = dept_blob(e)
        score = sum(1 for h in hints if h in blob)
        if score:
            scored.append((score, e))
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    best = scored[0][0]
    tops = [e for s, e in scored if s == best]
    if len(tops) == 1:
        return ("one", tops[0])
    return ("all", tops)


def resolve(name, node_name=None):
    raw = name
    n = norm(name)
    if n in ALIASES:
        alias = ALIASES[n]
        n = norm(alias)
        name = alias

    # strip paren for lookup, but also try full name with paren in DB
    n_strip = re.sub(r"\(.*?\)", "", n).strip()
    n_strip = " ".join(n_strip.split())

    def exact_list(key):
        return list(by_hd.get(key) or [])

    cands = exact_list(n) or exact_list(n_strip)

    # also names that start with excel name + " (" e.g. Nguyễn Thị Minh (Mỹ thuật)
    if not cands:
        prefixed = []
        for key, els in by_hd.items():
            if key.startswith(n + " ") or key.startswith(n + "(") or key.startswith(n_strip + " "):
                prefixed.extend(els)
        cands = list({e["id"]: e for e in prefixed}.values())

    if len(cands) == 1:
        return "clear", cands[0], "exact_hd"
    if len(cands) > 1:
        picked = pick_by_node_hint(node_name, cands) if node_name else None
        if picked and picked[0] == "one":
            return "clear", picked[1], "dup_disambiguated"
        if picked and picked[0] == "all":
            return "clear_multi", picked[1], "dup_all_matching"
        return "dup_hd", cands, "duplicate_hd"

    # fuzzy unique among HD — only DB name contains/extends excel name (not reverse)
    fuzzy = []
    for key, els in by_hd.items():
        if n == key or n_strip == key:
            fuzzy.extend(els)
        elif len(n) >= 5 and (key.startswith(n + " ") or key.startswith(n + "(") or n in key):
            fuzzy.extend(els)
        elif n_strip and len(n_strip) >= 5 and (
            key.startswith(n_strip + " ") or key.startswith(n_strip + "(") or n_strip in key
        ):
            fuzzy.extend(els)
    uniq = list({e["id"]: e for e in fuzzy}.values())
    if len(uniq) == 1:
        return "clear", uniq[0], "fuzzy_unique_hd"
    if len(uniq) > 1:
        picked = pick_by_node_hint(node_name, uniq) if node_name else None
        if picked and picked[0] == "one":
            return "clear", picked[1], "fuzzy_disambiguated"
        if picked and picked[0] == "all":
            return "clear_multi", picked[1], "fuzzy_all_matching"
        return "ambiguous", uniq, "fuzzy_multi_hd"

    if n in by_all:
        return "other_school", by_all[n], "other_school"
    if n_strip in by_all:
        return "other_school", by_all[n_strip], "other_school"

    return "missing", [], "missing"


clear_actions = []  # (node_id, node_name, emp_id, emp_name, is_primary, excel_name)
uncertain = []
missing_people = []
missing_nodes = []

for node_name, data in assignments.items():
    node = node_by_name.get(norm(node_name))
    if not node:
        missing_nodes.append(
            {
                "node": node_name,
                "leads": data["leads"],
                "members": data["members"],
            }
        )
        continue

    seen_emp = set()
    for role, names in [("lead", data["leads"]), ("member", data["members"])]:
        for excel_name in names:
            # Special: "Nguyễn Thị Minh 89" — likely birth-year marker, not Mỹ thuật
            excel_lookup = excel_name
            force_uncertain = None
            if re.search(r"(?i)minh\s*89", excel_name):
                force_uncertain = {
                    "reason": "Excel ghi 'Nguyễn Thị Minh 89' — cần xác định đúng người (khác Minh Mỹ thuật?)",
                    "excel_name": excel_name,
                    "role": role,
                    "node": node["name"],
                    "candidates": [
                        {
                            "id": e["id"],
                            "name": e["name"],
                            "depts": e.get("department_names"),
                            "username": e.get("username"),
                            "main_class": e.get("main_class"),
                        }
                        for e in hd
                        if "minh" in norm(e["name"]) and "nguyễn" in norm(e["name"])
                    ],
                }

            if force_uncertain:
                uncertain.append(force_uncertain)
                continue

            # Nguyễn Thị Minh trên Năng khiếu/CLB/Đưa đón/... → ưu tiên bản (Mỹ thuật)
            if norm(excel_name) == "nguyễn thị minh" and node["name"] in {
                "Năng Khiếu",
                "CLB",
                "Đưa đón",
                "Sự kiện dã ngoại",
                "Hội thảo",
            }:
                art = next(
                    (e for e in hd if norm(e["name"]).startswith("nguyễn thị minh (mỹ")),
                    None,
                )
                if art:
                    if art["id"] not in seen_emp:
                        seen_emp.add(art["id"])
                        clear_actions.append(
                            (
                                node["id"],
                                node["name"],
                                art["id"],
                                art["name"],
                                role == "lead",
                                excel_name,
                            )
                        )
                    elif role == "lead":
                        clear_actions.append(
                            (node["id"], node["name"], art["id"], art["name"], True, excel_name)
                        )
                    continue

            status, match, how = resolve(excel_lookup, node["name"])
            is_primary = role == "lead"

            def add_one(emp, primary):
                if emp["id"] in seen_emp:
                    if primary:
                        clear_actions.append(
                            (node["id"], node["name"], emp["id"], emp["name"], True, excel_name)
                        )
                    return
                seen_emp.add(emp["id"])
                clear_actions.append(
                    (node["id"], node["name"], emp["id"], emp["name"], primary, excel_name)
                )

            if status == "clear":
                add_one(match, is_primary)
            elif status == "clear_multi":
                # Nhiều người cùng tên cùng đúng bộ môn → thêm tất cả
                for emp in match:
                    add_one(emp, is_primary)
            elif status == "dup_hd":
                uncertain.append(
                    {
                        "reason": "Trùng tên trong Hà Đông — chọn đúng người",
                        "excel_name": excel_name,
                        "role": role,
                        "node": node["name"],
                        "candidates": [
                            {
                                "id": e["id"],
                                "name": e["name"],
                                "depts": e.get("department_names"),
                                "username": e.get("username"),
                                "email": e.get("email"),
                                "main_class": e.get("main_class"),
                                "extra": e.get("extra"),
                            }
                            for e in match
                        ],
                    }
                )
            elif status == "ambiguous":
                uncertain.append(
                    {
                        "reason": "Khớp mơ hồ",
                        "excel_name": excel_name,
                        "role": role,
                        "node": node["name"],
                        "candidates": [
                            {"id": e["id"], "name": e["name"], "depts": e.get("department_names")}
                            for e in match
                        ],
                    }
                )
            elif status == "other_school":
                uncertain.append(
                    {
                        "reason": "Có trong DB nhưng không gắn school Hà Đông",
                        "excel_name": excel_name,
                        "role": role,
                        "node": node["name"],
                        "candidates": [
                            {
                                "id": e["id"],
                                "name": e["name"],
                                "schools": e.get("school_ids"),
                                "depts": e.get("department_names"),
                                "username": e.get("username"),
                            }
                            for e in match
                        ],
                    }
                )
            else:
                # Suggest near matches for missing
                suggestions = []
                tokens = [t for t in norm(excel_name).split() if len(t) > 1]
                for e in hd:
                    en = norm(e["name"])
                    if tokens and sum(1 for t in tokens if t in en) >= max(2, len(tokens) - 1):
                        suggestions.append(
                            {"id": e["id"], "name": e["name"], "depts": e.get("department_names")}
                        )
                missing_people.append(
                    {
                        "excel_name": excel_name,
                        "role": role,
                        "node": node["name"],
                        "suggestions": suggestions[:5],
                    }
                )

# Apply clear
print(f"Applying {len(clear_actions)} clear memberships...")
applied = 0
errors = []
for node_id, node_name, emp_id, emp_name, is_primary, excel_name in clear_actions:
    try:
        post(
            f"/api/nodes/{node_id}/members",
            {"employee_id": emp_id, "is_primary": is_primary},
        )
        applied += 1
    except Exception as ex:
        errors.append((node_name, emp_name, str(ex)))

print(f"Applied={applied}, errors={len(errors)}")
for e in errors:
    print(" ERR", e)

# Summarize by node
by_node = defaultdict(list)
for node_id, node_name, emp_id, emp_name, is_primary, excel_name in clear_actions:
    by_node[node_name].append((emp_name, is_primary, excel_name))

print("\n=== APPLIED BY NODE ===")
for nn in sorted(by_node.keys()):
    people = by_node[nn]
    print(f"\n{nn} ({len(people)})")
    for emp_name, is_primary, excel_name in people:
        tag = "LEAD" if is_primary else "mem"
        extra = f" ← excel:{excel_name}" if norm(excel_name) != norm(emp_name) else ""
        print(f"  [{tag}] {emp_name}{extra}")

result = {
    "applied_count": applied,
    "uncertain": uncertain,
    "missing_people": missing_people,
    "missing_nodes": missing_nodes,
    "applied_by_node": {
        k: [{"name": n, "primary": p, "excel": x} for n, p, x in v]
        for k, v in by_node.items()
    },
}
out = r"C:\Users\Admin\Desktop\IQ Diagram\scripts\_tmp_apply_result.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("\n=== UNCERTAIN ===")
print(json.dumps(uncertain, ensure_ascii=False, indent=2))
print("\n=== MISSING PEOPLE ===")
print(json.dumps(missing_people, ensure_ascii=False, indent=2))
print("\n=== MISSING NODES ===")
print(json.dumps(missing_nodes, ensure_ascii=False, indent=2))
print("\nWrote", out)
