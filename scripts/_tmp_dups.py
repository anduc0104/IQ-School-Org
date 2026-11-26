import json
import urllib.request
import unicodedata

def norm(s):
    return " ".join(unicodedata.normalize("NFC", str(s or "")).strip().lower().split())

emps = json.load(urllib.request.urlopen("http://localhost:5050/api/employees"))
hd = [e for e in emps if 1 in (e.get("school_ids") or [])]

names = [
    "Nguyễn Thị Phương",
    "Nguyễn Thùy Linh",
    "Nguyễn Thuỳ Linh",
    "Nguyễn Thị Hằng",
    "Nguyễn Thị Thanh",
    "Nguyễn Thị Minh",
]
for name in names:
    print(f"\n=== {name} ===")
    for e in hd:
        if norm(e["name"]) == norm(name) or norm(name) in norm(e["name"]):
            print(
                f"  id={e['id'][:8]} name={e['name']!r} user={e.get('username')} "
                f"email={e.get('email')} depts={e.get('department_names')} "
                f"main={e.get('main_class')} extra={e.get('extra')} phone={e.get('phone')}"
            )

print("\n=== Pháp chế / Thu Thảo search ===")
for e in emps:
    if "thảo" in norm(e["name"]) and "nguyễn" in norm(e["name"]):
        print(f"  {e['name']} schools={e.get('school_ids')} depts={e.get('department_names')} user={e.get('username')}")

print("\n=== Vệ sinh related ===")
for e in emps:
    n = norm(e["name"])
    if any(x in n for x in ["xuyên", "thị hồng", "thị hà", "thị ngân", "lao công", "vệ sinh"]):
        print(f"  {e['name']} schools={e.get('school_ids')} depts={e.get('department_names')}")

print("\n=== Y tế ===")
for e in emps:
    if "yến" in norm(e["name"]) or "y tế" in " ".join(e.get("department_names") or []).lower():
        if 1 in (e.get("school_ids") or []) or "y tế" in " ".join(e.get("department_names") or []).lower():
            print(f"  {e['name']} schools={e.get('school_ids')} depts={e.get('department_names')}")
