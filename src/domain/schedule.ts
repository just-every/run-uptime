// Scheduled cadence and acceptance bounds shared by claiming and availability.
type AcceptanceDefinition = { probes: string[]; retries: number; timeoutMs: number; assignments?: Record<string,{canaryUrl?:string}> }

/** The acceptance window covers selected attempts and configured canaries plus a fixed margin. */
export function acceptanceMs(definition: AcceptanceDefinition): number {
  return Math.max(30000, definition.probes.length * (definition.retries + 1) * definition.timeoutMs + definition.probes.filter(p=>definition.assignments?.[p]?.canaryUrl).length*definition.timeoutMs + 10000)
}

/** Whole intervals that passed between the due time and the claim, without catch-up slots. */
export function missedSlots(dueAt: number, now: number, intervalMs: number): number {
  return Math.max(0, Math.floor((now - dueAt) / intervalMs))
}

/** The next due time stays on the revision's interval grid and is always later than the claim. */
export function nextDueAfter(dueAt: number, now: number, intervalMs: number): number {
  return dueAt + (missedSlots(dueAt, now, intervalMs) + 1) * intervalMs
}
