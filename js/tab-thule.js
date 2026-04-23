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
          This brief synthesizes public facility data, inferred import lanes, and seasonality to support pricing & renewal conversations.
        </p>
      </div>

      <div class="mb-6 card border-l-4 border-indigo-500">
        <h3>Key takeaways</h3>
        <ul class="text-sm text-slate-700 space-y-2 leading-relaxed">
          <li>• <b>Two peaks, one network.</b> Roof racks and bike carriers peak Apr–Jun; ski carriers peak Nov–Feb. A single flat rate card underprices summer peak capacity and overcharges winter trough — argue for a peak-season surcharge or a two-curve FSC floor.</li>
          <li>• <b>Inbound concentrated at NY/NJ port.</b> Gdańsk, Antwerp, Gothenburg all flow through Newark — that's the short-haul outbound from Seymour/Shelton into NYC/Boston/Philly/DC. This is the LTL sweet spot in Thule's network; price it to win.</li>
          <li>• <b>Retail DC skew matters.</b> REI (WA, PA, AZ) and Amazon (nationwide) imply long-haul flows out of CT; Dick's (PA, GA, IN) is more regional. The lane mix is bimodal — don't average it.</li>
          <li>• <b>Seymour ↔ Shelton cluster.</b> Two Connecticut facilities 10 miles apart = internal shuttles that aren't real freight but can leak into the LTL book if not carved out. Verify billing treatment.</li>
          <li>• <b>Thule is growing inventory efficiency.</b> Their 2025 annual report flags SEK 1.2B freed from inventory — that typically means smaller, more frequent shipments. More handling units per dollar of revenue = accessorial exposure growing. Renegotiate accessorials proactively.</li>
        </ul>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Global footprint</h3>
          <div id="thule-map" style="height: 360px"></div>
        </div>
        <div class="card">
          <h3>Outbound seasonality (indicative index)</h3>
          <canvas id="thule-seasonality" height="200"></canvas>
          <p class="text-xs text-slate-500 mt-2">${d.seasonality.note}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card">
          <h3>Inferred inbound ocean lanes</h3>
          <table class="data">
            <thead><tr><th>From</th><th>To</th><th class="text-right">Est. containers</th><th>Commodities</th></tr></thead>
            <tbody>${d.imports.lanes.map(l => `
              <tr><td>${l.from}</td><td>${l.to}</td><td class="text-right font-medium">${l.containers_est.toLocaleString()}</td><td class="text-slate-500">${l.commodities}</td></tr>
            `).join('')}</tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2">${d.imports.note}</p>
        </div>
        <div class="card">
          <h3>Likely retail DC destinations</h3>
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

    const map = L.map('thule-map').setView([45, -20], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap · Carto', maxZoom: 10,
    }).addTo(map);
    const typeColor = { 'HQ': '#dc2626', 'Manufacturing': '#4f46e5', 'Distribution': '#10b981' };
    d.facilities.forEach(f => {
      L.circleMarker([f.lat, f.lon], {
        radius: 8, color: typeColor[f.type] || '#475569', fillColor: typeColor[f.type] || '#475569', fillOpacity: 0.7, weight: 2,
      }).addTo(map).bindPopup(`<b>${f.name}</b><br/>${f.type}`);
    });

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
