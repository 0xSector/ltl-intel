"""Fetch monthly trucking market indicators: CASS Freight Index, LMI, ATA Truck Tonnage.
Static HTML sources, no API key required. Graceful fallback — keeps existing seed
values if a source layout changes.

Writes data/cass_lmi.json.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parents[1] / "data" / "cass_lmi.json"
UA = "Mozilla/5.0 (compatible; ltl-intel/0.1; research prototype)"


def fetch(url):
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def _text(html):
    t = re.sub(r"<[^>]+>", " ", html)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", t)


# --- CASS -----------------------------------------------------------------
CASS_ARCHIVE = "https://www.cassinfo.com/freight-audit-payment/cass-transportation-indexes/freight-index-archives"

def fetch_cass():
    """Find the newest monthly page from the archive listing, fetch it, extract values."""
    archive = fetch(CASS_ARCHIVE)
    # Month slug links like /cass-transportation-indexes/march-2026
    slugs = re.findall(r"/cass-transportation-indexes/([a-z]+-\d{4})", archive)
    if not slugs:
        raise RuntimeError("no cass monthly slugs found")
    months = ["january","february","march","april","may","june","july","august","september","october","november","december"]
    def sort_key(s):
        try:
            name, year = s.rsplit("-", 1)
            return (int(year), months.index(name))
        except Exception:
            return (0, 0)
    latest = max(set(slugs), key=sort_key)
    page_url = f"https://www.cassinfo.com/freight-audit-payment/cass-transportation-indexes/{latest}"
    page = fetch(page_url)
    text = _text(page)
    # Look for "Shipments ... X.XXX" and "Expenditures ... X.XXX"
    # In the February 2026 page the table rows show "Shipments Index 0.978" and "Expenditures Index 3.143"
    ship = re.search(r"Shipments(?:\s+Index)?\s*[-:]?\s*([\d]+\.\d{2,3})", text)
    exp  = re.search(r"Expenditures(?:\s+Index)?\s*[-:]?\s*([\d]+\.\d{2,3})", text)
    return {
        "shipments_index": float(ship.group(1)) if ship else None,
        "expenditures_index": float(exp.group(1)) if exp else None,
        "period_slug": latest,
        "source_url": page_url,
    }


# --- LMI ------------------------------------------------------------------
LMI_HOME = "https://www.the-lmi.com/"

def fetch_lmi():
    home = fetch(LMI_HOME)
    # Find links to month-YYYY-logistics-managers-index.html
    slugs = re.findall(r"/([a-z]+-\d{4})-logistics-managers-index\.html", home)
    if not slugs:
        raise RuntimeError("no lmi monthly slugs found")
    months = ["january","february","march","april","may","june","july","august","september","october","november","december"]
    def sort_key(s):
        try:
            name, year = s.rsplit("-", 1)
            return (int(year), months.index(name))
        except Exception:
            return (0, 0)
    latest = max(set(slugs), key=sort_key)
    page_url = f"https://www.the-lmi.com/{latest}-logistics-managers-index.html"
    page = fetch(page_url)
    text = _text(page)
    # Headline: "reads in at 65.7" or "Index reads in at 65.7"
    m = re.search(r"reads? in at\s+([\d]+\.\d+)", text, re.IGNORECASE)
    if not m:
        m = re.search(r"LMI\s*=?\s*([\d]+\.\d+)", text)
    return {
        "headline": float(m.group(1)) if m else None,
        "period_slug": latest,
        "source_url": page_url,
    }


# --- ATA ------------------------------------------------------------------
ATA_LIST = "https://www.trucking.org/news-insights"

def fetch_ata():
    listing = fetch(ATA_LIST)
    # Find hrefs containing 'ata-truck-tonnage-index'
    links = re.findall(r'href="([^"]*ata-truck-tonnage-index[^"]+)"', listing)
    if not links:
        raise RuntimeError("no ATA tonnage links found")
    # Take the first (most recent on listing)
    href = links[0]
    page_url = href if href.startswith("http") else "https://www.trucking.org" + href
    page = fetch(page_url)
    text = _text(page)
    # "Index equaled 117.0" or "Index was 117.0" in first paragraphs
    m = re.search(r"[Ii]ndex\s+(?:equaled|was|registered|came in at|stood at|advanced to|rose to|fell to|edged to)\s+([\d]+\.\d+)", text)
    if not m:
        m = re.search(r"Index\s+([\d]+\.\d+)", text)
    # Try to grab MoM and YoY
    mom = re.search(r"up\s+([\d.]+)%\s+(?:from|compared|over\s+February|over\s+[A-Z][a-z]+)", text)
    yoy = re.search(r"(?:year-over-year|YoY|compared with.{0,40}last year).{0,40}?([-+]?[\d.]+)%", text)
    return {
        "tonnage_index": float(m.group(1)) if m else None,
        "mom_pct": float(mom.group(1)) if mom else None,
        "yoy_pct": float(yoy.group(1)) if yoy else None,
        "source_url": page_url,
    }


def main():
    results = {
        "note": "Scraped from public monthly releases. CASS Information Systems, Logistics Managers' Index, American Trucking Associations.",
        "fetched_at": datetime.utcnow().isoformat() + "Z",
    }
    for key, fn in [("cass", fetch_cass), ("lmi", fetch_lmi), ("ata", fetch_ata)]:
        try:
            results[key] = fn()
            print(f"[{key}] OK · {results[key]}")
        except Exception as e:
            print(f"[{key}] failed: {e}", file=sys.stderr)
            results[key] = {"error": str(e)}
    # Keep the Tab A UI schema consistent — nest into indicators dict
    indicators = {}
    if isinstance(results.get("cass"), dict) and "shipments_index" in results["cass"]:
        indicators["CASS_Shipments"]    = {"latest": results["cass"]["shipments_index"]}
        indicators["CASS_Expenditures"] = {"latest": results["cass"]["expenditures_index"]}
    if isinstance(results.get("lmi"), dict) and "headline" in results["lmi"]:
        indicators["LMI_Headline"]      = {"latest": results["lmi"]["headline"]}
    if isinstance(results.get("ata"), dict) and "tonnage_index" in results["ata"]:
        ata = results["ata"]
        indicators["ATA_Tonnage"]       = {"latest": ata["tonnage_index"], "mom_pct": ata.get("mom_pct"), "yoy_pct": ata.get("yoy_pct")}
    results["indicators"] = indicators
    OUT.write_text(json.dumps(results, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
