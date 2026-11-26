/** Live completion accepts runner clocks up to this far ahead of control-plane time. */
export const COMPLETION_CLOCK_ALLOWANCE_MS = 1000
export const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export function evidenceTimes(o:{startedAt:number;completedAt:number;durationMs:number},dueAt:number,now:number){
 return timestamp(o.startedAt)&&timestamp(o.completedAt)&&timestamp(o.durationMs)&&
  o.startedAt>=dueAt&&o.completedAt>=o.startedAt&&o.completedAt<=now+COMPLETION_CLOCK_ALLOWANCE_MS;
}
