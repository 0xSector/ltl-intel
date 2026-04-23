// Lane pricing prototype. Computes origin-destination miles from ZIPs (Zippopotam.us,
// free, no key) + haversine × circuity factor. Applies a transparent LTL rate model
// and adds FSC from the Tab A engine.

const LANE_CLASSES = [50, 55, 60, 65, 70, 77.5, 85, 92.5, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const LANE_CLASS_MULT = {
  50: 1.00, 55: 1.08, 60: 1.15, 65: 1.22, 70: 1.30, 77.5: 1.38,
  85: 1.46, 92.5: 1.53, 100: 1.60, 110: 1.72, 125: 1.85, 150: 2.05,
  175: 2.25, 200: 2.45, 250: 2.75, 300: 3.05, 400: 3.55, 500: 4.00,
};
// Weight discount bands (LTL tapered): larger shipments pay less per cwt
function weightBand(weight_lb) {
  if (weight_lb < 500)   return { label: 'L5C (<500 lb)',    rate_per_cwt_base: 38.0 };
  if (weight_lb < 1000)  return { label: 'M5C (500-999)',    rate_per_cwt_base: 32.0 };
  if (weight_lb < 2000)  return { label: 'M1M (1000-1999)',  rate_per_cwt_base: 26.0 };
  if (weight_lb < 5000)  return { label: 'M2M (2000-4999)',  rate_per_cwt_base: 21.0 };
  if (weight_lb < 10000) return { label: 'M5M (5000-9999)',  rate_per_cwt_base: 17.0 };
  return                        { label: 'M10M (10000+)',    rate_per_cwt_base: 14.0 };
}
// Distance taper: rate grows sub-linearly with miles
function distanceMultiplier(miles) {
  if (miles < 100) return 0.55;
  if (miles < 250) return 0.75;
  if (miles < 500) return 1.00;
  if (miles < 1000) return 1.25;
  if (miles < 1500) return 1.45;
  if (miles < 2000) return 1.60;
  return 1.75;
}

const LANE_ZIP_CACHE = new Map();

async function lookupZip(zip) {
  zip = (zip || '').trim().padStart(5, '0');
  if (!/^\d{5}$/.test(zip)) throw new Error(`Invalid ZIP: ${zip}`);
  if (LANE_ZIP_CACHE.has(zip)) return LANE_ZIP_CACHE.get(zip);
  const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!r.ok) throw new Error(`ZIP ${zip} not found`);
  const j = await r.json();
  const place = j.places[0];
  const out = {
    zip,
    city: place['place name'],
    state: place['state abbreviation'],
    lat: +place.latitude,
    lon: +place.longitude,
  };
  LANE_ZIP_CACHE.set(zip, out);
  return out;
}

function haversineMiles(a, b) {
  const R = 3958.8; // miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function priceShipment({ miles, weight_lb, cls, fscPct }) {
  const band = weightBand(weight_lb);
  const distMult = distanceMultiplier(miles);
  const classMult = LANE_CLASS_MULT[cls] || 1.30;
  const rate_per_cwt = band.rate_per_cwt_base * distMult * classMult;
  const cwt = weight_lb / 100;
  const linehaul = Math.max(rate_per_cwt * cwt, 125); // min charge
  const fscDollars = linehaul * fscPct / 100;
  return {
    band: band.label,
    distMult,
    classMult,
    rate_per_cwt,
    cwt,
    linehaul,
    fscPct,
    fscDollars,
    total: linehaul + fscDollars,
  };
}

