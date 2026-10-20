// Final one-day trial requested for October 21, 2026, Florida (EDT).
// New entries end at midnight; broker-side stop orders and existing-trade reconciliation remain active.
export const FINAL_TRIAL_END_UTC='2026-10-22T04:00:00.000Z'
export function finalTrialAllowsNewEntry(now:Date=new Date()){
 return Number.isFinite(now.getTime())&&now.getTime()<Date.parse(FINAL_TRIAL_END_UTC)
}
