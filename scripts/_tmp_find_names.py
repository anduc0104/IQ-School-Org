import json
import urllib.request
import unicodedata

def norm(s):
    s = unicodedata.normalize("NFC", str(s or "")).strip().lower()
    return " ".join(s.split())

emps = json.load(urllib.request.urlopen("http://localhost:5050/api/employees"))
queries = [
    "cao thu", "thuỳ", "thùy", "kim thiết", "vân thúy", "vân thuý", "thu trang",
    "hòa", "hoà", "lã thị", "trần thị hồng", "xuyên", "thị hà", "thị ngân",
    "mai văn", "hậu", "thúy", "thuý", "hường", "hà phương", "đức ân", "quang minh",
    "hồng nguyệt", "thu thảo", "minh 89", "an bình", "hàn ly", "sâm",
]
for q in queries:
    hits = [e for e in emps if q in norm(e["name"])]
    if hits:
        print(f"\n[{q}]")
        for e in hits:
            print(f"  {e['name']} schools={e.get('school_ids')} depts={e.get('department_names')} user={e.get('username')}")
