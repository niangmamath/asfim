from api import get_all_dates
from downloader import download_file
from parser import read_excel

dates = get_all_dates()

print(f"{len(dates)} tableaux trouvés.")

premier = dates[0]

date = premier["date"]
is_hebdo = premier["is_hebdo"]

download_file(date)

df = read_excel(
    f"downloads/{date}.xlsx",
    date,
    is_hebdo
)

print(df.head())