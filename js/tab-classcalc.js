// NMFC density-based classification (standard density scale).
// Source: NMFTA density-only scale commonly cited in rating guides.
const NMFC_BRACKETS = [
  { minDensity: 50,   class: 50   },
  { minDensity: 35,   class: 55   },
  { minDensity: 30,   class: 60   },
  { minDensity: 22.5, class: 65   },
  { minDensity: 15,   class: 70   },
  { minDensity: 13.5, class: 77.5 },
  { minDensity: 12,   class: 85   },
  { minDensity: 10.5, class: 92.5 },
  { minDensity: 9,    class: 100  },
  { minDensity: 8,    class: 110  },
  { minDensity: 7,    class: 125  },
  { minDensity: 6,    class: 150  },
  { minDensity: 5,    class: 175  },
  { minDensity: 4,    class: 200  },
  { minDensity: 3,    class: 250  },
  { minDensity: 2,    class: 300  },
  { minDensity: 1,    class: 400  },
  { minDensity: 0,    class: 500  },
];

function classForDensity(d) {
  for (const b of NMFC_BRACKETS) if (d >= b.minDensity) return b.class;
  return 500;
}

function calcDensity({ l_in, w_in, h_in, weight_lb }) {
  const cuft = (l_in * w_in * h_in) / 1728;
  if (cuft <= 0) return 0;
  return weight_lb / cuft;
}

function nextLowerBracket(currentClass) {
  const idx = NMFC_BRACKETS.findIndex(b => b.class === currentClass);
  if (idx <= 0) return null;
  return NMFC_BRACKETS[idx - 1];
}

function breakEvenWeight({ l_in, w_in, h_in }, targetDensity) {
  const cuft = (l_in * w_in * h_in) / 1728;
  return cuft * targetDensity;
}

