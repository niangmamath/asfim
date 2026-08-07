import os
import requests

from config import BASE_URL, DOWNLOAD_FOLDER, HEADERS, TIMEOUT
def download_file(date):
    

    url = f"{BASE_URL}/performances/export/?date={date}"

    response = requests.get(
    url,
    headers=HEADERS,
    timeout=TIMEOUT
)

    print(f"Téléchargement de {date}...")
    print(f"Code HTTP : {response.status_code}")

    if response.status_code != 200:
        print("Erreur de téléchargement")
        return

    filename = DOWNLOAD_FOLDER / f"{date}.xlsx"

    with open(filename, "wb") as f:
        f.write(response.content)

    print(f"Fichier enregistré : {filename}")