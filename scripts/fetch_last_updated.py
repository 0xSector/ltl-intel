"""Stamps data/last_updated.json with today's date."""
import json
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "last_updated.json"
OUT.write_text(json.dumps({"date": date.today().isoformat(), "source": "github action"}, indent=2))
print(f"Stamped {OUT}")
