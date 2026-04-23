"""Extract LTL revenue per hundredweight (yield) from quarterly 8-K earnings releases.

Yield is not a GAAP XBRL concept, but each carrier publishes it in a consistent
table inside their 8-K Exhibit 99.1 (earnings press release). This script:
  1. Fetches the carrier's submissions index
  2. Finds the 4 most recent quarterly earnings 8-Ks (not 'other events' 8-Ks)
  3. Downloads each 8-K's Exhibit 99.1 and regex-extracts yield

Writes data/yields.json.

Supported carriers: ODFL, Saia. ArcBest and XPO use different table formats
and would need their own parsers — noted in output.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "yields.json"
UA = "ltl-intel research contact@example.com"

CARRIERS = {
    "ODFL": {"cik": "0000878927"},
    "Saia": {"cik": "0001177702"},
}


def fetch(url):
    req = Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def _clean(html):
    t = re.sub(r"<[^>]+>", " ", html)
    t = t.replace("&nbsp;", " ").replace("&#160;", " ").replace("&#x2014;", "—")
    t = re.sub(r"\$\s+", "$", t)
    return re.sub(r"\s+", " ", t)


def find_quarterly_8ks(cik, limit=6):
    idx = json.loads(fetch(f"https://data.sec.gov/submissions/CIK{cik}.json"))
    recent = idx["filings"]["recent"]
    out = []
    for i, form in enumerate(recent["form"]):
        if form != "8-K":
            continue
        item = (recent.get("items") or [""])[i] if "items" in recent else ""
        # Item 2.02 = Results of Operations — quarterly earnings releases
        # Many filers also tag 9.01 (Financial Statements and Exhibits) — we need both
        if "2.02" in item:
            out.append({
                "date": recent["filingDate"][i],
                "accession": recent["accessionNumber"][i],
                "doc": recent["primaryDocument"][i],
            })
        if len(out) >= limit:
            break
    return out


def find_exhibit_99(accession, cik):
    """List files in the 8-K accession folder; return the ex99 path."""
    acc_clean = accession.replace("-", "")
    idx_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/"
    html = fetch(idx_url)
    # Prefer ex99_1 / ex-99-1 / exhibit991 patterns
    candidates = re.findall(r'href="([^"]*ex[-_]?99[^"]*\.htm)"', html, re.IGNORECASE)
    if not candidates:
        return None
    # Filter to this accession's folder
    hits = [c for c in candidates if acc_clean in c]
    return ("https://www.sec.gov" + hits[0]) if hits else None


YIELD_PATTERNS = [
    # ODFL: "LTL revenue per hundredweight $33.91 $32.10"
    r"LTL revenue per hundredweight\s+\$([\d.,]+)",
    # Saia: "LTL revenue/cwt. $25.76"
    r"LTL revenue/cwt\.?\s+\$([\d.,]+)",
    # Generic fallbacks
    r"Revenue per hundredweight\s*\(?\$?\)?\s+\$?([\d.,]+)",
    r"Revenue per (?:100 pounds|cwt|hundredweight)\s+\$?([\d.,]+)",
]


def extract_yield(html):
    text = _clean(html)
    for pat in YIELD_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", "")), pat
            except ValueError:
                continue
    return None, None


def period_from_filing_date(date_str):
    """8-K filed in Feb = Q4 prior year; Apr/May = Q1; Jul/Aug = Q2; Oct/Nov = Q3."""
    y, m, _ = date_str.split("-")
    m = int(m)
    if m <= 2:   return f"{int(y)-1}Q4"
    if m <= 5:   return f"{y}Q1"
    if m <= 8:   return f"{y}Q2"
    if m <= 11:  return f"{y}Q3"
    return f"{y}Q4"


def main():
    results = {"fetched_at": datetime.utcnow().isoformat() + "Z", "carriers": []}
    for name, cfg in CARRIERS.items():
        entries = []
        try:
            eights = find_quarterly_8ks(cfg["cik"], limit=8)
            for filing in eights[:6]:
                ex99 = find_exhibit_99(filing["accession"], cfg["cik"])
                if not ex99:
                    continue
                html = fetch(ex99)
                yld, pat = extract_yield(html)
                if yld is None:
                    continue
                entries.append({
                    "period": period_from_filing_date(filing["date"]),
                    "filing_date": filing["date"],
                    "yield_per_cwt": yld,
                    "source_url": ex99,
                })
            # Dedupe by period, keep latest filing
            dedup = {}
            for e in entries:
                if e["period"] not in dedup or e["filing_date"] > dedup[e["period"]]["filing_date"]:
                    dedup[e["period"]] = e
            quarters = sorted(dedup.values(), key=lambda x: x["period"])
            results["carriers"].append({"name": name, "cik": cfg["cik"], "history": quarters})
            print(f"[{name}] {len(quarters)} quarters · latest {quarters[-1]['period'] if quarters else 'n/a'} · ${quarters[-1]['yield_per_cwt']:.2f}" if quarters else f"[{name}] no yields extracted")
        except Exception as e:
            print(f"[{name}] failed: {e}", file=sys.stderr)
            results["carriers"].append({"name": name, "cik": cfg["cik"], "error": str(e)})
    OUT.write_text(json.dumps(results, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
