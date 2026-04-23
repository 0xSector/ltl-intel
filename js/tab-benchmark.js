window.TabBenchmark = {
  async mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="mb-6 card">
        <h3>What changed this week</h3>
        <p id="bm-summary" class="text-sm text-slate-700 leading-relaxed">Loading…</p>
      </div>

      <div class="mb-6 card border-l-4 border-indigo-500">
        <h3>Key takeaways</h3>
        <ul id="bm-takeaways" class="text-sm text-slate-700 space-y-2 leading-relaxed"></ul>
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
            <thead><tr><th>Carrier</th><th></th><th class="text-right">FSC %</th><th class="text-right">Δ vs 13 wk ago</th></tr></thead>
            <tbody></tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2"><span class="chip bg-emerald-100 text-emerald-700">exact</span> = stepped lookup from published table · <span class="chip bg-slate-100 text-slate-600">est.</span> = linear approximation.</p>
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
          <h3>LTL revenue per cwt (yield)</h3>
          <canvas id="bm-yield-chart" height="160"></canvas>
          <p class="text-xs text-slate-500 mt-2">Source: SEC 8-K earnings releases · parsed from operating statistics tables.</p>
        </div>
        <div class="card">
          <h3>Operating ratio (derived from SEC XBRL)</h3>
          <canvas id="bm-or-chart" height="160"></canvas>
          <p class="text-xs text-slate-500 mt-2">OR = 1 − (OperatingIncome / Revenue). Lower is better.</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 mb-6">
        <div class="card">
          <h3>Quarterly revenue ($M)</h3>
          <canvas id="bm-rev-chart" height="120"></canvas>
          <p class="text-xs text-slate-500 mt-2">Source: SEC XBRL · standalone quarters (duration-filtered).</p>
        </div>
      </div>

    `;

    const [diesel, fsc, kpis, cass, yields] = await Promise.all([
      fetch('data/diesel.json').then(r => r.json()),
      fetch('data/fsc_tables.json').then(r => r.json()),
      fetch('data/carrier_kpis.json').then(r => r.json()),
      fetch('data/cass_lmi.json').then(r => r.json()),
      fetch('data/yields.json').then(r => r.json()).catch(() => ({ carriers: [] })),
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
      const badge = FSC.isExact(fsc.carriers[name])
        ? '<span class="chip bg-emerald-100 text-emerald-700">exact</span>'
        : '<span class="chip bg-slate-100 text-slate-600">est.</span>';
      return `<tr>
        <td>${name}</td>
        <td>${badge}</td>
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

    const ind = cass.indicators || {};
    document.getElementById('bm-indicators').innerHTML = Object.entries(ind).map(([k, v]) => {
      const mom = v.mom_pct != null ? `<span class="${v.mom_pct >= 0 ? 'delta-up' : 'delta-down'} ml-2 text-xs">${v.mom_pct >= 0 ? '+' : ''}${v.mom_pct}% m/m</span>` : '';
      const yoy = v.yoy_pct != null ? `<span class="text-slate-400 ml-2 text-xs">${v.yoy_pct >= 0 ? '+' : ''}${v.yoy_pct}% YoY</span>` : '';
      return `
        <div class="flex items-baseline justify-between">
          <div class="text-sm text-slate-600">${k.replace(/_/g, ' ')}</div>
          <div class="text-sm"><span class="font-semibold">${v.latest.toFixed(v.latest < 10 ? 3 : 1)}</span>${mom}${yoy}</div>
        </div>`;
    }).join('');
    // Add source attribution
    const sources = [];
    if (cass.cass?.source_url) sources.push(`<a class="underline" href="${cass.cass.source_url}" target="_blank">CASS ${cass.cass.period_slug || ''}</a>`);
    if (cass.lmi?.source_url)  sources.push(`<a class="underline" href="${cass.lmi.source_url}" target="_blank">LMI ${cass.lmi.period_slug || ''}</a>`);
    if (cass.ata?.source_url)  sources.push(`<a class="underline" href="${cass.ata.source_url}" target="_blank">ATA</a>`);
    if (sources.length) document.getElementById('bm-indicators').insertAdjacentHTML('beforeend', `<div class="text-xs text-slate-400 pt-2 border-t border-slate-100 mt-2">Sources: ${sources.join(' · ')}</div>`);

    const kpiPalette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b'];
    const carriersWithData = (kpis.carriers || []).filter(c => (c.history || []).length);
    const allPeriods = [...new Set(carriersWithData.flatMap(c => c.history.map(h => h.period)))].sort();
    const byPeriod = (c, field) => allPeriods.map(p => {
      const h = c.history.find(x => x.period === p);
      if (!h) return null;
      if (field === 'revenue_m') return h.revenue_usd != null ? h.revenue_usd / 1_000_000 : null;
      return h[field] ?? null;
    });
    new Chart(document.getElementById('bm-rev-chart'), {
      type: 'line',
      data: {
        labels: allPeriods,
        datasets: carriersWithData.map((c, i) => ({
          label: c.name, borderColor: kpiPalette[i % kpiPalette.length], backgroundColor: kpiPalette[i % kpiPalette.length],
          data: byPeriod(c, 'revenue_m'), tension: 0.25, spanGaps: true,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => '$' + v } } } },
    });
    // Yield chart
    const yieldCarriers = (yields.carriers || []).filter(c => (c.history || []).length);
    const yieldPeriods = [...new Set(yieldCarriers.flatMap(c => c.history.map(h => h.period)))].sort();
    new Chart(document.getElementById('bm-yield-chart'), {
      type: 'line',
      data: {
        labels: yieldPeriods,
        datasets: yieldCarriers.map((c, i) => ({
          label: c.name, borderColor: kpiPalette[i % kpiPalette.length], backgroundColor: kpiPalette[i % kpiPalette.length],
          data: yieldPeriods.map(p => {
            const h = c.history.find(x => x.period === p);
            return h ? h.yield_per_cwt : null;
          }), tension: 0.25, spanGaps: true,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => '$' + v } } } },
    });

    new Chart(document.getElementById('bm-or-chart'), {
      type: 'line',
      data: {
        labels: allPeriods,
        datasets: carriersWithData.map((c, i) => ({
          label: c.name, borderColor: kpiPalette[i % kpiPalette.length], backgroundColor: kpiPalette[i % kpiPalette.length],
          data: byPeriod(c, 'operating_ratio_pct'), tension: 0.25, spanGaps: true,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => v + '%' } } } },
    });

    const fscAvg = fscEntries.reduce((s, [, p]) => s + p, 0) / fscEntries.length;
    const fscAvg13 = Object.values(fsc13wk).reduce((s, v) => s + v, 0) / Object.keys(fsc13wk).length;
    const lmi = ind.LMI_Headline?.latest;
    const lmiTrend = lmi == null ? '' : lmi > 55 ? 'expansion' : lmi > 50 ? 'tepid expansion' : 'contraction';
    const ataMom = ind.ATA_Tonnage?.mom_pct;
    document.getElementById('bm-summary').textContent =
      `Diesel ${ddelta >= 0 ? 'up' : 'down'} $${Math.abs(ddelta).toFixed(3)} w/w to $${dlast.price.toFixed(3)}, ` +
      `$${(dlast.price - d13wk.price).toFixed(2)} over 13 weeks. ` +
      `Average LTL FSC now ${fscAvg.toFixed(1)}% (was ${fscAvg13.toFixed(1)}% 13 weeks ago — ${(fscAvg - fscAvg13 >= 0 ? '+' : '')}${(fscAvg - fscAvg13).toFixed(1)}pp). ` +
      `Every $1,000 of linehaul now carries an extra $${((fscAvg - fscAvg13) * 10).toFixed(0)} of FSC vs a quarter ago — material renewal leverage. ` +
      (lmi != null ? `LMI ${lmi} (${lmiTrend})` : 'LMI unavailable') +
      (ataMom != null ? `; ATA tonnage ${ataMom >= 0 ? '+' : ''}${ataMom}% MoM.` : '.');

    // Key takeaways — computed from the data
    const takeaways = [];
    const fscGap = fscAvg - fscAvg13;
    if (Math.abs(fscGap) >= 3) {
      takeaways.push(`<b>FSC environment ${fscGap >= 0 ? 'firming' : 'softening'}.</b> Average FSC moved ${fscGap >= 0 ? '+' : ''}${fscGap.toFixed(1)}pp in 13 weeks. Any contract with a fixed or capped FSC signed before ${d13wk.week} is now ${fscGap >= 0 ? 'below market — carrier leverage' : 'above market — shipper leverage'}.`);
    }
    const cheapest = fscEntries.at(-1), priciest = fscEntries[0];
    if (priciest && cheapest) {
      const spread = priciest[1] - cheapest[1];
      takeaways.push(`<b>Carrier FSC spread: ${spread.toFixed(1)}pp</b> between ${priciest[0]} (${priciest[1].toFixed(1)}%) and ${cheapest[0]} (${cheapest[1].toFixed(1)}%). On $10K/mo of linehaul, that's $${(spread * 100).toFixed(0)}/mo of pure FSC savings by moving to the lowest — worth comparing against service differential.`);
    }
    if (carriersWithData.length) {
      const latestPeriod = allPeriods.at(-1);
      const latestOrs = carriersWithData.map(c => {
        const h = c.history.find(x => x.period === latestPeriod);
        return h ? { name: c.name, or: h.operating_ratio_pct } : null;
      }).filter(Boolean).sort((a, b) => a.or - b.or);
      if (latestOrs.length >= 2) {
        const best = latestOrs[0], worst = latestOrs.at(-1);
        takeaways.push(`<b>${latestPeriod} margin read:</b> ${best.name} leads at ${best.or.toFixed(1)}% OR; ${worst.name} trails at ${worst.or.toFixed(1)}%. ${worst.or - best.or > 15 ? 'That gap is structural — union cost base + scale economics.' : 'Closer than historical norms — pricing convergence.'}`);
      }
    }
    if (lmi != null) {
      if (lmi < 50) {
        takeaways.push(`<b>LMI below 50 (${lmi}) signals contraction.</b> Expect shippers to push harder on renewals and volume commitments to soften.`);
      } else if (lmi > 57) {
        takeaways.push(`<b>LMI ${lmi} signals firm expansion.</b> Capacity is tight — carriers hold pricing discipline. Time to push on yield, not chase share.`);
      }
    }
    document.getElementById('bm-takeaways').innerHTML = takeaways.map(t => `<li>• ${t}</li>`).join('');
  }
};
