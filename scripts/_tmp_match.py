import json
import re
import urllib.request
import unicodedata
from collections import defaultdict

import openpyxl

API = "http://localhost:5050"
HA_DONG_ID = 1


def get(path):
    return json.load(urllib.request.urlopen(API + path))


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFC", str(s)).strip().lower()
    # normalize special chars / spacing
    s = s.replace("đ", "đ")
    s = " ".join(s.split())
    return s


def split_names(text):
    if not text:
        return []
    text = str(text)
    # remove prefixes like TH :, MN :, P1 :, etc.
    text = re.sub(r"(?i)\b(TH|MN|P1|P2|P3|P4|P5|P2,3,4,5)\s*:\s*", " / ", text)
    parts = re.split(r"[/|,;]+", text)
    names = []
    for p in parts:
        p = p.strip()
        p = re.sub(r"^\d+\.?\s*", "", p)
        p = p.strip(" -–—\t")
        if not p:
            continue
        # skip company / org labels alone if all caps long?
        if p.upper() == p and len(p) > 25:
            names.append(p)
            continue
        names.append(p)
    return names


wb = openpyxl.load_workbook(
    r"C:\Users\Admin\Desktop\IQ Diagram\Phan_cong_nhan_su_4_luong_IQ.xlsx", data_only=True
)
ws = wb.active

# Collect excel rows with structure awareness
print("=== RAW EXCEL ROWS ===")
for row in ws.iter_rows(min_row=3, max_row=47, max_col=4, values_only=True):
    stt, title, lead, note = row
    if not any([stt, title, lead, note]):
        continue
    print(f"STT={stt!r} | TITLE={title!r} | LEAD={lead!r} | NOTE={note!r}")

nodes = get("/api/nodes")["flat"]
node_by_name = {norm(n["name"]): n for n in nodes}
emps = get("/api/employees")
hd_emps = [e for e in emps if HA_DONG_ID in (e.get("school_ids") or [])]
print(f"\nHa Dong emps: {len(hd_emps)}")

# index by normalized name
by_name = defaultdict(list)
for e in hd_emps:
    by_name[norm(e["name"])].append(e)
    if e.get("english_name"):
        by_name[norm(e["english_name"])].append(e)

# also all employees for fallback check
all_by_name = defaultdict(list)
for e in emps:
    all_by_name[norm(e["name"])].append(e)


def find_emp(name):
    n = norm(name)
    if n in by_name:
        return by_name[n], "exact_hd"
    # fuzzy: remove parentheses content
    n2 = re.sub(r"\(.*?\)", "", n).strip()
    n2 = " ".join(n2.split())
    if n2 in by_name:
        return by_name[n2], "exact_hd_stripped"
    # startswith / contains among HD
    cands = []
    for key, els in by_name.items():
        if n in key or key in n or n2 in key or key in n2:
            cands.extend(els)
    if cands:
        # unique by id
        uniq = {e["id"]: e for e in cands}
        return list(uniq.values()), "fuzzy_hd"
    # check outside HD
    if n in all_by_name or n2 in all_by_name:
        return all_by_name.get(n) or all_by_name.get(n2), "other_school"
    cands = []
    for key, els in all_by_name.items():
        if n in key or key in n or n2 in key or key in n2:
            cands.extend(els)
    if cands:
        uniq = {e["id"]: e for e in cands}
        return list(uniq.values()), "fuzzy_other"
    return [], "missing"


# Build assignment plan from Excel based on known structure
# Map excel department titles -> node names
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
    "luồng 2 – dịch vụ & chăm sóc học sinh": "Luồng 2",
    "học sinh": "Học sinh",
    "clb (câu lạc bộ)": "CLB",
    "đưa đón": "Đưa đón",
    "trông muộn": "Trông muộn",
    "sự kiện dã ngoại": "Sự kiện dã ngoại",
    "dự án": "Dự án",
    "y tế": "Y tế",
    "luồng 3 – tuyển sinh & phát triển": "Luồng 3",
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
}

# Nodes that don't exist yet in tree
MISSING_NODES = {
    "hỗ trợ/đợi lớp",
    "bếp",
    "số hoá",
    "khác",
}

# Parse excel into assignments: node_name -> {leads: [], members: [], raw_unmapped: []}
assignments = defaultdict(lambda: {"leads": [], "members": [], "raw_leads": [], "raw_members": []})
current_node = None
pending_continuation = None  # for rows without STT that continue previous

