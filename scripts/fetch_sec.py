"""Fetch quarterly revenue and operating income for LTL carriers from SEC XBRL
(companyfacts API). Derives operating ratio = 1 - (OperatingIncome / Revenue).

SEC's companyfacts API returns all GAAP concepts reported by a filer. We look
for a revenue concept and an operating income concept. Different filers use
different XBRL tags for "revenue" — we try several.

Writes data/carrier_kpis.json. Yield and tonnage aren't standard GAAP concepts,
so those remain seed data flagged with `source: "seed"` in the output.
"""
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "carrier_kpis.json"
UA = "ltl-intel research prototype contact@example.com"

FILERS = {
    "ODFL":    "0000878927",
    "Saia":    "0001177702",
    "XPO":     "0001166003",
    "ArcBest": "0000894405",
}

REVENUE_TAGS = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueServicesNet",
]
OPINC_TAGS = ["OperatingIncomeLoss"]


def companyfacts(cik):
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{int(cik):010d}.json"
    req = Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _days_between(start, end):
    s = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(end, "%Y-%m-%d")
    return (e - s).days


def _period_from_end(end_str):
    """Derive 'YYYYQn' from end date, independent of SEC's fy/fp fields."""
    end = datetime.strptime(end_str, "%Y-%m-%d")
    q = (end.month - 1) // 3 + 1
    return f"{end.year}Q{q}"


def extract_quarterly(facts, tag_candidates):
    """Return (tag_used, [{period, end, value, filed}]) for the candidate tag with
    the most recent data. Only keeps entries whose duration is ~one quarter
    (85-95 days), filtering out YTD-cumulative entries that appear in the same feed.
    """
    ns = facts.get("facts", {}).get("us-gaap", {})
    best_tag, best_rows, best_latest = None, [], ""
    for tag in tag_candidates:
        if tag not in ns:
            continue
        entries = ns[tag].get("units", {}).get("USD", [])
        qtrly = []
        for e in entries:
            start, end = e.get("start"), e.get("end")
            if not start or not end:
                continue
            dur = _days_between(start, end)
            if not (85 <= dur <= 95):  # standalone quarter only
                continue
            qtrly.append({
                "period": _period_from_end(end),
                "end": end,
                "value": float(e["val"]),
                "filed": e.get("filed", ""),
            })
        dedup = {}
        for q in qtrly:
            key = q["period"]
            if key not in dedup or q["filed"] > dedup[key]["filed"]:
                dedup[key] = q
        rows = sorted(dedup.values(), key=lambda x: x["end"])
        if not rows:
            continue
        latest = rows[-1]["end"]
        if latest > best_latest:
            best_tag, best_rows, best_latest = tag, rows, latest
    return best_tag, best_rows


def main():
    out_carriers = []
    for name, cik in FILERS.items():
        try:
            facts = companyfacts(cik)
            rev_tag, rev = extract_quarterly(facts, REVENUE_TAGS)
            _,       opi = extract_quarterly(facts, OPINC_TAGS)
            # Align on period
            opi_by_period = {q["period"]: q["value"] for q in opi}
            history = []
            for q in rev[-8:]:  # last 8 quarters
                p = q["period"]
                entry = {
                    "period": p,
                    "end": q["end"],
                    "revenue_usd": q["value"],
                }
                if p in opi_by_period and q["value"]:
                    entry["operating_income_usd"] = opi_by_period[p]
                    entry["operating_ratio_pct"] = round(100.0 * (1 - opi_by_period[p] / q["value"]), 2)
                history.append(entry)
            out_carriers.append({
                "name": name,
                "cik": cik,
                "revenue_tag_used": rev_tag,
                "history": history,
                "source": "sec_companyfacts",
            })
            print(f"[{name}] OK · {len(history)} quarters, latest {history[-1]['period'] if history else 'n/a'}")
        except Exception as e:
            print(f"[{name}] failed: {e}", file=sys.stderr)
            out_carriers.append({"name": name, "cik": cik, "error": str(e)})

    OUT.write_text(json.dumps({
        "note": "Quarterly revenue + derived operating ratio from SEC XBRL companyfacts. Yield and tonnage are carrier-specific metrics not in GAAP XBRL — they require parsing earnings releases separately.",
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "carriers": out_carriers,
    }, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
