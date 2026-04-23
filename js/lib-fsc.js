// Computes LTL fuel surcharge % from weekly DOE diesel price.
// Supports two table formats:
//   - stepped:  exact lookup table { min, max, pct }[]
//   - linear:   threshold + start_pct + step_usd + step_pct (our approximation)
window.FSC = {
  compute(dieselPrice, formula) {
    if (!formula) return 0;
    if (formula.type === 'stepped') {
      for (const s of formula.steps) {
        if (dieselPrice >= s.min && dieselPrice <= s.max) return s.pct;
      }
      const last = formula.steps[formula.steps.length - 1];
      return dieselPrice > last.max ? last.pct : 0;
    }
    if (dieselPrice < formula.threshold) return 0;
    const steps = (dieselPrice - formula.threshold) / formula.step_usd;
    return formula.start_pct + steps * formula.step_pct;
  },
  computeAll(dieselPrice, carriers) {
    return Object.fromEntries(
      Object.entries(carriers).map(([name, f]) => [name, this.compute(dieselPrice, f)])
    );
  },
  historicalSeries(dieselSeries, formula) {
    return dieselSeries.map(p => ({ week: p.week, fsc: this.compute(p.price, formula) }));
  },
  isExact(formula) { return formula && formula.type === 'stepped'; },
};