rows = list(ws.iter_rows(min_row=4, max_row=47, max_col=4, values_only=True))
i = 0
while i < len(rows):
    stt, title, lead, note = rows[i]
    title_n = norm(title) if title else ""

    # stream / section headers with lead
    if title and not stt and title_n.startswith("luồng"):
        mapped = NODE_MAP.get(title_n) or NODE_MAP.get(title_n.split("–")[0].strip())
        # try looser
        if not mapped:
            for k, v in NODE_MAP.items():
                if k.startswith(title_n[:8]):
                    mapped = v
                    break
        if mapped:
            current_node = mapped
            if lead:
                assignments[mapped]["raw_leads"].extend(split_names(lead))
            if note:
                assignments[mapped]["raw_members"].extend(split_names(note))
        i += 1
        continue

    if stt is None and not title and (lead or note):
        # continuation of previous node (e.g. second lead for Tiếng Việt / Tiếng Anh / CLB)
        if current_node:
            # For CLB special: lead cell has club name, note has person
            if current_node == "CLB" and lead and note:
                # club sub-type — attach people to CLB members, keep club name in note conceptually
                assignments[current_node]["raw_members"].extend(split_names(note))
                # also if lead looks like a person not a club name
            elif lead:
                # person as additional lead?
                lead_names = split_names(lead)
                # Heuristic: if previous was Tiếng Việt / Tiếng Anh, C column people are leads
                if current_node in ("Tiếng việt", "Tiếng anh"):
                    assignments[current_node]["raw_leads"].extend(lead_names)
                else:
                    assignments[current_node]["raw_members"].extend(lead_names)
            if note and current_node != "CLB":
                assignments[current_node]["raw_members"].extend(split_names(note))
            elif note and current_node == "CLB":
                assignments[current_node]["raw_members"].extend(split_names(note))
        i += 1
        continue

    if title:
        title_key = title_n
        # strip trailing spaces already in norm
        mapped = NODE_MAP.get(title_key)
        if not mapped:
            # try without parentheses content kept
            for k, v in NODE_MAP.items():
                if k == title_key or title_key in k or k in title_key:
                    mapped = v
                    break
        if mapped:
            current_node = mapped
            if lead:
                assignments[mapped]["raw_leads"].extend(split_names(lead))
            if note:
                # For Hội đồng trường, names are only in note (D)
                if mapped == "Hội đồng trường" and not lead:
                    assignments[mapped]["raw_members"].extend(split_names(note))
                else:
                    assignments[mapped]["raw_members"].extend(split_names(note))
        elif title_key in MISSING_NODES or any(m in title_key for m in MISSING_NODES):
            current_node = f"__MISSING__:{title}"
            if lead:
                assignments[current_node]["raw_leads"].extend(split_names(lead))
            if note:
                assignments[current_node]["raw_members"].extend(split_names(note))
        else:
            print(f"UNMAPPED TITLE: {title!r}")
            current_node = None
    i += 1

# Special CLB rows: C21-C24 are club types not people
# Re-parse CLB carefully
assignments["CLB"] = {"leads": [], "members": [], "raw_leads": [], "raw_members": []}
# From excel: 2.2 CLB - C has club names, D has people
# Also first row C21='Mỹ Thuật', D21='Nguyễn Thị Minh'
clb_people = []
# scan again
for row in rows:
    stt, title, lead, note = row
    if stt == "2.2" or (current_node == "CLB"):
        pass

# manual CLB from known cells
clb_people = [
    "Nguyễn Thị Minh",  # Mỹ Thuật
    "Đỗ Thị Thanh Hải",
    "Dương Thị Tâm",  # Piano-Múa
    "Nguyễn Cường Quốc",
    "Chu Thị Thanh",  # Cờ Vua
    "Phạm Văn Đang",
    "Nguyễn Thị Lan Anh",
    "Bùi Thị Kiều Trang",  # Tiếng Trung CLB
]
assignments["CLB"]["raw_members"] = clb_people

# Năng khiếu: people only in D, no C lead
# Hỗ trợ etc handled as missing nodes

print("\n=== ASSIGNMENT RESOLUTION ===")
clear = []
uncertain = []
missing_people = []
missing_nodes_items = []

for node_key, data in assignments.items():
    leads = data["raw_leads"]
    members = data["raw_members"]
    # dedupe preserve order
    def dedupe(xs):
        seen = set()
        out = []
        for x in xs:
            k = norm(x)
            if k in seen:
                continue
            seen.add(k)
            out.append(x)
        return out

    leads = dedupe(leads)
    members = dedupe(members)
    # remove leads from members duplicate listing is ok — same person can be lead

    if node_key.startswith("__MISSING__:"):
        missing_nodes_items.append((node_key, leads, members))
        continue

    node = node_by_name.get(norm(node_key))
    if not node:
        # try loose
        for kn, nd in node_by_name.items():
            if norm(node_key) in kn or kn in norm(node_key):
                node = nd
                break
    if not node:
        print(f"NODE NOT FOUND IN DB: {node_key}")
        continue

    print(f"\n## {node['name']} ({node['id'][:8]})")
    print(f"  leads raw: {leads}")
    print(f"  members raw: {members}")

    for role, names in [("lead", leads), ("member", members)]:
        for name in names:
            matches, how = find_emp(name)
            item = {
                "excel_name": name,
                "role": role,
                "node": node["name"],
                "node_id": node["id"],
                "how": how,
                "matches": [
                    {
                        "id": m["id"],
                        "name": m["name"],
                        "schools": m.get("school_ids"),
                        "depts": m.get("department_names"),
                    }
                    for m in matches
                ],
            }
            if how.startswith("exact") and len(matches) == 1:
                clear.append(item)
                print(f"  OK [{role}] {name} -> {matches[0]['name']} ({how})")
            elif how == "missing":
                missing_people.append(item)
                print(f"  MISSING [{role}] {name}")
            else:
                uncertain.append(item)
                print(
                    f"  UNCERTAIN [{role}] {name} how={how} matches={[m['name'] for m in matches]}"
                )

print("\n\n=== SUMMARY ===")
print(f"clear: {len(clear)}")
print(f"uncertain: {len(uncertain)}")
print(f"missing people: {len(missing_people)}")
print(f"missing nodes: {len(missing_nodes_items)}")
for nk, leads, members in missing_nodes_items:
    print(f"  NODE {nk}: leads={leads} members={members}")

# dump for later apply
with open(r"C:\Users\Admin\Desktop\IQ Diagram\scripts\_tmp_match_result.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            "clear": clear,
            "uncertain": uncertain,
            "missing_people": missing_people,
            "missing_nodes": [
                {"key": k, "leads": l, "members": m} for k, l, m in missing_nodes_items
            ],
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print("\nWrote _tmp_match_result.json")
