window.TabScorecard = {
  async mount(sel) {
    const root = document.querySelector(sel);
    const data = await fetch('data/carriers.json').then(r => r.json());

    const fmt = (v, prefix = '', suffix = '', digits = 1) =>
      v == null ? '<span class="text-slate-400">—</span>' : `${prefix}${Number(v).toFixed(digits)}${suffix}`;

    const cardHtml = c => `
      <div class="card" data-name="${c.name}">
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="text-sm font-semibold text-slate-900">${c.name}</div>
            <div class="text-xs text-slate-500">${c.hq} · ${c.ticker === 'private' ? 'Private' : c.ticker}</div>
          </div>
          <label class="text-xs text-slate-500 flex items-center gap-1">
            <input type="checkbox" class="sc-compare" data-name="${c.name}"/> compare
          </label>
        </div>
        <div class="grid grid-cols-3 gap-3 mb-3">
          <div><div class="kpi text-xl">${fmt(c.revenue_b, '$', 'B')}</div><div class="kpi-sub">revenue</div></div>
          <div><div class="kpi text-xl">${fmt(c.or_pct, '', '%')}</div><div class="kpi-sub">operating ratio</div></div>
          <div><div class="kpi text-xl">${fmt(c.yield_usd, '$', '', 2)}</div><div class="kpi-sub">yield /cwt</div></div>
        </div>
        <div class="grid grid-cols-3 gap-3 mb-3">
          <div><div class="text-sm font-semibold">${c.terminals || '—'}</div><div class="kpi-sub">terminals</div></div>
          <div><div class="text-sm font-semibold">${c.fleet.toLocaleString()}</div><div class="kpi-sub">power units</div></div>
          <div><div class="text-sm font-semibold">${c.fmcsa_unsafe_driving}</div><div class="kpi-sub">FMCSA unsafe driving</div></div>
        </div>
        <div class="mb-2">
          ${c.strengths.map(s => `<span class="chip mr-1 mb-1">${s}</span>`).join('')}
        </div>
        <p class="text-xs text-slate-600">${c.notes}</p>
      </div>
    `;

    root.innerHTML = `
      <div class="mb-4 flex items-center justify-between">
        <p class="text-sm text-slate-600">Select up to 4 carriers to compare side-by-side.</p>
        <button id="sc-reset" class="text-xs text-indigo-600 underline">Reset</button>
      </div>
      <div id="sc-compare-panel" class="mb-6 hidden card">
        <h3>Comparison</h3>
        <div id="sc-compare-body"></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="sc-grid">
        ${data.carriers.map(cardHtml).join('')}
      </div>
    `;

    const selected = new Set();
    const panel = document.getElementById('sc-compare-panel');
    const body  = document.getElementById('sc-compare-body');

    const render = () => {
      if (selected.size === 0) { panel.classList.add('hidden'); return; }
      panel.classList.remove('hidden');
      const rows = [
        ['Revenue ($B)', c => c.revenue_b, v => `$${v}B`],
        ['Operating Ratio', c => c.or_pct, v => v == null ? '—' : `${v.toFixed(1)}%`],
        ['Yield ($/cwt)', c => c.yield_usd, v => v == null ? '—' : `$${v.toFixed(2)}`],
        ['Terminals', c => c.terminals, v => v || '—'],
        ['Fleet (power units)', c => c.fleet, v => (v || 0).toLocaleString()],
        ['FMCSA unsafe driving', c => c.fmcsa_unsafe_driving, v => v],
      ];
      const chosen = data.carriers.filter(c => selected.has(c.name));
      body.innerHTML = `
        <table class="data">
          <thead><tr><th>Metric</th>${chosen.map(c => `<th class="text-right">${c.name.split(' ')[0]}</th>`).join('')}</tr></thead>
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
