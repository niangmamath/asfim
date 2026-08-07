# 1. Télécharger les nouvelles données du marché
python sync.py

# 2. Transformer et préparer les données pour le dashboard (C'est lui qui manquait !)
python prepare_dashboard.py

# 3. Lancer l'API FastAPI
python api_server.py