window.TabLane = {
  async mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="mb-6 card">
        <h3>What this does</h3>
        <p class="text-sm text-slate-700 leading-relaxed">
          Enter origin/destination ZIP codes, weight, and class.
          Tool pulls geo-coordinates, computes great-circle distance × 1.22 road circuity factor
          (PC*Miler HHG-style approximation), applies a transparent LTL rate model,
          and adds this week's FSC per carrier. Model parameters are visible below — calibrate to your tariff.
        </p>
        <p class="text-xs text-slate-500 mt-2">
          Rates are <b>illustrative</b>, not a real tariff. Use this for back-of-envelope sanity checks
          on an RFP lane, not for quoting customers.
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="lg:col-span-2 card">
          <h3>Lane</h3>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm mb-3">
            <label>Origin ZIP<input id="ln-o" type="text" value="06483" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
            <label>Dest ZIP<input   id="ln-d" type="text" value="90210" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
            <label>Weight (lb)<input id="ln-wt" type="number" value="1200" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
            <label>Class<select id="ln-cls" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              ${LANE_CLASSES.map(c => `<option value="${c}"${c === 70 ? ' selected' : ''}>${c}</option>`).join('')}
            </select></label>
            <label>&nbsp;<button id="ln-calc" class="mt-1 w-full bg-indigo-600 text-white rounded px-3 py-1.5 hover:bg-indigo-700">Price lane</button></label>
          </div>
          <div id="ln-lane-summary" class="text-sm text-slate-600"></div>
        </div>
        <div class="card">
          <h3>Rate model</h3>
          <ul class="text-xs text-slate-600 space-y-1 leading-relaxed">
            <li>Base $/cwt by weight band (L5C → M10M)</li>
            <li>× distance taper (100mi → 2000+mi)</li>
            <li>× class multiplier (50→1.0, 500→4.0)</li>
            <li>= linehaul, floored at $125 min charge</li>
            <li>+ FSC % from Tab A engine</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <h3>Rate quote by carrier</h3>
        <div id="ln-results"><p class="text-sm text-slate-500">Enter ZIPs and click "Price lane".</p></div>
      </div>

      <div class="card mt-6 border-l-4 border-indigo-500 hidden" id="ln-takeaways-card">
        <h3>Key takeaways</h3>
        <ul id="ln-takeaways" class="text-sm text-slate-700 space-y-2 leading-relaxed"></ul>
      </div>
    `;

    const [diesel, fscTables] = await Promise.all([
      fetch('data/diesel.json').then(r => r.json()),
      fetch('data/fsc_tables.json').then(r => r.json()),
    ]);
    const currentDiesel = diesel.series.at(-1).price;

    const $ = id => document.getElementById(id);

    const calc = async () => {
      $('ln-results').innerHTML = '<p class="text-sm text-slate-500">Looking up ZIPs…</p>';
      try {
        const [o, d] = await Promise.all([lookupZip($('ln-o').value), lookupZip($('ln-d').value)]);
        const greatCircle = haversineMiles(o, d);
        const roadMiles = Math.round(greatCircle * 1.22);
        const weight = Math.max(1, +$('ln-wt').value);
        const cls = +$('ln-cls').value;

        $('ln-lane-summary').innerHTML = `
          <span class="font-medium">${o.city}, ${o.state}</span>
          <span class="text-slate-400">→</span>
          <span class="font-medium">${d.city}, ${d.state}</span>
          <span class="ml-3 text-slate-500">${roadMiles.toLocaleString()} mi</span>
          <span class="ml-3 text-slate-400 text-xs">(great-circle ${greatCircle.toFixed(0)} × 1.22)</span>
        `;

        const carriers = fscTables.carriers;
        const rows = Object.keys(carriers).map(name => {
          const fscPct = FSC.compute(currentDiesel, carriers[name]);
          const priced = priceShipment({ miles: roadMiles, weight_lb: weight, cls, fscPct });
          return { name, ...priced, isExact: FSC.isExact(carriers[name]) };
        }).sort((a, b) => a.total - b.total);

        $('ln-results').innerHTML = `
          <div class="scroll-x">
            <table class="data">
              <thead><tr>
                <th>Carrier</th><th></th>
                <th class="text-right">$/cwt</th><th class="text-right">Linehaul</th>
                <th class="text-right">FSC %</th><th class="text-right">FSC $</th>
                <th class="text-right">Total</th>
              </tr></thead>
              <tbody>${rows.map((r, i) => `
                <tr${i === 0 ? ' class="bg-emerald-50"' : ''}>
                  <td class="font-medium whitespace-nowrap">${r.name}${i === 0 ? ' <span class="chip bg-emerald-100 text-emerald-700 ml-1">lowest</span>' : ''}</td>
                  <td>${r.isExact ? '<span class="chip bg-emerald-100 text-emerald-700">exact</span>' : '<span class="chip bg-slate-100 text-slate-500">est.</span>'}</td>
                  <td class="text-right">$${r.rate_per_cwt.toFixed(2)}</td>
                  <td class="text-right">$${r.linehaul.toFixed(2)}</td>
                  <td class="text-right text-slate-500">${r.fscPct.toFixed(1)}%</td>
                  <td class="text-right">$${r.fscDollars.toFixed(2)}</td>
                  <td class="text-right font-semibold">$${r.total.toFixed(2)}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
          <div class="mt-4 text-xs text-slate-500">
            Weight band: <b>${rows[0].band}</b> ·
            Distance mult: <b>${rows[0].distMult.toFixed(2)}×</b> ·
            Class ${cls} mult: <b>${rows[0].classMult.toFixed(2)}×</b> ·
            Diesel: <b>$${currentDiesel.toFixed(3)}</b>
          </div>
          <div class="mt-2 text-xs text-slate-500">
            Spread low → high: $${(rows.at(-1).total - rows[0].total).toFixed(2)}
            (${(((rows.at(-1).total - rows[0].total) / rows[0].total) * 100).toFixed(1)}%).
          </div>
        `;

        // Takeaways
        const cheap = rows[0], pricey = rows.at(-1);
        const spreadPct = ((pricey.total - cheap.total) / cheap.total) * 100;
        const avgFscShare = rows.reduce((s, r) => s + r.fscDollars / r.total, 0) / rows.length * 100;
        const fscSpread = pricey.fscPct - cheap.fscPct;
        const takeaways = [];
        takeaways.push(`<b>${cheap.name} is the low-cost carrier on this lane at $${cheap.total.toFixed(0)}.</b> ${pricey.name} is $${(pricey.total - cheap.total).toFixed(0)} (${spreadPct.toFixed(1)}%) higher — usually reflects service-level differential, not inefficiency.`);
        takeaways.push(`<b>FSC is ${avgFscShare.toFixed(0)}% of total cost on average.</b> At current diesel, the FSC line matters more than base rate negotiation. A 5pp FSC cap would save ~$${(cheap.linehaul * 5 / 100).toFixed(0)} per shipment vs uncapped on this lane.`);
        if (fscSpread > 3) {
          takeaways.push(`<b>${fscSpread.toFixed(1)}pp FSC spread across carriers.</b> Same diesel, different pass-through math. Worth flagging in carrier selection for FSC-sensitive customers.`);
        }
        if (cheap.linehaul <= 125.5) {
          takeaways.push(`<b>Lane is hitting the minimum charge floor ($125).</b> Economics are driven by min charge, not rated weight — a higher weight breakpoint or a density-based deal would reprice this lane fundamentally.`);
        }
        if (roadMiles < 250) {
          takeaways.push(`<b>Short-haul lane (${roadMiles} mi).</b> Regional specialists (Saia, Southeastern, R+L) often beat national carriers on <500 mi lanes. Worth shopping the regional bid.`);
        } else if (roadMiles > 1500) {
          takeaways.push(`<b>Long-haul lane (${roadMiles} mi).</b> ODFL and XPO's network reach is the natural fit. Regionals will interline and lose transit-time competitiveness.`);
        }
        document.getElementById('ln-takeaways-card').classList.remove('hidden');
        document.getElementById('ln-takeaways').innerHTML = takeaways.map(t => `<li>• ${t}</li>`).join('');
      } catch (e) {
        $('ln-results').innerHTML = `<p class="text-sm text-rose-600">Error: ${e.message}</p>`;
      }
    };

    $('ln-calc').addEventListener('click', calc);
    calc();
  }
};
