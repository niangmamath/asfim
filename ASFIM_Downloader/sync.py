"""
Pipeline de synchronisation ASFIM.

Portée volontairement limitée : l'objectif est de rester à jour avec ce
qu'on a déjà et les prochains jours — pas de reconquérir tout l'historique
ASFIM (des milliers de publications remontant à plusieurs années). Une
publication n'est donc jamais considérée comme "manquante" si elle est
antérieure à la plus ancienne déjà connue : `missing` ne contient que ce
qui est plus récent que ce qu'on a déjà. Un run typique traite donc 0 à 2
dates, jamais plus (sauf rattrapage après une panne de quelques jours,
plafonné par MAX_BACKFILL).

Stockage : plus de fichier history.json monolithique. Il grossissait avec
chaque nouvelle date (jusqu'à plusieurs dizaines de Mo à terme) et devait
être retéléchargé EN ENTIER par chaque visiteur à chaque page vue.
L'historique par société est maintenant découpé en un fichier PAR DATE
(history/<date>.json sur Blob), plus un petit index (history.json :
generated_at/classifications/dates seulement, quelques dizaines de Ko) que
le frontend charge en premier pour savoir quelle date afficher, puis quel
fichier par date aller chercher.

Ce script écrit tout dans blob_out/ (miroir local de l'arborescence Blob) ;
c'est le workflow CI qui uploade chaque fichier trouvé dedans.

État persistant : toujours pas de base SQLite committée dans git — l'index
déjà publié sur Blob fait office de source de vérité pour "quelles dates
sont déjà connues".
"""
import json
import os
import shutil
import traceback
from datetime import datetime, timezone
from pathlib import Path

import requests

from aggregate import clean_numeric_columns, detect_columns, build_companies, build_hierarchy
from api import get_all_dates
from build_funds import build_funds_payload
from config import DOWNLOAD_FOLDER
from downloader import download_file
from parser import read_excel

MAX_BACKFILL = 90  # sécurité : ne jamais traiter plus de N nouvelles publications en un seul run

HISTORY_JSON_URL = os.environ.get(
    "HISTORY_JSON_URL",
    "https://REPLACE_WITH_YOUR_BLOB_STORE.public.blob.vercel-storage.com/history.json",
)

BLOB_OUT = Path("blob_out")


def load_current_index():
    """Récupère l'index déjà publié sur Blob (dates/classifications seulement —
    plus jamais le détail par société de toutes les dates d'un coup)."""
    try:
        response = requests.get(HISTORY_JSON_URL, timeout=30)
        response.raise_for_status()
        payload = response.json()
        payload.setdefault("classifications", [])
        payload.setdefault("dates", [])
        return payload
    except Exception as e:
        print(f"⚠️ Impossible de charger l'index existant depuis Blob ({e}) — on repart de zéro.")
        return {"classifications": [], "dates": []}


def write_github_output(changed: bool):
    """Expose un output 'changed' au workflow GitHub Actions pour lui permettre
    de sauter l'upload Blob quand il n'y a rien de nouveau."""
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


def main():
    print("=== PIPELINE DE SYNCHRONISATION ASFIM ===")

    if BLOB_OUT.exists():
        shutil.rmtree(BLOB_OUT)
    (BLOB_OUT / "history").mkdir(parents=True, exist_ok=True)

    index = load_current_index()
    known_dates = {d["date"] for d in index["dates"]}
    newest_known = max(known_dates) if known_dates else None
    print(f"{len(known_dates)} date(s) déjà connue(s) (via l'index Blob)."
          + (f" Plus récente : {newest_known}." if newest_known else " Aucune date connue."))

    print("Connexion à l'API ASFIM...")
    all_publications = get_all_dates()  # trié par date décroissante

    if newest_known:
        # Volontairement pas d'archéologie : seules les publications plus
        # récentes que la plus récente déjà connue comptent comme "manquantes".
        missing = [p for p in all_publications
                   if p["date"] not in known_dates and p["date"] > newest_known]
    else:
        missing = [p for p in all_publications if p["date"] not in known_dates]

    if not missing:
        print("\n✅ Tout est déjà à jour. Aucune nouvelle publication à traiter.")
        write_github_output(False)
        return

    if len(missing) > MAX_BACKFILL:
        print(f"⚠️ {len(missing)} nouvelles publications détectées, "
              f"au-delà de la limite de sécurité ({MAX_BACKFILL}). "
              f"Seules les {MAX_BACKFILL} plus récentes seront traitées.")
        missing = missing[:MAX_BACKFILL]

    print(f"🆕 {len(missing)} publication(s) à traiter : "
          f"{', '.join(p['date'] for p in reversed(missing))}")

    classifications = set(index["classifications"])
    new_dates_meta = []
    latest_df = None
    latest_date = None
    new_imports = 0

    # --- TRAITEMENT DE TOUTES LES NOUVELLES DATES (de la plus ancienne à la plus récente) ---
    for pub in reversed(missing):
        date = pub["date"]
        is_hebdo = pub["is_hebdo"]

        print(f"\n🆕 Traitement : {date} ({'Hebdo' if is_hebdo else 'Quotidienne'})")

        try:
            download_file(date)
            file_path = DOWNLOAD_FOLDER / f"{date}.xlsx"

            if not os.path.exists(file_path):
                print(f"⚠️ Fichier {date}.xlsx introuvable après téléchargement.")
                continue

            df = read_excel(file_path, date, is_hebdo)
            df = clean_numeric_columns(df)
            col_societe, col_classif = detect_columns(df)

            type_label = "Hebdomadaire" if is_hebdo else "Quotidienne"
            snapshot = {
                "date": date,
                "type": type_label,
                "companies": build_companies(df, col_societe, col_classif),
                "hierarchy": build_hierarchy(df, col_classif, col_societe),
            }
            with open(BLOB_OUT / "history" / f"{date}.json", "w", encoding="utf-8") as f:
                json.dump(snapshot, f, ensure_ascii=False)

            new_dates_meta.append({"date": date, "type": type_label})
            if col_classif in df.columns:
                classifications.update(df[col_classif].dropna().astype(str).unique().tolist())

            latest_df, latest_date = df, date
            new_imports += 1

        except Exception as e:
            print(f"❌ Erreur lors du traitement de la date {date}: {e}")
            traceback.print_exc()
            continue

    if new_imports == 0:
        print("\n⚠️ Aucune date n'a pu être traitée malgré des publications manquantes détectées.")
        write_github_output(False)
        return

    all_dates_meta = sorted(
        index["dates"] + new_dates_meta,
        key=lambda x: x["date"],
        reverse=True,
    )
    new_index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "classifications": sorted(classifications),
        "dates": all_dates_meta,
    }
    with open(BLOB_OUT / "history.json", "w", encoding="utf-8") as f:
        json.dump(new_index, f, ensure_ascii=False)

    # `missing` ne contient jamais rien d'antérieur à `newest_known` : la dernière
    # date traitée (latest_date) est donc toujours la vraie plus récente connue.
    funds_payload = build_funds_payload(latest_df, latest_date)
    with open(BLOB_OUT / "funds.json", "w", encoding="utf-8") as f:
        json.dump(funds_payload, f, ensure_ascii=False)

    print(f"\n🚀 Synchronisation réussie. {new_imports} nouvelle(s) date(s) ajoutée(s) "
          f"({len(all_dates_meta)} au total). funds.json : {funds_payload['count']} fonds, "
          f"date {latest_date}.")

    write_github_output(True)


if __name__ == "__main__":
    main()
