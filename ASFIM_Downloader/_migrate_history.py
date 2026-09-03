"""
Migration ponctuelle : éclate l'ancien history.json monolithique (actuellement
sur Blob) en un fichier par date + un index léger, dans blob_out/ (même
convention que sync.py). À exécuter une seule fois, puis uploader blob_out/
avec le script Node existant.
"""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import requests

OLD_HISTORY_URL = "https://nhxdf2l6bfma6u8j.public.blob.vercel-storage.com/history.json"
OUT = Path("blob_out")

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "history").mkdir(parents=True, exist_ok=True)

print("Téléchargement de l'ancien history.json...")
resp = requests.get(OLD_HISTORY_URL, timeout=60)
resp.raise_for_status()
old = resp.json()

dates = old["dates"]
history = old["history"]
classifications = old.get("classifications", [])

print(f"{len(dates)} dates à migrer.")

for entry in dates:
    date = entry["date"]
    snap = history[date]
    out_snap = {
        "date": date,
        "type": snap["type"],
        "companies": snap["companies"],
        "hierarchy": snap["hierarchy"],
    }
    with open(OUT / "history" / f"{date}.json", "w", encoding="utf-8") as f:
        json.dump(out_snap, f, ensure_ascii=False)

index = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "classifications": classifications,
    "dates": dates,
}
with open(OUT / "history.json", "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False)

print(f"OK : {len(dates)} fichiers par date + 1 index écrits dans {OUT}/")
