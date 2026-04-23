// Density audit: find declared-vs-actual class mismatches in a shipment dataset.
// Uses the same NMFC density brackets as Tab B.
const DA_BRACKETS = [
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
const DA_CLASS_LIST = DA_BRACKETS.map(b => b.class);

function daClassForDensity(d) {
  for (const b of DA_BRACKETS) if (d >= b.minDensity) return b.class;
  return 500;
}

// Rate multiplier by class relative to class 50. Approximate LTL tariff ratios.
const DA_CLASS_MULT = {
  50: 1.00, 55: 1.08, 60: 1.15, 65: 1.22, 70: 1.30, 77.5: 1.38,
  85: 1.46, 92.5: 1.53, 100: 1.60, 110: 1.72, 125: 1.85, 150: 2.05,
  175: 2.25, 200: 2.45, 250: 2.75, 300: 3.05, 400: 3.55, 500: 4.00,
};

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const split = line => {
    const out = []; let cur = ''; let q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = split(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map(l => {
    const cells = split(l);
    const o = {};
    headers.forEach((h, i) => o[h] = cells[i] ?? '');
    return o;
  });
  return { headers, rows };
}

// Map common column-name variants to canonical fields
const FIELD_ALIASES = {
  id:              ['id', 'bol', 'bol_number', 'pro', 'pro_number', 'shipment_id', 'shipment'],
  length_in:       ['length', 'length_in', 'l', 'len', 'length_inches'],
  width_in:        ['width', 'width_in', 'w', 'wid', 'width_inches'],
  height_in:       ['height', 'height_in', 'h', 'hgt', 'height_inches'],
  weight_lb:       ['weight', 'weight_lb', 'wt', 'lbs', 'pounds', 'weight_pounds'],
  qty:             ['qty', 'quantity', 'pieces', 'handling_units', 'hu'],
  declared_class:  ['class', 'declared_class', 'nmfc_class', 'freight_class'],
  billed_rate:     ['rate', 'billed_rate', 'linehaul', 'revenue', 'amount'],
};

function canonicalize(row) {
  const out = { raw: row };
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      if (row[a] !== undefined && row[a] !== '') { out[canonical] = row[a]; break; }
    }
  }
  return out;
}

function audit(rows) {
  return rows.map((r, idx) => {
    const c = canonicalize(r);
    const L = +c.length_in, W = +c.width_in, H = +c.height_in;
    const wt = +c.weight_lb;
    const qty = +(c.qty || 1) || 1;
    const declared = c.declared_class == null ? null : +c.declared_class;
    const billed = c.billed_rate == null ? null : +c.billed_rate;
    const id = c.id || `row-${idx + 1}`;

    const hasDims = L > 0 && W > 0 && H > 0 && wt > 0;
    const cuft = hasDims ? (L * W * H) / 1728 * qty : 0;
    const totalWeight = wt * qty;
    const density = hasDims && cuft > 0 ? totalWeight / cuft : 0;
    const actualClass = hasDims ? daClassForDensity(density) : null;

    let status = 'ok', impactPct = 0, notes = [];
    if (!hasDims) { status = 'missing_dims'; notes.push('Missing L/W/H/weight — cannot density-verify'); }
    else if (declared == null || Number.isNaN(declared)) { status = 'no_declared'; notes.push('No declared class on record'); }
    else if (!DA_CLASS_LIST.includes(declared)) { status = 'invalid_class'; notes.push(`Declared class ${declared} is not a valid NMFC class`); }
    else if (declared !== actualClass) {
      const declMult = DA_CLASS_MULT[declared];
      const actualMult = DA_CLASS_MULT[actualClass];
      impactPct = actualMult && declMult ? ((actualMult / declMult) - 1) * 100 : 0;
      status = actualClass < declared ? 'overdeclared' : 'underdeclared';
      notes.push(`Declared ${declared}, actual density → class ${actualClass}`);
    }

    const impactDollars = billed && impactPct ? billed * (impactPct / 100) : 0;
    return { id, L, W, H, wt, qty, declared, billed, density, actualClass, status, impactPct, impactDollars, notes };
  });
}

