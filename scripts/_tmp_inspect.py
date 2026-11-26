import json
import urllib.request
import unicodedata

def get(path):
    return json.load(urllib.request.urlopen("http://localhost:5050" + path))

def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFC", str(s)).strip().lower()
    s = " ".join(s.split())
    return s

nodes = get("/api/nodes")
print("=== NODES ===")
for n in nodes["flat"]:
    print(
        f"{n['level']}|{n['sort_order']}|{n['name']}|{n['id']}|m={n.get('member_count', 0)}|{n['node_type']}"
    )

schools = get("/api/meta/schools")
print("\n=== SCHOOLS ===")
print(json.dumps(schools, ensure_ascii=False, indent=2))

emps = get("/api/employees")
print(f"\n=== EMPLOYEES count={len(emps)} ===")
# find Ha Dong school id
hd = None
for s in schools:
    if "hà đông" in norm(s["name"]) or "ha dong" in norm(s["name"]):
        hd = s
        print("Ha Dong school:", s)

ha_dong_emps = []
if hd:
    for e in emps:
        ids = e.get("school_ids") or []
        if hd["id"] in ids:
            ha_dong_emps.append(e)
    print(f"Ha Dong employees: {len(ha_dong_emps)}")
else:
    ha_dong_emps = emps
    print("No Ha Dong school found; using all employees")

# sample names
for e in sorted(ha_dong_emps, key=lambda x: x["name"])[:30]:
    print(f"  - {e['name']} | schools={e.get('school_ids')} | depts={e.get('department_names')}")

print(f"\nTotal employees in DB: {len(emps)}")
