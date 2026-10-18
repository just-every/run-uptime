import type {WindowMetrics} from '../availability.server.ts'

/** Exact unit conversion for both single-monitor and bulk monitoring reads. */
export function uptimeSeconds(availability: WindowMetrics, slowMs: number) {
 return {
  observed: availability.observedMs / 1000,
  up: availability.upMs / 1000,
  down: availability.notPassingMs / 1000,
  unknown: availability.unknownMs / 1000,
  paused: availability.pausedMs / 1000,
  maintenance: availability.maintenanceMs / 1000,
  slow: slowMs / 1000,
 }
}
