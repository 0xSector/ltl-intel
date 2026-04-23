window.TabScorecard = {
  async mount(sel) {
    const root = document.querySelector(sel);

    const [staticData, kpis, fmcsa] = await Promise.all([
      fetch('data/carriers_static.json').then(r => r.json()),
      fetch('data/carrier_kpis.json').then(r => r.json()).catch(() => ({ carriers: [] })),
      fetch('data/fmcsa.json').then(r => r.json()).catch(() => ({ carriers: [] })),
    ]);

    // Join on carrier name
    const byNameKpi   = Object.fromEntries((kpis.carriers   || []).map(c => [c.name, c]));
    const byNameFmcsa = Object.fromEntries((fmcsa.carriers  || []).map(c => [c.name, c]));

    const carriers = staticData.carriers.map(s => {
      const k = byNameKpi[s.name] || null;
      const f = byNameFmcsa[s.name] || null;
      const latest = k && k.history?.length ? k.history.at(-1) : null;
      return {
        ...s,
        latest_period:    latest?.period || null,
        revenue_usd:      latest?.revenue_usd ?? null,
        operating_ratio:  latest?.operating_ratio_pct ?? null,
        sec_tag:          k?.revenue_tag_used || null,
        power_units:      f?.power_units ?? null,
        drivers:          f?.drivers ?? null,
        safety_rating:    f?.safety_rating?.rating ?? null,
        rating_date:      f?.safety_rating?.rating_date ?? null,
        inspections_24mo: f?.inspections_24mo ?? null,
        oos_pct:          f?.out_of_service_pct ?? null,
        crashes_24mo:     f?.crashes_24mo ?? null,
        dot:              f?.dot ?? null,
      };
    });

    // Takeaways — computed from real data only
    const withOR = carriers.filter(c => c.operating_ratio != null);
    const bestOR  = withOR.slice().sort((a, b) => a.operating_ratio - b.operating_ratio)[0];
    const worstOR = withOR.slice().sort((a, b) => b.operating_ratio - a.operating_ratio)[0];
    const withOOS = carriers.filter(c => c.oos_pct?.driver != null);
    const bestOOS = withOOS.slice().sort((a, b) => a.oos_pct.driver - b.oos_pct.driver)[0];
    const worstOOS = withOOS.slice().sort((a, b) => b.oos_pct.driver - a.oos_pct.driver)[0];
    const totalCrashes = carriers.reduce((s, c) => s + (c.crashes_24mo?.total || 0), 0);

    const takeaways = [];
    if (bestOR && worstOR && bestOR !== worstOR) {
      const gap = worstOR.operating_ratio - bestOR.operating_ratio;
      takeaways.push(`<b>${bestOR.name} leads OR at ${bestOR.operating_ratio.toFixed(1)}%</b> (${bestOR.latest_period}); ${worstOR.name} trails at ${worstOR.operating_ratio.toFixed(1)}%. On $1B of revenue that ${gap.toFixed(1)}pp gap is $${(gap * 10).toFixed(0)}M of operating income. ${bestOR.name === 'ODFL' ? 'Non-union density advantage at work.' : ''}`);
    }
    if (bestOOS && worstOOS && bestOOS !== worstOOS) {
      takeaways.push(`<b>Safety spread: driver out-of-service rate ${bestOOS.oos_pct.driver.toFixed(1)}% (${bestOOS.name}) vs ${worstOOS.oos_pct.driver.toFixed(1)}% (${worstOOS.name}).</b> National average is ~6.7% — anyone above that is a service risk for time-sensitive freight.`);
    }
    takeaways.push(`<b>Fleet scale reality check:</b> ${carriers.filter(c => c.power_units).map(c => `${c.name} ${c.power_units?.toLocaleString()}`).slice(0, 5).join(' · ')} power units (SAFER). Use this, not reported "fleet size" press releases, for capacity comparisons.`);
    const noFinancials = carriers.filter(c => c.ticker === 'private').map(c => c.name).join(', ');
    if (noFinancials) {
      takeaways.push(`<b>Private carriers (${noFinancials}) have no SEC financials</b> — their cards show safety + fleet only. Use Mastio service rankings or freight press for qualitative benchmarking.`);
    }
    takeaways.push(`<b>Schneider is not a hub-and-spoke LTL carrier</b> — its LTL exposure comes via brokerage and volume/partial TL. OR comparisons against pure-LTL peers mislead. For Thule-style accounts the real competitive set is ODFL/Saia/XPO/Estes.`);

    const fmt = (v, prefix = '', suffix = '', digits = 1) =>
      v == null ? '<span class="text-slate-400">—</span>' : `${prefix}${Number(v).toFixed(digits)}${suffix}`;

    const cardHtml = c => {
      const revB = c.revenue_usd != null ? (c.revenue_usd * 4 / 1_000_000_000).toFixed(1) : null; // annualized
      const saferUrl = c.dot ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${c.dot}` : null;
      return `
      <div class="card" data-name="${c.name}">
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="text-sm font-semibold text-slate-900">${c.full_name}</div>
            <div class="text-xs text-slate-500">${c.hq} · ${c.ticker === 'private' ? 'Private' : c.ticker} · ${c.type}</div>
          </div>
          <label class="text-xs text-slate-500 flex items-center gap-1">
            <input type="checkbox" class="sc-compare" data-name="${c.name}"/> compare
          </label>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3">
          <div><div class="kpi text-xl">${revB ? '$' + revB + 'B' : '<span class="text-slate-400">—</span>'}</div><div class="kpi-sub">revenue (annualized${c.latest_period ? ` · ${c.latest_period}` : ''})</div></div>
          <div><div class="kpi text-xl">${fmt(c.operating_ratio, '', '%')}</div><div class="kpi-sub">operating ratio <span class="chip ${c.operating_ratio != null ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${c.operating_ratio != null ? 'SEC' : 'n/a'}</span></div></div>
          <div><div class="kpi text-xl">${c.power_units ? c.power_units.toLocaleString() : '<span class="text-slate-400">—</span>'}</div><div class="kpi-sub">power units <span class="chip ${c.power_units ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${c.power_units ? 'SAFER' : 'n/a'}</span></div></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3 text-xs">
          <div><div class="text-sm font-semibold">${c.drivers ? c.drivers.toLocaleString() : '—'}</div><div class="kpi-sub">drivers</div></div>
          <div><div class="text-sm font-semibold">${c.safety_rating || '—'}</div><div class="kpi-sub">safety rating</div></div>
          <div><div class="text-sm font-semibold">${c.oos_pct?.driver != null ? c.oos_pct.driver.toFixed(1) + '%' : '—'}</div><div class="kpi-sub">driver OOS</div></div>
        </div>

        <div class="mb-2">
          ${c.strengths.map(s => `<span class="chip mr-1 mb-1">${s}</span>`).join('')}
        </div>
        <p class="text-xs text-slate-600">${c.notes}</p>
        ${saferUrl ? `<p class="text-xs mt-2"><a class="text-indigo-600 underline" href="${saferUrl}" target="_blank">SAFER snapshot (DOT ${c.dot})</a></p>` : ''}
      </div>
    `;
    };

    root.innerHTML = `
      <div class="mb-6 card border-l-4 border-indigo-500">
        <h3>Key takeaways</h3>
        <ul class="text-sm text-slate-700 space-y-2 leading-relaxed">
          ${takeaways.map(t => `<li>• ${t}</li>`).join('')}
        </ul>
      </div>

      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-600">Select up to 4 carriers to compare side-by-side.</p>
          <p class="text-xs text-slate-400 mt-1">
            Financials from SEC XBRL (quarterly, annualized × 4) · Fleet & safety from FMCSA SAFER · Strengths/notes editorial
          </p>
        </div>
        <button id="sc-reset" class="text-xs text-indigo-600 underline">Reset</button>
      </div>

      <div id="sc-compare-panel" class="mb-6 hidden card">
        <h3>Comparison</h3>
        <div id="sc-compare-body"></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="sc-grid">
        ${carriers.map(cardHtml).join('')}
      </div>
    `;

    const selected = new Set();
    const panel = document.getElementById('sc-compare-panel');
    const body  = document.getElementById('sc-compare-body');

    const render = () => {
      if (selected.size === 0) { panel.classList.add('hidden'); return; }
      panel.classList.remove('hidden');
      const rows = [
        ['Revenue (annualized, $B)', c => c.revenue_usd != null ? (c.revenue_usd * 4 / 1e9).toFixed(1) : null, v => v ? '$' + v + 'B' : '—'],
        ['Operating Ratio',          c => c.operating_ratio, v => v == null ? '—' : `${v.toFixed(1)}%`],
        ['Latest period',            c => c.latest_period,   v => v || '—'],
        ['Power units',              c => c.power_units,     v => v ? v.toLocaleString() : '—'],
        ['Drivers',                  c => c.drivers,         v => v ? v.toLocaleString() : '—'],
        ['Safety rating',            c => c.safety_rating,   v => v || '—'],
        ['Driver OOS %',             c => c.oos_pct?.driver, v => v != null ? v.toFixed(1) + '%' : '—'],
        ['Vehicle OOS %',            c => c.oos_pct?.vehicle,v => v != null ? v.toFixed(1) + '%' : '—'],
        ['Crashes (24mo)',           c => c.crashes_24mo?.total, v => v != null ? v.toLocaleString() : '—'],
      ];
      const chosen = carriers.filter(c => selected.has(c.name));
      body.innerHTML = `
        <table class="data">
          <thead><tr><th>Metric</th>${chosen.map(c => `<th class="text-right">${c.name}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(([label, acc, fmt]) =>
              `<tr><td class="text-slate-600">${label}</td>${chosen.map(c => `<td class="text-right font-medium">${fmt(acc(c))}</td>`).join('')}</tr>`
            ).join('')}
          </tbody>
        </table>
      `;
    };

    root.querySelectorAll('.sc-compare').forEach(cb => {
      cb.addEventListener('change', e => {
        const name = e.target.dataset.name;
        if (e.target.checked) {
          if (selected.size >= 4) { e.target.checked = false; return; }
          selected.add(name);
        } else {
          selected.delete(name);
        }
        render();
      });
    });
    document.getElementById('sc-reset').addEventListener('click', () => {
      selected.clear();
      root.querySelectorAll('.sc-compare').forEach(cb => cb.checked = false);
      render();
    });
  }
};
