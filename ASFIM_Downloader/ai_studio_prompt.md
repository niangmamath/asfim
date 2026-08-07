# Prompt Google AI Studio - ASFIM Executive Dashboard

Tu es un Senior Software Engineer, Senior Data Visualization Engineer, Senior UX/UI Designer et Senior Product Manager spécialisé dans les plateformes FinTech.

Ta mission est de créer une plateforme web professionnelle de Business Intelligence pour l'ASFIM, à partir du dataset exporté par le pipeline Python déjà existant.

Contraintes importantes :
- Le pipeline Python ne doit jamais être modifié.
- L'application ne doit jamais télécharger les données. Elle doit uniquement lire le dataset disponible dans dashboard_data.csv ou dashboard_data.parquet.
- Le dashboard doit être moderne, minimaliste, rapide, responsive et adapté à un usage exécutif.
- Utilise Python + Streamlit + Plotly si possible.
- Si une version HTML est demandée, elle doit être élégante, interactive et basée sur les mêmes données.
- Le dashboard doit partager les mêmes filtres globaux à travers les vues.

Objectif produit :
Créer une plateforme comparable à Bloomberg Terminal, Morningstar Direct, BlackRock Aladdin et Power BI Premium.

Structure attendue :
1. Executive Dashboard
2. Market Overview
3. Asset Managers
4. Fund Explorer
5. Comparateur
6. Analytics
7. Export

Mesures clés à intégrer :
- Actif Net Total
- Valeur Liquidative Totale
- Nombre OPCVM
- Nombre sociétés
- Performance moyenne YTD
- Performance moyenne 1 an
- % fonds positifs
- Date dernière publication

Filtres globaux :
- Date
- Classification
- Société de Gestion
- TypePublication
- Nature juridique
- Souscripteurs
- Indice Benchmark

Design attendu :
- Palette : bleu marine, blanc, gris clair, vert, rouge
- Style professionnel et premium
- Cartes KPI responsives
- Graphiques Plotly ou Chart.js
- Table interactive
- Navigation claire et fluide

Livrables attendus :
- code propre et modulaire
- fichier par page ou composants réutilisables
- support Streamlit Cloud
- export CSV / Excel / PNG / PDF si possible
