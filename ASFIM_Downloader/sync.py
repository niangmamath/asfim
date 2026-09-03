"""
Pipeline de synchronisation ASFIM.

État persistant : PLUS de base SQLite committée dans git. Un fichier binaire
comme SQLite ne se delta-compresse quasiment pas — chaque commit qui le
touche fait grossir le .git d'à peu près la taille du fichier entier, pas de
la taille du changement réel (le fichier est passé de 12 à 22 Mo en un seul
run de rattrapage). Sur la durée, ça rend le repo de plus en plus lourd et
lent à cloner/checkout, pour rien : la seule chose dont ce script a besoin,
c'est de savoir quelles dates sont déjà connues.

Cette information est déjà là : history.json publié sur Vercel Blob. Sa clé
`history` contient une entrée par date déjà traitée. On le télécharge en
début de run, on calcule les dates manquantes par rapport à cette liste, et
pour chaque nouvelle date on ajoute directement son agrégat dans l'objet en
mémoire (pas besoin de repartir d'un historique CSV complet) avant de
réuploader. git ne stocke plus que du code.
"""
import json
import os
import traceback
from datetime import datetime, timezone

import requests

from aggregate import clean_numeric_columns, detect_columns, build_companies, build_hierarchy
from api import get_all_dates
from build_funds import build_funds_payload
from config import DOWNLOAD_FOLDER
from downloader import download_file
from parser import read_excel

MAX_BACKFILL = 90  # sécurité : ne jamais rattraper plus de N publications manquantes en un seul run

HISTORY_JSON_URL = os.environ.get(
    "HISTORY_JSON_URL",
    "https://REPLACE_WITH_YOUR_BLOB_STORE.public.blob.vercel-storage.com/history.json",
)


def load_current_history():
    """Récupère l'état déjà publié sur Blob. Vide si premier run ou Blob indisponible
    (dans ce dernier cas, MAX_BACKFILL évite un rattrapage complet incontrôlé)."""
    try:
        response = requests.get(HISTORY_JSON_URL, timeout=30)
        response.raise_for_status()
        payload = response.json()
        payload.setdefault("classifications", [])
        payload.setdefault("dates", [])
        payload.setdefault("history", {})
        return payload
    except Exception as e:
        print(f"⚠️ Impossible de charger l'historique existant depuis Blob ({e}) — on repart de zéro.")
        return {"classifications": [], "dates": [], "history": {}}


def write_github_output(changed: bool):
    """Expose un output 'changed' au workflow GitHub Actions pour lui permettre
    de sauter l'upload Blob quand il n'y a rien de nouveau."""
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


def main():
    print("=== PIPELINE DE SYNCHRONISATION ASFIM ===")

    history_payload = load_current_history()
    imported_dates = set(history_payload["history"].keys())
    print(f"{len(imported_dates)} date(s) déjà connue(s) (via history.json).")

    print("Connexion à l'API ASFIM...")
    all_publications = get_all_dates()  # trié par date décroissante

    missing = [p for p in all_publications if p["date"] not in imported_dates]

    if not missing:
        print("\n✅ Tout est déjà à jour. Aucune nouvelle publication à traiter.")
        write_github_output(False)
        return

    if len(missing) > MAX_BACKFILL:
        print(f"⚠️ {len(missing)} publications manquantes détectées, "
              f"au-delà de la limite de sécurité ({MAX_BACKFILL}). "
              f"Seules les {MAX_BACKFILL} plus récentes seront rattrapées.")
        missing = missing[:MAX_BACKFILL]

    print(f"🆕 {len(missing)} publication(s) à rattraper : "
          f"{', '.join(p['date'] for p in reversed(missing))}")

    classifications = set(history_payload["classifications"])
    latest_df = None
    latest_date = None
    new_imports = 0

    # --- TRAITEMENT DE TOUTES LES DATES MANQUANTES (de la plus ancienne à la plus récente) ---
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

            history_payload["history"][date] = {
                "type": "Hebdomadaire" if is_hebdo else "Quotidienne",
                "companies": build_companies(df, col_societe, col_classif),
                "hierarchy": build_hierarchy(df, col_classif, col_societe),
            }
            if col_classif in df.columns:
                classifications.update(df[col_classif].dropna().astype(str).unique().tolist())

            latest_df, latest_date = df, date
            new_imports += 1

        except Exception as e:
            print(f"❌ Erreur lors du traitement de la date {date}: {e}")
            traceback.print_exc()
            continue

    if new_imports == 0:
        print("\n⚠️ Aucune date n'a pu être importée malgré des publications manquantes détectées.")
        write_github_output(False)
        return

    history_payload["classifications"] = sorted(classifications)
    history_payload["dates"] = sorted(
        [{"date": d, "type": v["type"]} for d, v in history_payload["history"].items()],
        key=lambda x: x["date"],
        reverse=True,
    )
    history_payload["generated_at"] = datetime.now(timezone.utc).isoformat()

    with open("history.json", "w", encoding="utf-8") as f:
        json.dump(history_payload, f, ensure_ascii=False)

    # latest_df/latest_date correspondent à la date la plus récente traitée dans CE run,
    # qui est la date globale la plus récente puisque `missing` est triée par -date.
    funds_payload = build_funds_payload(latest_df, latest_date)
    with open("funds.json", "w", encoding="utf-8") as f:
        json.dump(funds_payload, f, ensure_ascii=False)

    print(f"\n🚀 Synchronisation réussie. {new_imports} nouvelle(s) date(s) ajoutée(s). "
          f"history.json ({len(history_payload['history'])} date(s) au total) et funds.json "
          f"({funds_payload['count']} fonds, date {latest_date}) régénérés.")

    write_github_output(True)


if __name__ == "__main__":
    main()