window.TabClassCalc = {
  mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">

          <div class="card">
            <h3>Single item</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm">
              <label>Length (in)<input id="cc-l" type="number" value="48" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
              <label>Width (in)<input id="cc-w" type="number" value="40" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
              <label>Height (in)<input id="cc-h" type="number" value="36" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
              <label>Weight (lb)<input id="cc-wt" type="number" value="450" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"/></label>
              <label>&nbsp;<button id="cc-calc" class="mt-1 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5">Calculate</button></label>
            </div>
            <div id="cc-result" class="mt-5"></div>
          </div>

          <div class="card">
            <h3>Mixed pallet</h3>
            <p class="text-xs text-slate-500 mb-3">Add multiple line items; we'll compute effective density and class on the combined shipment.</p>
            <div class="scroll-x mb-3">
              <table class="data">
                <thead><tr><th>L</th><th>W</th><th>H</th><th>Weight</th><th>Qty</th><th></th></tr></thead>
                <tbody id="cc-mp-rows"></tbody>
              </table>
            </div>
            <div class="flex gap-2">
              <button id="cc-mp-add" class="text-sm border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50">+ Add item</button>
              <button id="cc-mp-calc" class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-1.5">Calculate combined</button>
              <button id="cc-pdf" class="text-sm border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50 ml-auto">Export PDF</button>
            </div>
            <div id="cc-mp-result" class="mt-4"></div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="card">
            <h3>Density → class (reference)</h3>
            <table class="data text-xs">
              <thead><tr><th>Density (pcf)</th><th>Class</th></tr></thead>
              <tbody>
                ${NMFC_BRACKETS.map(b => `<tr><td>${b.minDensity === 0 ? '< 1' : '≥ ' + b.minDensity}</td><td>${b.class}</td></tr>`).join('')}
              </tbody>
            </table>
            <p class="text-xs text-slate-500 mt-3">Density-only scale. Actual NMFC items may override based on handling, stowability, or liability.</p>
          </div>

          <div class="card">
            <h3>Why this matters</h3>
            <p class="text-xs text-slate-600 leading-relaxed">
              Declared class drives the rate. A pallet declared class 125 that actually densities out to class 70 is
              revenue left on the table. Carriers reweigh and re-class in the network; catching it
              <em>at contract negotiation</em> is worth more than catching it in a dispute.
            </p>
          </div>
        </div>
      </div>
    `;

    const $ = id => document.getElementById(id);

    const renderSingle = () => {
      const l = +$('cc-l').value, w = +$('cc-w').value, h = +$('cc-h').value, wt = +$('cc-wt').value;
      if (!l || !w || !h || !wt) { $('cc-result').innerHTML = '<p class="text-sm text-rose-600">Enter all four values.</p>'; return; }
      const d = calcDensity({ l_in: l, w_in: w, h_in: h, weight_lb: wt });
      const cls = classForDensity(d);
      const cuft = (l * w * h) / 1728;
      const next = nextLowerBracket(cls);
      let beLine = '';
      if (next) {
        const be = breakEvenWeight({ l_in: l, w_in: w, h_in: h }, next.minDensity);
        const needed = Math.max(0, be - wt);
        beLine = `<div class="mt-3 text-sm text-slate-700">Add <b>${needed.toFixed(0)} lb</b> (total ${be.toFixed(0)} lb) to move down to <b>class ${next.class}</b>.</div>`;
      } else {
        beLine = `<div class="mt-3 text-sm text-slate-700">Already at the densest bracket.</div>`;
      }
      $('cc-result').innerHTML = `
        <div class="grid grid-cols-3 gap-4">
          <div><div class="kpi">${d.toFixed(2)}</div><div class="kpi-sub">lbs / ft³</div></div>
          <div><div class="kpi">${cuft.toFixed(2)}</div><div class="kpi-sub">cubic feet</div></div>
          <div><div class="kpi">${cls}</div><div class="kpi-sub">NMFC class</div></div>
        </div>
        ${beLine}
      `;
    };

    $('cc-calc').addEventListener('click', renderSingle);
    renderSingle();

    // Mixed pallet
    const mpRows = [];
    const addRow = (defaults = { l: 48, w: 40, h: 24, wt: 200, qty: 1 }) => {
      const id = Math.random().toString(36).slice(2, 8);
      mpRows.push({ id, ...defaults });
      drawMp();
    };
    const drawMp = () => {
      $('cc-mp-rows').innerHTML = mpRows.map(r => `
        <tr data-id="${r.id}">
          <td><input type="number" value="${r.l}" class="w-16 border border-slate-300 rounded px-1.5 py-1" data-f="l"/></td>
          <td><input type="number" value="${r.w}" class="w-16 border border-slate-300 rounded px-1.5 py-1" data-f="w"/></td>
          <td><input type="number" value="${r.h}" class="w-16 border border-slate-300 rounded px-1.5 py-1" data-f="h"/></td>
          <td><input type="number" value="${r.wt}" class="w-20 border border-slate-300 rounded px-1.5 py-1" data-f="wt"/></td>
          <td><input type="number" value="${r.qty}" class="w-14 border border-slate-300 rounded px-1.5 py-1" data-f="qty"/></td>
          <td><button class="text-rose-600 text-xs" data-rm="${r.id}">remove</button></td>
        </tr>
      `).join('');
      $('cc-mp-rows').querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', e => {
          const id = e.target.closest('tr').dataset.id;
          const f = e.target.dataset.f;
          const row = mpRows.find(r => r.id === id);
          row[f] = +e.target.value;
        });
      });
      $('cc-mp-rows').querySelectorAll('[data-rm]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.target.dataset.rm;
          const idx = mpRows.findIndex(r => r.id === id);
          mpRows.splice(idx, 1);
          drawMp();
        });
      });
    };
    const calcMp = () => {
      if (mpRows.length === 0) { $('cc-mp-result').innerHTML = '<p class="text-sm text-slate-500">Add at least one item.</p>'; return; }
      let totalCuft = 0, totalWeight = 0;
      for (const r of mpRows) {
        totalCuft += (r.l * r.w * r.h) / 1728 * r.qty;
        totalWeight += r.wt * r.qty;
      }
      const d = totalWeight / totalCuft;
      const cls = classForDensity(d);
      $('cc-mp-result').innerHTML = `
        <div class="grid grid-cols-4 gap-4">
          <div><div class="kpi">${totalWeight.toFixed(0)}</div><div class="kpi-sub">total lb</div></div>
          <div><div class="kpi">${totalCuft.toFixed(2)}</div><div class="kpi-sub">total ft³</div></div>
          <div><div class="kpi">${d.toFixed(2)}</div><div class="kpi-sub">density pcf</div></div>
          <div><div class="kpi">${cls}</div><div class="kpi-sub">effective class</div></div>
        </div>
      `;
      window._ccLastResult = { totalWeight, totalCuft, density: d, cls, rows: mpRows };
    };
    $('cc-mp-add').addEventListener('click', () => addRow());
    $('cc-mp-calc').addEventListener('click', calcMp);
    addRow();

    $('cc-pdf').addEventListener('click', () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('NMFC Class Analysis', 14, 18);
      doc.setFontSize(10);
      doc.text(new Date().toLocaleDateString(), 14, 26);
      const s = window._ccLastResult;
      if (s) {
        doc.text(`Total weight: ${s.totalWeight.toFixed(0)} lb`, 14, 40);
        doc.text(`Total volume: ${s.totalCuft.toFixed(2)} ft³`, 14, 48);
        doc.text(`Density: ${s.density.toFixed(2)} pcf`, 14, 56);
        doc.text(`Effective class: ${s.cls}`, 14, 64);
        let y = 78;
        doc.text('Items:', 14, y); y += 8;
        for (const r of s.rows) {
          doc.text(`${r.qty} × ${r.l}"×${r.w}"×${r.h}" @ ${r.wt} lb`, 18, y);
          y += 6;
        }
      } else {
        doc.text('No calculation yet.', 14, 40);
      }
      doc.save('nmfc-class-analysis.pdf');
    });
  }
};
