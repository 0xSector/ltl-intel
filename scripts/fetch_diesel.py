"""Fetch weekly U.S. No. 2 Diesel Retail Prices from the EIA open API.
Writes data/diesel.json. Requires EIA_API_KEY env var (free at eia.gov/opendata).
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "diesel.json"
SERIES_ID = "PET.EMD_EPD2D_PTE_NUS_DPG.W"  # US weekly retail on-highway diesel

def main():
    key = os.environ.get("EIA_API_KEY")
    if not key:
        print("EIA_API_KEY not set; leaving diesel.json as-is.", file=sys.stderr)
        return 0
    url = "https://api.eia.gov/v2/seriesid/" + SERIES_ID + "?" + urlencode({"api_key": key})
    with urlopen(url, timeout=30) as r:
        payload = json.loads(r.read().decode())
    rows = payload["response"]["data"]
    rows.sort(key=lambda x: x["period"])
    series = [{"week": r["period"], "price": float(r["value"])} for r in rows[-52:]]
    OUT.write_text(json.dumps({
        "source": "EIA · U.S. weekly on-highway diesel retail",
        "unit": "USD/gal",
        "series": series,
    }, indent=2))
    print(f"Wrote {len(series)} weeks to {OUT}")

if __name__ == "__main__":
    sys.exit(main())
