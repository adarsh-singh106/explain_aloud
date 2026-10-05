// Local diagnostics only: no response text, persistence, or external reporting.
export function reportTiming(phase: string, started: number): void {
  console.info('[Explain Aloud timing]', { phase, durationMs: Number((performance.now() - started).toFixed(2)) });
}

export async function measureAsync<T>(phase: string, task: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try { return await task(); }
  finally { reportTiming(phase, started); }
}

export function measureSync<T>(phase: string, task: () => T): T {
  const started = performance.now();
  try { return task(); }
  finally { reportTiming(phase, started); }
}
