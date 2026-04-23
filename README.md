# LTL Intel

A public-data dashboard for an LTL pricing analyst. Four tabs:

- **A · Market Benchmark** — DOE diesel, carrier FSC, CASS/LMI/ATA indicators, quarterly yield & OR trend, representative lane rate pulse.
- **B · Class Calculator** — Density-based NMFC classification, break-even weight to next class, mixed-pallet calculator, PDF export.
- **C · Carrier Scorecard** — One card per major LTL carrier (ODFL, Saia, XPO, Estes, ArcBest, TFI, R+L, Southeastern, Schneider). Side-by-side comparison.
- **D · Thule Intel** — Public-data brief on Thule Group: facility map, inferred inbound ocean lanes, outbound seasonality, retail DC footprint, renewal talking points.

**Stack:** static HTML + Tailwind + Alpine.js + Chart.js + Leaflet. No build step. GitHub Pages deploy. A weekly GitHub Action refreshes data via public APIs (EIA, SEC EDGAR).

**Not affiliated with Schneider National or Thule Group. All data is public or illustrative.**

## Develop locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Pushed to `main` → served by GitHub Pages at `https://0xsector.github.io/ltl-intel/`.

## Refresh data

- Automated: `.github/workflows/refresh-data.yml` runs Mondays 14:00 UTC. Needs `EIA_API_KEY` as a repo secret.
- Manual: `python scripts/fetch_diesel.py && python scripts/fetch_sec.py && python scripts/fetch_last_updated.py`
