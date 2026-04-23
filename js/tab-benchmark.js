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
          <h3>Carrier FSC (current)</h3>
          <table class="data" id="bm-fsc-table">
            <thead><tr><th>Carrier</th><th class="text-right">FSC %</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="card">
          <h3>Market indicators</h3>
          <div id="bm-indicators" class="space-y-3"></div>
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
    document.getElementById('bm-diesel-kpi').innerHTML = `
      <div class="kpi">$${dlast.price.toFixed(3)}</div>
      <div class="kpi-sub">per gallon · ${dlast.week} ·
        <span class="${ddelta >= 0 ? 'delta-up' : 'delta-down'}">${ddelta >= 0 ? '+' : ''}${ddelta.toFixed(3)}</span> w/w</div>
    `;
    new Chart(document.getElementById('bm-diesel-chart'), {
      type: 'line',
      data: {
        labels: diesel.series.map(p => p.week.slice(5)),
        datasets: [{ data: diesel.series.map(p => p.price), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)', fill: true, tension: 0.25, pointRadius: 0 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } },
    });

    const fscBody = document.querySelector('#bm-fsc-table tbody');
    const fscEntries = Object.entries(fsc.carriers).sort((a, b) => b[1].current_pct - a[1].current_pct);
    fscBody.innerHTML = fscEntries.map(([name, c]) =>
      `<tr><td>${name}</td><td class="text-right font-medium">${c.current_pct.toFixed(1)}%</td></tr>`
    ).join('');

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

    const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b'];
    const periods = kpis.carriers[0].history.map(h => h.period);
    new Chart(document.getElementById('bm-yield-chart'), {
      type: 'line',
      data: {
        labels: periods,
        datasets: kpis.carriers.map((c, i) => ({
          label: c.name, borderColor: palette[i], backgroundColor: palette[i],
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
          label: c.name, borderColor: palette[i], backgroundColor: palette[i],
          data: c.history.map(h => h.or), tension: 0.25,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { reverse: false } } },
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

    const upLanes = lanes.lanes.filter(l => l.change_pct > 0).length;
    const downLanes = lanes.lanes.filter(l => l.change_pct < 0).length;
    const fscAvg = fscEntries.reduce((s, [, c]) => s + c.current_pct, 0) / fscEntries.length;
    const lmi = ind.LMI_Headline.latest;
    const lmiTrend = lmi > 55 ? 'expansion' : lmi > 50 ? 'tepid expansion' : 'contraction';
    document.getElementById('bm-summary').textContent =
      `Diesel ${ddelta >= 0 ? 'up' : 'down'} $${Math.abs(ddelta).toFixed(3)} w/w to $${dlast.price.toFixed(3)}; ` +
      `carrier FSCs averaging ${fscAvg.toFixed(1)}%. ` +
      `Rate pulse: ${upLanes} lanes up, ${downLanes} down. ` +
      `LMI at ${lmi} signals ${lmiTrend}; ATA tonnage ${ind.ATA_Tonnage.yoy_pct >= 0 ? 'positive' : 'negative'} YoY at ${ind.ATA_Tonnage.yoy_pct}%. ` +
      `Carrier yield trending up across ODFL, Saia, XPO, ArcBest — pricing discipline remains intact.`;
  }
};
