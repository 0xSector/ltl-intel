"""Fetch FMCSA SAFER company snapshot data by DOT number.
Real data, no API key required. Parses the public HTML snapshot.

DOT numbers verified against SAFER legal-name match:
  ODFL         90849  OLD DOMINION FREIGHT LINE INC
  Saia         29124  SAIA MOTOR FREIGHT LINE LLC
  XPO          241829 XPO LOGISTICS FREIGHT INC (ex-Con-way, now XPO LTL)
  Estes        121018 ESTES EXPRESS LINES
  ABF          82866  ABF FREIGHT SYSTEM INC
  Schneider    264184 SCHNEIDER NATIONAL CARRIERS INC
  TFI          121058 TFORCE FREIGHT INC
  R+L          63391  GREENWOOD MOTOR LINES INC (DBA R L CARRIERS)
  Southeastern 63419  SOUTHEASTERN FREIGHT LINES LLC

Writes data/fmcsa.json.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "fmcsa.json"
UA = "Mozilla/5.0 (compatible; ltl-intel/0.1; research prototype)"

CARRIERS = {
    "ODFL":         "90849",
    "Saia":         "29124",
    "XPO":          "241829",
    "Estes":        "121018",
    "ArcBest":      "82866",
    "Schneider":    "264184",
    "TFI":          "121058",
    "R+L":          "63391",
    "Southeastern": "63419",
}


def fetch_snapshot(dot):
    url = "https://safer.fmcsa.dot.gov/query.asp?" + urlencode({
        "searchtype": "ANY",
        "query_type": "queryCarrierSnapshot",
        "query_param": "USDOT",
        "query_string": dot,
    })
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def _int(s):
    if s is None: return None
    try: return int(s.replace(",", ""))
    except ValueError: return None


def _float(s):
    if s is None: return None
    try: return float(s.rstrip("%"))
    except ValueError: return None


def parse_snapshot(html):
    """Pull salient fields from SAFER's plain-text company snapshot."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text)

    def pat(rx, cast=lambda x: x):
        m = re.search(rx, text)
        return cast(m.group(1)) if m else None

    # Legal name is between "Legal Name" and the next structural label
    legal = pat(r"Legal Name\s*:?\s*([A-Z][A-Z0-9 &,.\-/']+?)\s+(?:DBA|Physical|Phone|USDOT|Power Units)")

    # Inspections table: "Inspections 8818 15552 510 2"  → Vehicle Driver Hazmat IEP
    insp = re.search(r"Inspections\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+Out of Service", text)
    oos  = re.search(r"Out of Service\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+Out of Service %", text)
    oos_pct = re.search(r"Out of Service %\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%", text)

    # Crashes: "Fatal Injury Tow Total Crashes 10 237 459 706"
    crashes = re.search(r"Fatal\s+Injury\s+Tow\s+Total\s+Crashes\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)", text)

    # Safety rating block: "Rating Date: MM/DD/YYYY Review Date: MM/DD/YYYY Rating: Word Type: Word"
    rating_block = re.search(
        r"Rating Date:\s*(\d{1,2}/\d{1,2}/\d{4})\s*Review Date:\s*(\d{1,2}/\d{1,2}/\d{4})\s*Rating:\s*(\w+)\s*Type:\s*([\w-]+)",
        text,
    )

    return {
        "legal_name": (legal or "").strip() or None,
        "power_units": pat(r"Power Units:\s*([\d,]+)", _int),
        "drivers": pat(r"Drivers:\s*([\d,]+)", _int),
        "mcs150_date": pat(r"MCS-150 Form Date:\s*(\d{1,2}/\d{1,2}/\d{4})"),
        "inspections_24mo": {
            "vehicle": _int(insp.group(1)) if insp else None,
            "driver":  _int(insp.group(2)) if insp else None,
            "hazmat":  _int(insp.group(3)) if insp else None,
            "iep":     _int(insp.group(4)) if insp else None,
        },
        "out_of_service_24mo": {
            "vehicle": _int(oos.group(1)) if oos else None,
            "driver":  _int(oos.group(2)) if oos else None,
            "hazmat":  _int(oos.group(3)) if oos else None,
            "iep":     _int(oos.group(4)) if oos else None,
        },
        "out_of_service_pct": {
            "vehicle": _float(oos_pct.group(1)) if oos_pct else None,
            "driver":  _float(oos_pct.group(2)) if oos_pct else None,
            "hazmat":  _float(oos_pct.group(3)) if oos_pct else None,
            "iep":     _float(oos_pct.group(4)) if oos_pct else None,
        },
        "crashes_24mo": {
            "fatal":  _int(crashes.group(1)) if crashes else None,
            "injury": _int(crashes.group(2)) if crashes else None,
            "tow":    _int(crashes.group(3)) if crashes else None,
            "total":  _int(crashes.group(4)) if crashes else None,
        },
        "safety_rating": {
            "rating_date":  rating_block.group(1) if rating_block else None,
            "review_date":  rating_block.group(2) if rating_block else None,
            "rating":       rating_block.group(3) if rating_block else None,
            "type":         rating_block.group(4) if rating_block else None,
        },
    }


def main():
    results = []
    for name, dot in CARRIERS.items():
        try:
            html = fetch_snapshot(dot)
            parsed = parse_snapshot(html)
            parsed.update({"name": name, "dot": dot})
            results.append(parsed)
            pu = parsed.get("power_units")
            rating = (parsed.get("safety_rating") or {}).get("rating")
            print(f"[{name}] DOT {dot} · {parsed.get('legal_name')} · {pu} PU · {rating}")
        except Exception as e:
            print(f"[{name}] failed: {e}", file=sys.stderr)
            results.append({"name": name, "dot": dot, "error": str(e)})

    OUT.write_text(json.dumps({
        "note": "Parsed from FMCSA SAFER public company snapshot HTML. 24-month rolling inspection/crash counts.",
        "source_url_pattern": "https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string={DOT}",
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "carriers": results,
    }, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