window.TabDensity = {
  mount(sel) {
    const root = document.querySelector(sel);
    root.innerHTML = `
      <div class="mb-6 card">
        <h3>What this does</h3>
        <p class="text-sm text-slate-700 leading-relaxed">
          Paste a CSV of shipment records. The tool computes actual density from dimensions + weight,
          compares to each shipment's declared NMFC class, and surfaces mismatches.
          <b>Overdeclared</b> (declared higher class than actual density) = your customer is overpaying —
          a reclass gift that can win renewals. <b>Underdeclared</b> = carrier is underbilling — lost revenue.
          Missing dimensions = the single biggest source of leakage in most LTL ops.
        </p>
        <p class="text-xs text-slate-500 mt-2">
          All processing happens in your browser. Nothing is uploaded. Columns detected:
          id/bol, length, width, height, weight, qty, class, rate (various aliases accepted).
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="lg:col-span-2 card">
          <h3>Input · paste CSV</h3>
          <div class="flex gap-2 mb-2">
            <button id="da-sample" class="text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">Load sample data</button>
            <button id="da-clear"  class="text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-50">Clear</button>
            <button id="da-run" class="text-xs bg-indigo-600 text-white rounded px-3 py-1 ml-auto hover:bg-indigo-700">Run audit</button>
          </div>
          <textarea id="da-csv" rows="9" class="w-full border border-slate-300 rounded px-2 py-2 text-xs font-mono" placeholder="bol,length,width,height,weight,qty,class,rate
BOL-001,48,40,36,320,1,125,487.50
BOL-002,48,40,48,680,1,85,612.00
..."></textarea>
        </div>
        <div class="card">
          <h3>Audit summary</h3>
          <div id="da-summary" class="space-y-3 text-sm"><p class="text-slate-500">Run an audit to see results.</p></div>
          <button id="da-pdf" class="mt-4 text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50 hidden">Export PDF report</button>
        </div>
      </div>

      <div class="card mb-6 border-l-4 border-indigo-500 hidden" id="da-takeaways-card">
        <h3>Key takeaways</h3>
        <ul id="da-takeaways" class="text-sm text-slate-700 space-y-2 leading-relaxed"></ul>
      </div>

      <div class="card">
        <h3>Line-by-line findings</h3>
        <div id="da-details"><p class="text-sm text-slate-500">No audit run yet.</p></div>
      </div>
    `;

    const $ = id => document.getElementById(id);

    $('da-sample').addEventListener('click', () => {
      $('da-csv').value = `bol,length,width,height,weight,qty,class,rate
BOL-1001,48,40,36,320,1,125,487.50
BOL-1002,48,40,48,680,1,85,612.00
BOL-1003,40,48,60,220,1,70,395.00
BOL-1004,48,40,30,510,1,100,445.00
BOL-1005,48,40,72,410,1,150,712.00
BOL-1006,48,40,24,890,1,70,398.00
BOL-1007,48,40,,420,1,92.5,515.00
BOL-1008,48,40,48,1100,1,60,580.00
BOL-1009,40,48,36,280,1,200,612.00
BOL-1010,48,40,42,340,2,110,842.00`;
    });

    $('da-clear').addEventListener('click', () => {
      $('da-csv').value = '';
      $('da-summary').innerHTML = '<p class="text-slate-500">Run an audit to see results.</p>';
      $('da-details').innerHTML = '<p class="text-sm text-slate-500">No audit run yet.</p>';
      $('da-pdf').classList.add('hidden');
    });

    const runAudit = () => {
      const text = $('da-csv').value.trim();
      if (!text) { $('da-summary').innerHTML = '<p class="text-rose-600">Paste a CSV first.</p>'; return; }
      const { headers, rows } = parseCSV(text);
      if (!rows.length) { $('da-summary').innerHTML = '<p class="text-rose-600">No data rows found.</p>'; return; }
      const findings = audit(rows);

      const counts = findings.reduce((a, f) => { a[f.status] = (a[f.status] || 0) + 1; return a; }, {});
      const totalImpact = findings.reduce((s, f) => s + f.impactDollars, 0);
      const totalOverdecl = findings.filter(f => f.status === 'overdeclared').reduce((s, f) => s + f.impactDollars, 0);
      const totalUnderdecl = findings.filter(f => f.status === 'underdeclared').reduce((s, f) => s + f.impactDollars, 0);
      const totalBilled = findings.reduce((s, f) => s + (f.billed || 0), 0);

      $('da-summary').innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div><div class="kpi text-xl">${findings.length}</div><div class="kpi-sub">shipments audited</div></div>
          <div><div class="kpi text-xl">${(counts.overdeclared || 0) + (counts.underdeclared || 0)}</div><div class="kpi-sub">class mismatches</div></div>
          <div><div class="kpi text-xl">${counts.missing_dims || 0}</div><div class="kpi-sub">missing dimensions</div></div>
          <div><div class="kpi text-xl">${counts.ok || 0}</div><div class="kpi-sub">clean rows</div></div>
        </div>
        <hr class="my-3 border-slate-200"/>
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between"><span class="text-slate-600">Customer overpay (overdeclared)</span><span class="font-semibold delta-up">$${totalOverdecl.toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Carrier underbill (underdeclared)</span><span class="font-semibold delta-down">$${Math.abs(totalUnderdecl).toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Net impact vs correct class</span><span class="font-semibold">$${totalImpact.toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Total billed in sample</span><span>$${totalBilled.toFixed(2)}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Impact as % of billed</span><span>${totalBilled ? ((totalImpact / totalBilled) * 100).toFixed(1) : '—'}%</span></div>
        </div>
        <p class="text-xs text-slate-500 mt-3">Impact uses approximate LTL class rate ratios (class 50 = 1.00). Apply to annual volume to project recovery.</p>
      `;
      $('da-pdf').classList.remove('hidden');

      const statusChip = s => ({
        ok: '<span class="chip bg-emerald-100 text-emerald-700">ok</span>',
        overdeclared: '<span class="chip bg-amber-100 text-amber-800">overdeclared</span>',
        underdeclared: '<span class="chip bg-rose-100 text-rose-800">underdeclared</span>',
        missing_dims: '<span class="chip bg-slate-100 text-slate-600">missing dims</span>',
        no_declared: '<span class="chip bg-slate-100 text-slate-600">no class</span>',
        invalid_class: '<span class="chip bg-rose-100 text-rose-800">invalid class</span>',
      }[s] || s);

      $('da-details').innerHTML = `
        <table class="data">
          <thead><tr>
            <th>ID</th><th class="text-right">Weight</th><th class="text-right">ft³</th><th class="text-right">Density</th>
            <th class="text-right">Declared</th><th class="text-right">Actual</th>
            <th>Status</th><th class="text-right">Impact</th>
          </tr></thead>
          <tbody>${findings.map(f => `
            <tr>
              <td class="font-mono text-xs">${f.id}</td>
              <td class="text-right">${f.wt ? f.wt.toFixed(0) : '—'}${f.qty > 1 ? ` × ${f.qty}` : ''}</td>
              <td class="text-right">${f.density ? ((f.wt * f.qty) / f.density).toFixed(1) : '—'}</td>
              <td class="text-right">${f.density ? f.density.toFixed(1) : '—'}</td>
              <td class="text-right">${f.declared ?? '—'}</td>
              <td class="text-right">${f.actualClass ?? '—'}</td>
              <td>${statusChip(f.status)}</td>
              <td class="text-right ${f.impactDollars > 0 ? 'delta-up' : f.impactDollars < 0 ? 'delta-down' : ''}">${f.impactDollars ? (f.impactDollars >= 0 ? '+' : '') + '$' + f.impactDollars.toFixed(2) : '—'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      `;

      window._daFindings = findings;
      window._daStats = { counts, totalImpact, totalOverdecl, totalUnderdecl, totalBilled };

      // Computed takeaways driven by the actual findings
      const n = findings.length;
      const missingPct = n ? ((counts.missing_dims || 0) / n) * 100 : 0;
      const mismatches = (counts.overdeclared || 0) + (counts.underdeclared || 0);
      const mismatchPct = n ? (mismatches / n) * 100 : 0;
      const sampleDaysGuess = 30;
      const annualized = (totalImpact / sampleDaysGuess) * 365;
      const takeaways = [];
      if (mismatchPct > 20) {
        takeaways.push(`<b>${mismatchPct.toFixed(0)}% of shipments are misclassified.</b> This is not noise — it's a systemic tariff issue. Recommend a formal density-based reclass proposal rather than line-by-line corrections.`);
      } else if (mismatches > 0) {
        takeaways.push(`<b>${mismatches} mismatches found (${mismatchPct.toFixed(0)}%).</b> Below systemic threshold — handle as individual corrections during next reweigh/reclass cycle.`);
      } else {
        takeaways.push(`<b>Zero class mismatches in this sample.</b> Declared classes align with actual density — tariff is clean, focus pricing levers elsewhere (accessorials, FSC, minimum charge).`);
      }
      if (missingPct > 15) {
        takeaways.push(`<b>${missingPct.toFixed(0)}% of shipments are missing dimensions.</b> This is the #1 leakage source — you can't charge for what you don't measure. Every major LTL carrier that installed dimensioners in the last 5 years reports 3-8% revenue recovery. Worth a capex conversation.`);
      }
      if (totalOverdecl > 0 && totalBilled > 0) {
        const pctOfBilled = (totalOverdecl / totalBilled) * 100;
        takeaways.push(`<b>Customer is overpaying $${totalOverdecl.toFixed(0)} in this sample (${pctOfBilled.toFixed(1)}% of billed).</b> Annualized on similar volume, that's ~$${annualized > 0 ? annualized.toFixed(0) : '—'}. Lead the renewal conversation by surfacing the reclass — shippers remember who fixed their tariff, not who quoted lowest.`);
      }
      if (totalUnderdecl < 0) {
        takeaways.push(`<b>Carrier is underbilling $${Math.abs(totalUnderdecl).toFixed(0)} in this sample.</b> Annualized that's real unbilled revenue. Reweigh/reclass program ROI is immediate here.`);
      }
      if (!takeaways.length) takeaways.push('No significant findings. Sample may be too small — re-run with 50+ rows for a meaningful signal.');

      document.getElementById('da-takeaways-card').classList.remove('hidden');
      document.getElementById('da-takeaways').innerHTML = takeaways.map(t => `<li>• ${t}</li>`).join('');
    };

    $('da-run').addEventListener('click', runAudit);

    $('da-pdf').addEventListener('click', () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const s = window._daStats;
      const f = window._daFindings || [];
      doc.setFontSize(16); doc.text('Density Audit Report', 14, 18);
      doc.setFontSize(9); doc.text(new Date().toLocaleString(), 14, 24);
      doc.setFontSize(10);
      let y = 36;
      doc.text(`Shipments audited: ${f.length}`, 14, y); y += 6;
      doc.text(`Mismatches: ${(s.counts.overdeclared || 0) + (s.counts.underdeclared || 0)} (over: ${s.counts.overdeclared || 0}, under: ${s.counts.underdeclared || 0})`, 14, y); y += 6;
      doc.text(`Missing dimensions: ${s.counts.missing_dims || 0}`, 14, y); y += 6;
      doc.text(`Customer overpay (overdeclared): $${s.totalOverdecl.toFixed(2)}`, 14, y); y += 6;
      doc.text(`Carrier underbill (underdeclared): $${Math.abs(s.totalUnderdecl).toFixed(2)}`, 14, y); y += 6;
      doc.text(`Net impact vs correct class: $${s.totalImpact.toFixed(2)}`, 14, y); y += 10;
      doc.setFontSize(11); doc.text('Flagged rows', 14, y); y += 6;
      doc.setFontSize(8);
      const flagged = f.filter(x => x.status !== 'ok').slice(0, 30);
      for (const r of flagged) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${r.id}: ${r.status} — decl ${r.declared ?? '-'} / actual ${r.actualClass ?? '-'} / ${r.impactDollars ? '$' + r.impactDollars.toFixed(2) : '—'}`, 14, y);
        y += 5;
      }
      doc.save('density-audit.pdf');
    });
  }
};
