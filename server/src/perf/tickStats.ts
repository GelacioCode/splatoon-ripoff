/** Summary of how long recent ticks took (ms). */
export interface TickSummary {
  ticks: number;
  avg: number;
  p95: number;
  max: number;
}

/**
 * Collects how long each simulation tick takes, for the load test: the average, the 95th
 * percentile (how slow the slow ticks get) and the worst one since the last summary.
 */
export class TickStats {
  private samples: number[] = [];

  record(ms: number): void {
    this.samples.push(ms);
  }

  /** Summarizes the ticks recorded since the last call, and starts over. Null if none. */
  take(): TickSummary | null {
    const samples = this.samples;
    this.samples = [];
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((total, ms) => total + ms, 0);
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return {
      ticks: sorted.length,
      avg: sum / sorted.length,
      p95: sorted[p95Index],
      max: sorted[sorted.length - 1],
    };
  }
}
