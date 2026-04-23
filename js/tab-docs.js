window.TabDocs = {
  mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="mb-6 card">
        <h3>What this is</h3>
        <p class="text-sm text-slate-700 leading-relaxed">
          A public-data LTL pricing dashboard: market benchmarks, NMFC class math, carrier financials & safety,
          a Thule-specific framework, a density-audit tool, and a lane quote prototype.
          Static site hosted on GitHub Pages; a weekly GitHub Action refreshes data from public APIs.
          Not affiliated with Schneider National or Thule Group. No internal or proprietary data.
        </p>
      </div>

      <div class="mb-6 card">
        <h3>Data sources</h3>
        <div class="scroll-x">
        <table class="data text-xs">
          <thead><tr><th>Source</th><th>What it provides</th><th>Refresh</th><th>Auth</th></tr></thead>
          <tbody>
            <tr><td><b>EIA Petroleum API</b></td><td>U.S. weekly on-highway diesel retail price (52-week history)</td><td>Weekly (Mondays)</td><td>Free key</td></tr>
            <tr><td><b>SEC XBRL companyfacts</b></td><td>Quarterly revenue &amp; operating income → OR for ODFL, Saia, XPO, ArcBest</td><td>Weekly (picks up new filings)</td><td>None</td></tr>
            <tr><td><b>SEC 8-K earnings releases</b></td><td>LTL revenue per cwt (yield) — ODFL &amp; Saia, 6 quarters</td><td>Quarterly when filed</td><td>None</td></tr>
            <tr><td><b>FMCSA SAFER</b></td><td>Power units, drivers, 24mo inspections &amp; OOS, crashes, safety rating</td><td>Weekly</td><td>None</td></tr>
            <tr><td><b>Cass Information Systems</b></td><td>CASS Freight Index — shipments &amp; expenditures (monthly)</td><td>Monthly</td><td>None</td></tr>
            <tr><td><b>Logistics Managers' Index</b></td><td>LMI headline (expansion/contraction signal)</td><td>Monthly</td><td>None</td></tr>
            <tr><td><b>American Trucking Assns.</b></td><td>Truck tonnage index with MoM/YoY</td><td>Monthly</td><td>None</td></tr>
            <tr><td><b>Carrier tariff PDFs</b></td><td>Exact FSC tables — ODFL 128-CC, SAIA 170-D, XPO CNWY 190-Q</td><td>Manual when tariffs republished</td><td>None</td></tr>
            <tr><td><b>Zippopotam.us</b></td><td>ZIP → city, state, lat/lon (Tab F geocoding)</td><td>On demand</td><td>None</td></tr>
            <tr><td><b>OpenStreetMap via Carto</b></td><td>Tab D map tiles</td><td>On demand</td><td>None</td></tr>
          </tbody>
        </table>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Tab A · Market Benchmark</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            FSC % computed per carrier from each week's DOE diesel. Four of nine carriers (Schneider, ODFL, Saia, XPO)
            use stepped lookup tables calibrated against published tariffs; remaining five use linear approximations
            (labeled <span class="chip bg-slate-100 text-slate-600">est.</span>).
            Revenue + OR from SEC XBRL, filtered to standalone quarters by duration (85–95 days) to exclude YTD-cumulative entries.
            Yield parsed from 8-K Exhibit 99.1 operating statistics tables.
            Indicators pulled fresh monthly.
          </p>
        </div>

        <div class="card">
          <h3>Tab B · Class Calculator</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            Density = weight ÷ (L × W × H ÷ 1728). Class derived from the standard NMFC density-only scale
            (50–500). Break-even weight shows the lbs needed to move down to the next denser bracket.
            Mixed-pallet mode sums all items and classes on the aggregate density.
            Class rate multipliers used for the Density Audit's $ impact are approximate LTL tariff ratios, not CzarLite.
          </p>
        </div>

        <div class="card">
          <h3>Tab C · Carrier Scorecard</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            Joins three sources by carrier name: <b>carriers_static.json</b> (HQ, ticker, editorial strengths),
            <b>carrier_kpis.json</b> (SEC quarterly revenue &amp; OR), <b>fmcsa.json</b> (SAFER fleet + safety).
            Revenue shown as annualized (latest quarter × 4). Private carriers (Estes, R+L, Southeastern) have no
            SEC financials — safety + fleet only.
            DOT numbers verified by legal-name match against SAFER's response.
          </p>
        </div>

        <div class="card">
          <h3>Tab D · Thule Intel</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            Framework only, not real account data. Each section tagged:
            <span class="chip bg-emerald-100 text-emerald-700">real</span> facilities verified from public filings;
            <span class="chip bg-amber-100 text-amber-800">inferred</span> port lanes / DC footprint from public clues;
            <span class="chip bg-rose-100 text-rose-800">illustrative</span> seasonality curves are educated guesses.
            For a real account brief, pair this structure with ImportGenius/Panjiva imports and actual shipment history.
          </p>
        </div>

        <div class="card">
          <h3>Tab E · Density Audit</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            Paste a CSV of shipment records (many column aliases accepted: bol/id, length/l, width/w, height/h, weight/wt, qty, class, rate).
            Computes actual density per row, compares to declared class, flags overdeclared / underdeclared / missing-dims.
            $ impact uses the same approximate class rate ratios as Tab B.
            All processing happens in your browser — CSV never leaves the page.
          </p>
        </div>

        <div class="card">
          <h3>Tab F · Lane Pricing</h3>
          <p class="text-xs text-slate-700 leading-relaxed">
            ZIP → lat/lon via Zippopotam.us. Distance = great-circle haversine × 1.22 circuity factor
            (approximates PC*Miler HHG miles, ±15% in mountainous/coastal regions).
            Rate model: base $/cwt by weight band × distance taper × class multiplier, floored at $125 min charge.
            Rate parameters are <b>illustrative</b>, not a real tariff — use for sanity checks, not quotes.
            FSC applied from Tab A's engine.
          </p>
        </div>
      </div>

      <div class="card mb-6">
        <h3>Known limitations</h3>
        <ul class="text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <li>• <b>FSC approximations</b> — 5 of 9 carriers (Estes, ArcBest, TFI, R+L, Southeastern) still use linear formulas; ±1–3pp error vs actual published tables.</li>
          <li>• <b>Yield coverage</b> — only ODFL &amp; Saia. XPO and ArcBest publish yield differently and would need per-filer 8-K parsers.</li>
          <li>• <b>Tab F rate model</b> — illustrative, not calibrated against CzarLite or any specific carrier tariff.</li>
          <li>• <b>Tab F distances</b> — haversine × 1.22, not actual routing. Consult PC*Miler for RFP-grade miles.</li>
          <li>• <b>Schneider FSC table</b> — hand-built approximation, needs verification against published PDF.</li>
          <li>• <b>Tab D</b> — no proprietary Thule data. Seasonality is illustrative, container volumes are estimates.</li>
          <li>• <b>ATA YoY</b> — sometimes absent from press releases (regex doesn't always hit); MoM is reliable.</li>
        </ul>
      </div>

      <div class="card mb-6">
        <h3>Future improvements · paid endpoints worth adding</h3>
        <p class="text-xs text-slate-500 mb-3">Public data gets us ~80% of the way. These paid sources would close the remaining gap where it matters most.</p>
        <div class="scroll-x">
        <table class="data text-xs">
          <thead><tr><th>Source</th><th>Unlocks</th><th>Fits tab</th></tr></thead>
          <tbody>
            <tr><td><b>SMC³ CzarLite / RateWare XL</b></td><td>Real LTL base tariff rates — replaces Tab F's illustrative rate model with defensible quotes</td><td>F · Lane Pricing</td></tr>
            <tr><td><b>PC*Miler API</b> (Trimble)</td><td>Actual road routing &amp; HHG miles — removes haversine ±15% error</td><td>F · Lane Pricing</td></tr>
            <tr><td><b>DAT iQ / RateView</b></td><td>Real lane rate benchmarks &amp; 12-month history by origin-dest-equipment — restores a real "lane pulse"</td><td>A · Market Benchmark</td></tr>
            <tr><td><b>FreightWaves SONAR</b></td><td>Real-time tender volume/rejection indices per lane — leading indicator for LTL pricing by 4–6 weeks</td><td>A · Market Benchmark</td></tr>
            <tr><td><b>ImportGenius / Panjiva full</b></td><td>Real inbound BOL data — replaces Tab D's inferred container estimates with actual shipper-carrier relationships</td><td>D · Thule Intel</td></tr>
            <tr><td><b>NMFTA ClassIT</b></td><td>Item-specific NMFC class lookups (handling/stowability/liability, not just density)</td><td>B · Class Calc · E · Density Audit</td></tr>
            <tr><td><b>Mastio Quality Awards</b></td><td>Shipper-surveyed LTL service rankings — the industry-standard qualitative benchmark</td><td>C · Carrier Scorecard</td></tr>
            <tr><td><b>FMCSA SMS subscription API</b></td><td>Detailed BASIC percentile scores beyond SAFER's public snapshot</td><td>C · Carrier Scorecard</td></tr>
            <tr><td><b>Carrier EDI 210/214 feeds</b></td><td>Real shipment-level data from your own accounts — would make Tab E run on live data instead of CSV paste</td><td>E · Density Audit</td></tr>
          </tbody>
        </table>
        </div>
      </div>

      <div class="card mb-6">
        <h3>Future improvements · free but unbuilt</h3>
        <ul class="text-xs text-slate-700 space-y-1.5 leading-relaxed">
          <li>• <b>Exact FSC tables for remaining 5 carriers</b> (Estes, ArcBest, TFI, R+L, Southeastern) — transcribe published tariffs to replace linear approximations.</li>
          <li>• <b>Yield extraction for XPO &amp; ArcBest</b> — per-filer 8-K parsers for their operating statistics format.</li>
          <li>• <b>OSRM public demo routing</b> — free road distance for Tab F (rate-limited but workable for light use).</li>
          <li>• <b>Deep-linkable tab state</b> — URL hash so comparisons in Tab C are shareable.</li>
          <li>• <b>RSS/alerts feed</b> — weekly digest of what changed, published from the GitHub Action.</li>
          <li>• <b>Chart PNG export</b> — one-click download for slide decks.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Refresh pipeline</h3>
        <p class="text-xs text-slate-700 leading-relaxed mb-2">
          <b>.github/workflows/refresh-data.yml</b> runs every Monday at 14:00 UTC (10 AM ET) and on manual dispatch.
          Each step runs an independent Python fetcher; failures in one source don't block the others.
        </p>
        <ol class="text-xs text-slate-700 space-y-1 list-decimal list-inside leading-relaxed">
          <li><code>fetch_diesel.py</code> — EIA API → <code>data/diesel.json</code></li>
          <li><code>fetch_sec.py</code> — SEC XBRL → <code>data/carrier_kpis.json</code></li>
          <li><code>fetch_yields.py</code> — SEC 8-Ks → <code>data/yields.json</code></li>
          <li><code>fetch_fmcsa.py</code> — SAFER → <code>data/fmcsa.json</code></li>
          <li><code>fetch_market_indicators.py</code> — CASS/LMI/ATA → <code>data/cass_lmi.json</code></li>
          <li><code>build_fsc_tables.py</code> — regenerates <code>data/fsc_tables.json</code> from tariff anchors</li>
          <li><code>fetch_last_updated.py</code> — stamps <code>data/last_updated.json</code></li>
          <li>Commit if changed → Pages redeploys automatically.</li>
        </ol>
        <p class="text-xs text-slate-500 mt-3">
          Source: <a class="underline" href="https://github.com/0xSector/ltl-intel" target="_blank">github.com/0xSector/ltl-intel</a> ·
          Stack: Tailwind + Alpine.js + Chart.js + Leaflet via CDN · No build step.
        </p>
      </div>
    `;
  }
};
