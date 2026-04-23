window.TabThule = {
  async mount(sel) {
    const root = document.querySelector(sel);
    const d = await fetch('data/thule.json').then(r => r.json());

    root.innerHTML = `
      <div class="mb-4 card">
        <h3>Thule Group · public intelligence brief</h3>
        <p class="text-sm text-slate-700 leading-relaxed">
          Outdoor products manufacturer (roof racks, cargo boxes, bike/ski carriers, child carriers, luggage).
          HQ Malmö, SE · listed on Nasdaq Stockholm · US ops anchored in Seymour & Shelton, CT.
        </p>
        <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 leading-relaxed">
          <b>Provenance legend for this tab.</b> Each section below is tagged with one of three chips:
          <span class="chip bg-emerald-100 text-emerald-700 ml-1">real</span> = verified from public sources (company filings, facility addresses, annual reports).
          <span class="chip bg-amber-100 text-amber-800 ml-1">inferred</span> = directionally reasonable estimate based on public clues (no proprietary data).
          <span class="chip bg-rose-100 text-rose-800 ml-1">illustrative</span> = shape is educated guess, numbers are placeholder — replace with real data before quoting.
          Nothing on this tab is Thule proprietary data. For a real brief, pair this framework with ImportGenius/Panjiva imports and actual account history.
        </div>
      </div>


      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Global footprint <span class="chip bg-emerald-100 text-emerald-700">real</span></h3>
          <div id="thule-map" style="height: 360px"></div>
          <p class="text-xs text-slate-500 mt-2">Facility locations verified from Thule's public facility list and annual report.</p>
        </div>
        <div class="card">
          <h3>Outbound seasonality <span class="chip bg-rose-100 text-rose-800">illustrative</span></h3>
          <canvas id="thule-seasonality" height="200"></canvas>
          <p class="text-xs text-slate-500 mt-2">Seasonality <em>shape</em> reflects product category reality; numeric values are placeholder. Replace with real shipment counts before pricing peak-season surcharges.</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Inbound ocean lanes <span class="chip bg-amber-100 text-amber-800">inferred</span></h3>
          <div class="scroll-x">
            <table class="data">
              <thead><tr><th>From</th><th>To</th><th class="text-right">Est. containers</th><th>Commodities</th></tr></thead>
              <tbody>${d.imports.lanes.map(l => `
                <tr><td class="whitespace-nowrap">${l.from}</td><td class="whitespace-nowrap">${l.to}</td><td class="text-right font-medium">${l.containers_est.toLocaleString()}</td><td class="text-slate-500">${l.commodities}</td></tr>
              `).join('')}</tbody>
            </table>
          </div>
          <p class="text-xs text-slate-500 mt-2">Ports and origin facilities are real; container counts are order-of-magnitude estimates. Actual volumes require ImportGenius/Panjiva subscription data.</p>
        </div>
        <div class="card">
          <h3>Retail DC destinations <span class="chip bg-amber-100 text-amber-800">inferred</span></h3>
          <ul class="space-y-2 text-sm">
            ${d.retail_partners.map(r => `
              <li class="flex justify-between border-b border-slate-100 pb-1.5">
                <span class="font-medium">${r.name}</span>
                <span class="text-slate-500 text-xs">${r.dc_hint}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>

      <div class="card">
        <h3>Talking points for renewal</h3>
        <ol class="list-decimal list-inside space-y-2 text-sm text-slate-700">
          ${d.talking_points.map(t => `<li>${t}</li>`).join('')}
        </ol>
      </div>
    `;

    const mapEl = document.getElementById('thule-map');
    const map = L.map(mapEl).setView([45, -20], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap · Carto', maxZoom: 10,
    }).addTo(map);
    const typeColor = { 'HQ': '#dc2626', 'Manufacturing': '#4f46e5', 'Distribution': '#10b981' };
    d.facilities.forEach(f => {
      L.circleMarker([f.lat, f.lon], {
        radius: 8, color: typeColor[f.type] || '#475569', fillColor: typeColor[f.type] || '#475569', fillOpacity: 0.7, weight: 2,
      }).addTo(map).bindPopup(`<b>${f.name}</b><br/>${f.type}`);
    });
    // Leaflet computes tile extent from container size at init time. If Tab D
    // was hidden at mount (Alpine x-show), the container reads 0×0 and only
    // the top-left tile renders. Re-invalidate size whenever it actually resizes.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapEl);

    const palette = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899'];
    new Chart(document.getElementById('thule-seasonality'), {
      type: 'line',
      data: {
        labels: d.seasonality.months,
        datasets: Object.entries(d.seasonality.series).map(([name, arr], i) => ({
          label: name, borderColor: palette[i], backgroundColor: palette[i], data: arr, tension: 0.35,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
  }
};
