import requests

from config import BASE_URL

def get_all_dates():
    page = 1
    dates = []

    while True:
        url = f"{BASE_URL}/counter/?ordering=-date&page={page}&page_size=100"

        response = requests.get(url)
        response.raise_for_status()

        data = response.json()

        dates.extend(data["results"])

        if data["next"] is None:
            break

        page += 1

    return dates