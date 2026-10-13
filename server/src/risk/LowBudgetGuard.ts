import {Decimal as D} from 'decimal.js'
import {oandaAuthGate} from '../broker/OandaAuthGate.js'
import {env} from '../config.js'
import {RiskManager} from './RiskManager.js'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
type Spec={symbol:string;direction:'long'|'short';units:string;stop:string;referencePrice:string}
export const SHADOW_TAG='FOREX_POBRE_SHADOW'
export const OLLAMA_TAG='FOREX_POBRE_OLLAMA'
export class LowBudgetGuard {
 private tail:Promise<void>=Promise.resolve()
 private risk=new RiskManager(resolve(dirname(fileURLToPath(import.meta.url)),'../../../data/low-budget-broker-equity.json'))
 assertIdentity(){this.ensure()}
 private ensure(){
  if(!env.OANDA_API_TOKEN||!env.OANDA_ACCOUNT_ID||!env.LOW_BUDGET_ALLOWED_ACCOUNT_ID||env.OANDA_ACCOUNT_ID!==env.LOW_BUDGET_ALLOWED_ACCOUNT_ID)throw Error('LOW_BUDGET_ACCOUNT_NOT_VERIFIED')
  if(env.OANDA_REST_BASE_URL.replace(/\/$/,'')!=='https://api-fxpractice.oanda.com')throw Error('PRACTICE_ONLY')
 }
 private async get(path:string){
  this.ensure()
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),12000)
  try{
   const response=await fetch('https://api-fxpractice.oanda.com'+path,{headers:{Authorization:'Bearer '+env.OANDA_API_TOKEN},signal:controller.signal})
   if(!response.ok){oandaAuthGate.trip(response.status);throw Error('OANDA HTTP '+response.status)}
   return await response.json() as any
  }finally{clearTimeout(timer)}
 }
 async snapshot(){
  const path='/v3/accounts/'+encodeURIComponent(env.OANDA_ACCOUNT_ID)
  const [summary,positions]=await Promise.all([this.get(path+'/summary'),this.get(path+'/openTrades')])
  const a=summary.account
  if(!a||a.id!==env.LOW_BUDGET_ALLOWED_ACCOUNT_ID||a.currency!=='USD'||!Array.isArray(positions.trades))throw Error('OANDA account verification failed')
  return {source:'OANDA_API',account:a,trades:positions.trades as any[]}
 }
 private async validate(s:Spec){
  const {account,trades}=await this.snapshot()
  if(!['EUR_USD','GBP_USD'].includes(s.symbol))throw Error('Unsupported USD major')
  if(trades.some(t=>t.instrument===s.symbol))throw Error('INSTRUMENT_OCCUPIED')
  if(trades.some(t=>![SHADOW_TAG,OLLAMA_TAG].includes(t.clientExtensions?.tag||'')))throw Error('UNKNOWN_OANDA_POSITION')
  const u=new D(s.units),ref=new D(s.referencePrice),stop=new D(s.stop)
  if(!u.isInteger()||u.lte(0)||!ref.isFinite()||ref.lte(0)||!stop.isFinite())throw Error('Invalid order')
  const accountPath='/v3/accounts/'+encodeURIComponent(env.OANDA_ACCOUNT_ID)
  const quote=await this.get(accountPath+'/pricing?instruments='+encodeURIComponent(s.symbol))
  const q=quote.prices?.[0],when=Date.parse(String(q?.time))
  if(!q||!Number.isFinite(when)||Math.abs(Date.now()-when)>60000)throw Error('STALE_OANDA_PRICE')
  const price=new D(s.direction==='long'?q.asks?.[0]?.price:q.bids?.[0]?.price)
  if(!price.isFinite()||price.lte(0)||price.minus(ref).abs().div(ref).gt('.001'))throw Error('Quote slippage > 0.1%')
  const distance=s.direction==='long'?price.minus(stop):stop.minus(price)
  if(distance.lte(0)||distance.div(price).gt('.008'))throw Error(
   'INVALID_STOP: '+s.symbol+' '+s.direction+
   ' brokerPrice='+price.toString()+
   ' plannedStop='+stop.toString()+
   ' distance='+distance.toString()+
   ' maxPct=0.8% quoteTime='+String(q.time)
  )
  let risk=distance.mul(u),notional=u.mul(price)
  if(risk.gt('2.50'))throw Error('MAX_TRADE_RISK_USD_2_50')
  for(const t of trades){
   if(!t.stopLossOrder?.price||!t.price||!['EUR_USD','GBP_USD'].includes(t.instrument))throw Error('OPEN_POSITION_UNVERIFIABLE')
   const qty=new D(t.currentUnits).abs(),entry=new D(t.price),sl=new D(t.stopLossOrder.price)
   risk=risk.plus(qty.mul(entry.minus(sl).abs()));notional=notional.plus(qty.mul(entry))
  }
  if(risk.gt('5')||notional.gt('10000'))throw Error('SHARED_RISK_OR_NOTIONAL_EXCEEDED')
  const instruments=await this.get(accountPath+'/instruments?instruments='+encodeURIComponent(s.symbol))
  const rate=new D(instruments.instruments?.[0]?.marginRate)
  if(!rate.isFinite()||rate.lte(0))throw Error('MARGIN_RATE_UNAVAILABLE')
  const required=u.mul(price).mul(rate)
  if(new D(account.marginUsed||'0').plus(required).gt('200')||new D(account.marginAvailable||'0').lt(required.mul(2)))throw Error('SHARED_MARGIN_LIMIT_200')
  const equity=new D(account.NAV||account.balance)
  if(!equity.isFinite()||equity.lte(0))throw Error('INVALID_BROKER_EQUITY')
  this.risk.recordEquity(equity.toString())
  if(this.risk.locked())throw Error('OANDA_24H_DRAWDOWN_3_PERCENT_LOCK')
 }
 async execute<T>(s:Spec,fn:()=>Promise<T>):Promise<T>{
  let release!:()=>void
  const next=new Promise<void>(r=>release=r),previous=this.tail
  this.tail=next;await previous
  try{
   oandaAuthGate.assertMayOpen()
   if(env.LOW_BUDGET_TRADING_ENABLED!=='true')throw Error('LOW_BUDGET_TRADING_DISABLED')
   await this.validate(s)
   return await fn()
  }finally{release()}
 }
}
export const lowBudgetGuard=new LowBudgetGuard()
