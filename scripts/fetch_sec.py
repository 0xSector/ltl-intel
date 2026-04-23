"""Stub SEC EDGAR fetcher for LTL carrier quarterly revenue.
Populates data/carrier_kpis.json from recent 10-Q / 8-K filings.

EDGAR is free and keyless but rate-limited — we must set a User-Agent.
Extracting operating ratio and yield reliably requires XBRL tag mapping,
which varies by filer. This script fetches the filing index and writes
the latest two quarters of total revenue for each ticker. A more
complete extraction (OR, yield, tonnage) requires parsing each filing's
earnings release exhibit, which is carrier-specific work.
"""
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "carrier_kpis.json"
UA = "ltl-intel research prototype contact@example.com"

TICKERS = {
    "ODFL":    "0000878927",
    "Saia":    "0001177702",
    "XPO":     "0001166003",
    "ArcBest": "0000894405",
}

def filings_index(cik):
    url = f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json"
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def main():
    out = {"note": "Live SEC EDGAR fetch. OR/yield/tonnage need per-filer XBRL mapping.", "carriers": []}
    for name, cik in TICKERS.items():
        try:
            idx = filings_index(cik)
            recent = idx["filings"]["recent"]
            hits = [i for i, f in enumerate(recent["form"]) if f in ("10-Q", "10-K")][:4]
            entries = [{
                "form": recent["form"][i],
                "date": recent["filingDate"][i],
                "accession": recent["accessionNumber"][i],
                "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{recent['accessionNumber'][i].replace('-', '')}/{recent['primaryDocument'][i]}",
            } for i in hits]
            out["carriers"].append({"name": name, "cik": cik, "recent_filings": entries})
        except Exception as e:
            print(f"[{name}] failed: {e}", file=sys.stderr)
    OUT.with_name("carrier_kpis_filings.json").write_text(json.dumps(out, indent=2))
    print(f"Wrote filings index. Per-filer extraction of OR/yield/tonnage is TODO.")

if __name__ == "__main__":
    sys.exit(main())
