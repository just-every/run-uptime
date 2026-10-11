import { loadavg, freemem } from 'node:os';

// Built-in OS counters; injection belongs to library tests, never CLI admission.
export function sampleResources() {
  return { load: loadavg()[0], freeMemoryBytes: freemem() };
}
