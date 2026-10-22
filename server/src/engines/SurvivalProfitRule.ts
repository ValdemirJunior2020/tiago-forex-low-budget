// The two-day survival rule relies ONLY on closed OANDA Practice trades with
// a verifiable per-agent clientExtensions.tag. Never substitute forecast points.
export const SURVIVAL_DAYS=['2026-10-22','2026-10-23'] as const
export const DAILY_TARGET_USD=1
export type ClosedTrade={id:string;closeTime:string;realizedPL:string;clientExtensions?:{tag?:string}}
export type DailyChallenge={date:string;realizedPL:number|null;met:boolean|null;tradeCount:number}
export type AgentChallenge={id:string;days:DailyChallenge[];status:'AWAITING_AGENT_BROKER_TRADES'|'IN_PROGRESS'|'SURVIVED'|'ELIMINATED'}
export function floridaDay(iso:string):string|null{
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)
}
export function evaluateSurvival(id:string,trades:ClosedTrade[],now:Date=new Date()):AgentChallenge{
 // Explicit namespace prevents old Shadow and independent Ollama trades being misattributed.
 const tagged=trades.filter(t=>t.clientExtensions?.tag===`SURVIVAL_${id.toUpperCase()}`)
 const today=floridaDay(now.toISOString())!
 const days=SURVIVAL_DAYS.map(date=>{
  const own=tagged.filter(t=>floridaDay(t.closeTime)===date&&Number.isFinite(Number(t.realizedPL)))
  if(!own.length)return {date,realizedPL:null,met:null,tradeCount:0}
  const usd=Math.round(own.reduce((sum,t)=>sum+Number(t.realizedPL),0)*100)/100
  return {date,realizedPL:usd,met:usd>=DAILY_TARGET_USD,tradeCount:own.length}
 })
 // Never declare a financial elimination merely from a lack of broker evidence.
 if(!tagged.length)return{id,days,status:'AWAITING_AGENT_BROKER_TRADES'}
 if(days.every(d=>d.met===true))return{id,days,status:'SURVIVED'}
 // A completed challenge day with verified trades below target ends the trial.
 if(days.some(d=>d.date<today&&d.met===false))return{id,days,status:'ELIMINATED'}
 if(today>'2026-10-23'&&days.some(d=>d.met===false))return{id,days,status:'ELIMINATED'}
 return{id,days,status:'IN_PROGRESS'}
}
