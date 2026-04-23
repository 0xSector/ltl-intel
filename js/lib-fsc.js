// Computes LTL fuel surcharge % from weekly DOE diesel price using a carrier's
// published linear formula. Returns 0 if diesel is below the carrier's threshold.
window.FSC = {
  compute(dieselPrice, formula) {
    if (dieselPrice < formula.threshold) return 0;
    const stepsAbove = (dieselPrice - formula.threshold) / formula.step_usd;
    return formula.start_pct + stepsAbove * formula.step_pct;
  },
  computeAll(dieselPrice, carriers) {
    return Object.fromEntries(
      Object.entries(carriers).map(([name, f]) => [name, this.compute(dieselPrice, f)])
    );
  },
  // Historical FSC series — apply each carrier's formula to each weekly diesel price
  historicalSeries(dieselSeries, formula) {
    return dieselSeries.map(p => ({ week: p.week, fsc: this.compute(p.price, formula) }));
  }
};
