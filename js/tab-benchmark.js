window.TabBenchmark = {
  async mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="mb-6 card">
        <h3>What changed this week</h3>
        <p id="bm-summary" class="text-sm text-slate-700 leading-relaxed">Loading…</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="card">
          <h3>DOE diesel (weekly)</h3>
          <div id="bm-diesel-kpi" class="mb-2"></div>
          <canvas id="bm-diesel-chart" height="130"></canvas>
        </div>
        <div class="card">
          <h3>Carrier FSC (live, derived from diesel)</h3>
          <table class="data" id="bm-fsc-table">
            <thead><tr><th>Carrier</th><th class="text-right">FSC %</th><th class="text-right">Δ vs 13 wk ago</th></tr></thead>
            <tbody></tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2">Computed from each carrier's published linear FSC formula × this week's DOE diesel.</p>
        </div>
        <div class="card">
          <h3>Market indicators</h3>
          <div id="bm-indicators" class="space-y-3"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>FSC trend (52 weeks, all carriers)</h3>
          <canvas id="bm-fsc-history" height="160"></canvas>
          <p class="text-xs text-slate-500 mt-2">How much of the linehaul dollar is now FSC — critical renewal leverage.</p>
        </div>
        <div class="card">
          <h3>All-in cost calculator</h3>
          <label class="text-sm">Base linehaul ($)
            <input id="bm-base" type="number" value="1000" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/>
          </label>
          <table class="data mt-3" id="bm-allin-table">
            <thead><tr><th>Carrier</th><th class="text-right">FSC %</th><th class="text-right">FSC $</th><th class="text-right">All-in $</th></tr></thead>
            <tbody></tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2" id="bm-allin-spread"></p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Carrier yield trend (revenue per cwt)</h3>
          <canvas id="bm-yield-chart" height="160"></canvas>
        </div>
        <div class="card">
          <h3>Carrier operating ratio</h3>
          <canvas id="bm-or-chart" height="160"></canvas>
        </div>
      </div>

      <div class="card">
        <h3>Lane rate pulse · 1000 lb · class 70 (indicative)</h3>
        <table class="data">
          <thead><tr><th>Origin</th><th>Destination</th><th>Miles</th><th class="text-right">This week</th><th class="text-right">Prior week</th><th class="text-right">Δ</th></tr></thead>
          <tbody id="bm-lanes"></tbody>
        </table>
      </div>
    `;

    const [diesel, fsc, kpis, cass, lanes] = await Promise.all([
      fetch('data/diesel.json').then(r => r.json()),
      fetch('data/fsc_tables.json').then(r => r.json()),
      fetch('data/carrier_kpis.json').then(r => r.json()),
      fetch('data/cass_lmi.json').then(r => r.json()),
      fetch('data/lane_pulse.json').then(r => r.json()),
    ]);

    const dlast = diesel.series.at(-1), dprior = diesel.series.at(-2);
    const ddelta = dlast.price - dprior.price;
    const d13wk = diesel.series.at(-14) || diesel.series[0];
    document.getElementById('bm-diesel-kpi').innerHTML = `
      <div class="kpi">$${dlast.price.toFixed(3)}</div>
      <div class="kpi-sub">per gallon · ${dlast.week} ·
        <span class="${ddelta >= 0 ? 'delta-up' : 'delta-down'}">${ddelta >= 0 ? '+' : ''}${ddelta.toFixed(3)}</span> w/w ·
        <span class="${dlast.price - d13wk.price >= 0 ? 'delta-up' : 'delta-down'}">${dlast.price - d13wk.price >= 0 ? '+' : ''}$${(dlast.price - d13wk.price).toFixed(2)}</span> vs 13 wk ago</div>
    `;
    new Chart(document.getElementById('bm-diesel-chart'), {
      type: 'line',
      data: {
        labels: diesel.series.map(p => p.week.slice(5)),
        datasets: [{ data: diesel.series.map(p => p.price), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', fill: true, tension: 0.25, pointRadius: 0 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } },
    });

    const fscNow   = FSC.computeAll(dlast.price,   fsc.carriers);
    const fsc13wk  = FSC.computeAll(d13wk.price,   fsc.carriers);

    const fscEntries = Object.entries(fscNow).sort((a, b) => b[1] - a[1]);
    document.querySelector('#bm-fsc-table tbody').innerHTML = fscEntries.map(([name, pct]) => {
      const delta = pct - fsc13wk[name];
      const cls = delta >= 0 ? 'delta-up' : 'delta-down';
      return `<tr>
        <td>${name}</td>
        <td class="text-right font-medium">${pct.toFixed(1)}%</td>
        <td class="text-right ${cls}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp</td>
      </tr>`;
    }).join('');

    const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const carrierNames = Object.keys(fsc.carriers);
    new Chart(document.getElementById('bm-fsc-history'), {
      type: 'line',
      data: {
        labels: diesel.series.map(p => p.week.slice(5)),
        datasets: carrierNames.map((name, i) => ({
          label: name,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length],
          data: diesel.series.map(p => FSC.compute(p.price, fsc.carriers[name])),
          tension: 0.25, pointRadius: 0, borderWidth: 1.5,
        })),
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { y: { ticks: { callback: v => v + '%' } } } },
    });

    const renderAllIn = () => {
      const base = Math.max(0, +document.getElementById('bm-base').value || 0);
      const rows = fscEntries.map(([name, pct]) => {
        const fscDollars = base * pct / 100;
        return { name, pct, fscDollars, allIn: base + fscDollars };
      });
      document.querySelector('#bm-allin-table tbody').innerHTML = rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td class="text-right text-slate-500">${r.pct.toFixed(1)}%</td>
          <td class="text-right">$${r.fscDollars.toFixed(2)}</td>
          <td class="text-right font-medium">$${r.allIn.toFixed(2)}</td>
        </tr>
      `).join('');
      const hi = rows[0].allIn, lo = rows[rows.length - 1].allIn;
      document.getElementById('bm-allin-spread').textContent =
        `Spread between most and least expensive FSC: $${(hi - lo).toFixed(2)} on a $${base} linehaul (${(((hi - lo) / base) * 100).toFixed(1)}%).`;
    };
    document.getElementById('bm-base').addEventListener('input', renderAllIn);
    renderAllIn();

    const ind = cass.indicators;
    document.getElementById('bm-indicators').innerHTML = Object.entries(ind).map(([k, v]) => {
      const delta = v.latest - v.prior;
      const cls = delta >= 0 ? 'delta-up' : 'delta-down';
      return `
        <div class="flex items-baseline justify-between">
          <div class="text-sm text-slate-600">${k.replace(/_/g, ' ')}</div>
          <div class="text-sm"><span class="font-semibold">${v.latest.toFixed(1)}</span>
            <span class="${cls} ml-2 text-xs">${delta >= 0 ? '+' : ''}${delta.toFixed(1)} m/m</span>
            <span class="text-slate-400 ml-2 text-xs">${v.yoy_pct >= 0 ? '+' : ''}${v.yoy_pct}% YoY</span>
          </div>
        </div>`;
    }).join('');

    const kpiPalette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b'];
    const periods = kpis.carriers[0].history.map(h => h.period);
    new Chart(document.getElementById('bm-yield-chart'), {
      type: 'line',
      data: {
        labels: periods,
        datasets: kpis.carriers.map((c, i) => ({
          label: c.name, borderColor: kpiPalette[i], backgroundColor: kpiPalette[i],
          data: c.history.map(h => h.yield), tension: 0.25,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
    new Chart(document.getElementById('bm-or-chart'), {
      type: 'line',
      data: {
        labels: periods,
        datasets: kpis.carriers.map((c, i) => ({
          label: c.name, borderColor: kpiPalette[i], backgroundColor: kpiPalette[i],
          data: c.history.map(h => h.or), tension: 0.25,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });

    document.getElementById('bm-lanes').innerHTML = lanes.lanes.map(l => {
      const delta = l.this_wk - l.prior_wk;
      const cls = delta >= 0 ? 'delta-up' : 'delta-down';
      return `<tr>
        <td>${l.origin}</td><td>${l.dest}</td>
        <td class="text-slate-500">${l.miles.toLocaleString()}</td>
        <td class="text-right font-medium">$${l.this_wk}</td>
        <td class="text-right text-slate-500">$${l.prior_wk}</td>
        <td class="text-right ${cls}">${delta >= 0 ? '+' : ''}${delta} (${l.change_pct >= 0 ? '+' : ''}${l.change_pct}%)</td>
      </tr>`;
    }).join('');

    const fscAvg = fscEntries.reduce((s, [, p]) => s + p, 0) / fscEntries.length;
    const fscAvg13 = Object.values(fsc13wk).reduce((s, v) => s + v, 0) / Object.keys(fsc13wk).length;
    const lmi = ind.LMI_Headline.latest;
    const lmiTrend = lmi > 55 ? 'expansion' : lmi > 50 ? 'tepid expansion' : 'contraction';
    document.getElementById('bm-summary').textContent =
      `Diesel ${ddelta >= 0 ? 'up' : 'down'} $${Math.abs(ddelta).toFixed(3)} w/w to $${dlast.price.toFixed(3)}, ` +
      `$${(dlast.price - d13wk.price).toFixed(2)} over 13 weeks. ` +
      `Average LTL FSC now ${fscAvg.toFixed(1)}% (was ${fscAvg13.toFixed(1)}% 13 weeks ago — ${(fscAvg - fscAvg13 >= 0 ? '+' : '')}${(fscAvg - fscAvg13).toFixed(1)}pp). ` +
      `Every $1,000 of linehaul now carries an extra $${((fscAvg - fscAvg13) * 10).toFixed(0)} of FSC vs a quarter ago — material renewal leverage. ` +
      `LMI ${lmi} (${lmiTrend}); ATA tonnage ${ind.ATA_Tonnage.yoy_pct >= 0 ? '+' : ''}${ind.ATA_Tonnage.yoy_pct}% YoY.`;
  }
};
