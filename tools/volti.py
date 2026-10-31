"""Scarica le foto dei personaggi di Onorevoli da Wikipedia/Wikimedia Commons e le salva in volti/.
Gira su GitHub Actions (vedi .github/workflows/volti.yml): così l'app le ha già dentro e non dipende da Wikipedia.
Per ogni foto salva in volti/fonti.json autore, licenza e pagina del file, come chiedono le licenze libere."""
import io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from PIL import Image

PEOPLE = json.load(open(os.path.join(os.path.dirname(__file__), "..", "volti", "elenco.json"), encoding="utf-8"))  # id -> titolo Wikipedia
UA = {"User-Agent": "CapodannoApp/1.0 (https://github.com/nicolabuzzella-arch/capodanno; foto per un gioco tra amici)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "volti")
os.makedirs(OUT, exist_ok=True)

START = time.time()
BUDGET = 15 * 60  # dopo 15 minuti si salva quello che c'è: il giro dopo riprende da lì

def get(url, binary=False):
    for attempt in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            print("  errore", e.code, url, flush=True)
            if e.code == 404: return None
            time.sleep(4 if e.code == 429 else 1)
        except Exception as e:  # noqa: BLE001
            print("  riprovo:", url, e, flush=True); time.sleep(2)
    return None

def strip(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()

fonti_path = os.path.join(OUT, "fonti.json")
fonti = json.load(open(fonti_path)) if os.path.exists(fonti_path) else {}
for pid, title in PEOPLE.items():
    dest = os.path.join(OUT, f"{pid}.jpg")
    have = os.path.exists(dest)
    if have and pid in fonti and fonti[pid].get("licenza"):
        continue
    if time.time() - START > BUDGET:
        print("Tempo finito: continuo al prossimo giro", flush=True); break
    src = None; host = "it"
    for host in ("it", "en"):
        d = get(f"https://{host}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title.replace(' ', '_'))}")
        src = d and ((d.get("originalimage") or {}).get("source") or (d.get("thumbnail") or {}).get("source"))
        if src: break
        time.sleep(1)
    if not src:
        print("NESSUNA FOTO:", title); continue
    src = src.split("?")[0]  # via i parametri di tracciamento: rompono miniature e nome del file
    # Versione ridotta a 640 px dal server delle miniature, se l'originale è enorme.
    m = re.match(r"https://upload\.wikimedia\.org/wikipedia/(commons|\w+)/(\w)/(\w\w)/([^/]+)$", src)
    fname = urllib.parse.unquote(m.group(4)) if m else src.rsplit("/", 1)[-1]
    if have:
        raw = None
    else:
        raw = get(f"https://upload.wikimedia.org/wikipedia/{m.group(1)}/thumb/{m.group(2)}/{m.group(3)}/{m.group(4)}/640px-{m.group(4)}" if m and not src.lower().endswith(".svg") else src, binary=True) or get(src, binary=True)
    if not have:
        if not raw:
            print("DOWNLOAD FALLITO:", title); continue
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        w, h = img.size; side = min(w, h)
        left = (w - side) // 2
        top = int((h - side) * 0.18) if h > w else 0  # nei ritratti verticali il viso sta in alto
        img = img.crop((left, top, left + side, top + side)).resize((320, 320), Image.LANCZOS)
        img.save(dest, "JPEG", quality=84, optimize=True, progressive=True)
    em = {}
    # Autore e licenza: dalla pagina del file su Commons o, se il file è caricato su Wikipedia, da lì.
    for api in ("https://commons.wikimedia.org/w/api.php", f"https://{host}.wikipedia.org/w/api.php"):
        meta = get(api + "?" + urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata", "titles": "File:" + fname}))
        try:
            em = next(iter(meta["query"]["pages"].values()))["imageinfo"][0]["extmetadata"]
            if em: break
        except Exception:  # noqa: BLE001
            em = {}
        time.sleep(1)
    fonti[pid] = {"nome": title, "file": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(fname.replace(" ", "_")),
                  "autore": strip((em.get("Artist") or {}).get("value")), "licenza": strip((em.get("LicenseShortName") or {}).get("value"))}
    fonti[pid]["tentato"] = True
    json.dump(fonti, open(fonti_path, "w"), ensure_ascii=False, indent=1)
    print("OK", title, "->", fonti[pid]["licenza"], flush=True)
    time.sleep(1.5)
json.dump(fonti, open(fonti_path, "w"), ensure_ascii=False, indent=1)
missing = [p for p in PEOPLE if not os.path.exists(os.path.join(OUT, f"{p}.jpg"))]
print("Mancano:", missing or "nessuno")
