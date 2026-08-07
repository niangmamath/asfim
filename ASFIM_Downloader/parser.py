import pandas as pd

def read_excel(file_path, publication_date, is_hebdo):
    """
    Lit un fichier Excel ASFIM, nettoie les colonnes et ajoute les colonnes BI.
    """
    # L'ajout magique est ici : skiprows=1 (ou header=1) pour sauter le titre
    df = pd.read_excel(file_path, skiprows=1)
    
    # Nettoyage des espaces cachés dans les noms de colonnes
    df.columns = [str(c).strip() for c in df.columns]
    
    # Ajout des axes d'analyse temporelle pour Power BI
    df["DatePublication"] = publication_date
    df["TypePublication"] = "Hebdomadaire" if is_hebdo else "Quotidienne"
    
    return df