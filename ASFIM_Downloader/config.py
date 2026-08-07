from pathlib import Path

# ===============================
# Dossiers
# ===============================

PROJECT_ROOT = Path(__file__).parent

DOWNLOAD_FOLDER = PROJECT_ROOT / "downloads"

EXPORT_FOLDER = PROJECT_ROOT / "exports"

DATABASE_FOLDER = PROJECT_ROOT / "database"

LOG_FOLDER = PROJECT_ROOT / "logs"

# Création automatique
DOWNLOAD_FOLDER.mkdir(exist_ok=True)
EXPORT_FOLDER.mkdir(exist_ok=True)
DATABASE_FOLDER.mkdir(exist_ok=True)
LOG_FOLDER.mkdir(exist_ok=True)

# ===============================
# Base de données
# ===============================

DATABASE_PATH = DATABASE_FOLDER / "asfim.db"

EXPORT_CSV = EXPORT_FOLDER / "asfim_historique_bi.csv"

# ===============================
# API
# ===============================

BASE_URL = "https://fundshare.asfim.ma/api"

TIMEOUT = 30

HEADERS = {
    "User-Agent": "ASFIM Data Pipeline v1.0"
}