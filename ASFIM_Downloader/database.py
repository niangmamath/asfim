import sqlite3
import os
import pandas as pd
from datetime import datetime
from config import DATABASE_PATH, EXPORT_CSV

DB_NAME = DATABASE_PATH

BI_EXPORT_FILE = EXPORT_CSV

def init_db():
    """Initialise la base de données SQLite et crée les tables nécessaires."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Table de suivi des publications pour éviter de télécharger/parser deux fois la même date
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS publications (
            date TEXT PRIMARY KEY,
            is_hebdo INTEGER,
            imported_at TEXT
        )
    """)
    conn.commit()
    conn.close()

def is_date_imported(date_str):
    """Vérifie si une date de publication a déjà été intégrée."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM publications WHERE date = ?", (date_str,))
    row = cursor.fetchone()
    conn.close()
    return row is not None

def save_data(df, date_str, is_hebdo):
    """Insère les données de performance dans SQLite et marque la date comme traitée."""
    conn = sqlite3.connect(DB_NAME)
    
    # pandas injecte automatiquement les données. Si la table 'performances' n'existe pas,
    # elle sera créée automatiquement avec les bonnes colonnes.
    df.to_sql("performances", conn, if_exists="append", index=False)
    
    # Enregistrement de la métadonnée de publication
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO publications (date, is_hebdo, imported_at) VALUES (?, ?, ?)",
        (date_str, int(is_hebdo), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    
    conn.commit()
    conn.close()

def export_for_powerbi():
    """Exporte la base historique complète dans un CSV optimisé pour Power BI."""
    conn = sqlite3.connect(DB_NAME)
    # Extraction de l'intégralité de la table historique
    df = pd.read_sql_query("SELECT * FROM performances", conn)
    conn.close()
    
    # Sauvegarde en CSV avec encodage utf-8-sig (idéal pour la prise en charge des accents dans Excel/Power BI)
    df.to_csv(BI_EXPORT_FILE, index=False, encoding="utf-8-sig")
    print(f" Retraitement BI terminé : {BI_EXPORT_FILE} est à jour ({len(df)} lignes totales).")