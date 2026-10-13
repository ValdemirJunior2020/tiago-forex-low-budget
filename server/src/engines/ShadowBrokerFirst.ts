import {Decimal as D} from 'decimal.js'
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {OandaReadOnly} from '../broker/OandaReadOnly.js'
import {strategyContext} from '../indicators.js'
import {evaluate,analyzeCandidate} from '../strategy.js'
import {RiskManager} from '../risk/RiskManager.js'
import {SHADOW_OANDA_PAIRS,env} from '../config.js'
import {SHADOW_TAG} from '../risk/LowBudgetGuard.js'
import {OllamaSignalEngine} from './OllamaSignalEngine.js'
import {logShadowTrade,logShadowCandidate} from './logger.js'
type Side='long'|'short'
type Position={tradeId:string;symbol:string;direction:Side;units:string;entry:string;stop:string;originalStop:string;peakExit?:string;startedAt:string}
type State={lastCandle:Record<string,string>;position:Position|null;lastCandidate:any|null;candidateCount:number;lastAction:any|null;blockedReason:string|null}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../')
const statePath=resolve(root,'data/forex-pobre-shadow.json')
const blank=():State=>({lastCandle:{},position:null,lastCandidate:null,candidateCount:0,lastAction:null,blockedReason:null})
export class ShadowBrokerFirst {
 private state:State=blank()
 private busy=false
 private timer:NodeJS.Timeout|null=null
 private readonly risk=new RiskManager(resolve(root,'data/forex-pobre-risk.json'))
 private readonly ai:OllamaSignalEngine
 constructor(private readonly broker:OandaReadOnly){
  this.ai=new OllamaSignalEngine(broker)
  if(existsSync(statePath)){
   try{
    const raw=JSON.parse(readFileSync(statePath,'utf8'))
    if(!raw||typeof raw!=='object'||!raw.lastCandle)throw Error('invalid Shadow state')
    this.state={...blank(),...raw}
   }catch{this.state.blockedReason='SHADOW_STATE_UNREADABLE'}
  }
 }
 private save(){
  mkdirSync(dirname(statePath),{recursive:true})
  const tmp=statePath+'.tmp'
  writeFileSync(tmp,JSON.stringify(this.state,null,2),'utf8');renameSync(tmp,statePath)
 }
 start(){
  logShadowTrade({event:'SHADOW_ENGINE_STARTED',source:'OANDA_PRACTICE',pairs:SHADOW_OANDA_PAIRS,pollMs:Math.max(10000,env.SHADOW_OANDA_POLL_MS)})
  this.ai.start()
  void this.tick()
  this.timer=setInterval(()=>void this.tick(),Math.max(10000,env.SHADOW_OANDA_POLL_MS))
 }
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null}
 shadowSnapshot(){return {position:this.state.position?{symbol:this.state.position.symbol,brokerMirrorTradeId:this.state.position.tradeId,units:this.state.position.units,direction:this.state.position.direction,hardStop:this.state.position.stop}:null,pendingMirrorCloseTradeId:null}}
 ollamaSnapshot(){return {lastBrokerSignal:this.ai.snapshot().lastBrokerSignal??null}}
 snapshot(){
  const a=this.ai.snapshot()
  return {source:'OANDA_PRACTICE',shadowCandidates:this.state.candidateCount,
   lastShadowCandidate:this.state.lastCandidate,shadowStatus:this.state.blockedReason?'REVIEW_REQUIRED':this.state.position?'BROKER_OPEN':'WAITING',
   shadowBrokerTradeId:this.state.position?.tradeId||null,shadowLastAction:this.state.lastAction,
   shadowError:this.state.blockedReason,
   ollamaAi:{status:a.status,decisions:a.decisions,signals:a.signals,errors:a.errors,lastReviewedAt:a.lastReviewedAt,
    lastDecision:a.lastDecision,lastSetup:a.lastSetup,lastMarket:a.lastMarket,events:a.events,lastBrokerSignal:a.lastBrokerSignal},
   brokerLearning:a.brokerLearning}
 }
 private async brokerOwned(p:Position){
  const t:any=await this.broker.trade(p.tradeId)
  if(!t||t.clientExtensions?.tag!==SHADOW_TAG||t.instrument!==p.symbol)throw Error('SHADOW_OANDA_OWNERSHIP_MISMATCH')
  return t
 }
 private async reconcile(){
  const open:any[]=await this.broker.positions()
  const owned=open.filter(t=>t.clientExtensions?.tag===SHADOW_TAG)
  if(!this.state.position){
   if(owned.length){this.state.blockedReason='SHADOW_OANDA_POSITION_WITHOUT_LOCAL_STATE';this.save()}
   return
  }
  const p=this.state.position,t=await this.brokerOwned(p)
  if(t.state==='CLOSED'){
   if(t.realizedPL===undefined||!new D(t.realizedPL).isFinite())throw Error('OANDA closed trade P/L unavailable')
   this.state.lastAction={type:'SHADOW_OANDA_CLOSED',tradeId:t.id,realizedPL:String(t.realizedPL),at:new Date().toISOString()}
   logShadowTrade({event:'SHADOW_OANDA_CLOSED',source:'OANDA_API',tradeId:t.id,realizedPL:String(t.realizedPL),symbol:p.symbol})
   this.state.position=null;this.save()
   return
  }
  if(t.state!=='OPEN'||!t.stopLossOrder?.price||new D(t.currentUnits).abs().toString()!==p.units)throw Error('SHADOW_OANDA_TRADE_MISMATCH')
  if(!owned.some(x=>String(x.id)===p.tradeId))throw Error('SHADOW_OANDA_OPEN_TRADES_MISMATCH')
  const q=await this.broker.quote(p.symbol)
  const exit=new D(p.direction==='long'?q.bid:q.ask),entry=new D(p.entry),units=new D(p.units)
  const prior=p.peakExit?new D(p.peakExit):exit
  if(!p.peakExit||(p.direction==='long'?exit.gt(prior):exit.lt(prior)))p.peakExit=exit.toString()
  const peak=new D(p.peakExit!)
  const profit=(p.direction==='long'?exit.minus(entry):entry.minus(exit)).mul(units)
  const peakProfit=(p.direction==='long'?peak.minus(entry):entry.minus(peak)).mul(units)
  const initialRisk=entry.minus(new D(p.originalStop)).abs().mul(units)
  let stop=new D(p.stop)
  // Retains original +1R break-even and +2R trail protecting 50% of peak.
  if(initialRisk.gt(0)&&profit.gte(initialRisk))stop=p.direction==='long'?D.max(stop,entry):D.min(stop,entry)
  if(initialRisk.gt(0)&&peakProfit.gte(initialRisk.mul(2))){
   const trail=peakProfit.mul('.5').div(units)
   stop=p.direction==='long'?D.max(stop,entry.plus(trail)):D.min(stop,entry.minus(trail))
  }
  if(!stop.eq(new D(p.stop))){
   await this.broker.updatePracticeStopLoss(p.tradeId,p.symbol,stop.toString())
   p.stop=stop.toString()
   logShadowTrade({event:'SHADOW_OANDA_STOP_CONFIRMED',source:'OANDA_API',tradeId:p.tradeId,stop:p.stop})
  }
  const currentStop=new D(p.stop)
  if(p.direction==='long'?exit.lte(currentStop):exit.gte(currentStop))await this.close('STOP_TRIGGERED')
  else this.save()
 }
 private async close(reason:string){
  const p=this.state.position
  if(!p)return
  const t=await this.brokerOwned(p)
  if(t.state==='CLOSED'){await this.reconcile();return}
  if(t.state!=='OPEN')throw Error('Cannot close unverified OANDA trade')
  await this.broker.closePracticeTrade(p.tradeId)
  const confirmed=await this.brokerOwned(p)
  if(confirmed.state!=='CLOSED')throw Error('Broker closure pending verification')
  await this.reconcile()
  logShadowTrade({event:'SHADOW_OANDA_CLOSE_REASON',tradeId:p.tradeId,reason})
 }
 private async scan(symbol:string){
  const [m5,m10,q]=await Promise.all([this.broker.candles(symbol,'M5',60),this.broker.candles(symbol,'M10',40),this.broker.quote(symbol)])
  const last=m5.at(-1)
  if(!last){
   logShadowTrade({event:'SHADOW_CANDLE_UNAVAILABLE',symbol})
   return
  }
  if(this.state.lastCandle[symbol]===last.time)return
  this.state.lastCandle[symbol]=last.time;this.save()
  const context=strategyContext(m5,m10)
  const signal=evaluate(context),candidate=analyzeCandidate(context)
  logShadowCandidate({
   event:'SHADOW_SCAN',source:'OANDA_PRACTICE',symbol,candleTime:last.time,
   strictDecision:signal.decision,candidateSide:candidate.side??null,
   missing:candidate.missing??null,
   status:this.state.blockedReason?'REVIEW_REQUIRED':this.state.position?'BROKER_OPEN':candidate.side?'CANDIDATE':'WAITING_FOR_SETUP'
  })
  // Same original Shadow 3/4 gate: three matching conditions while strict signal waits.
  if(signal.decision!=='WAIT'||!candidate.side)return
  this.state.candidateCount++
  this.state.lastCandidate={symbol,side:candidate.side,missing:candidate.missing,at:new Date().toISOString()}
  logShadowCandidate({event:'SHADOW_CANDIDATE',...this.state.lastCandidate,executed:false})
  const direction:Side=candidate.side==='LONG'?'long':'short'
  if(this.state.position){
   const p=this.state.position
   if(p.symbol===symbol&&p.direction!==direction)await this.close('OPPOSITE_3_OF_4')
  }
  if(this.state.position||this.state.blockedReason||!['EUR_USD','GBP_USD'].includes(symbol)||this.risk.locked())return
  const account=await this.broker.account()
  this.risk.recordEquity(account.equity)
  const capital=D.min(new D(1000),new D(account.equity))
  // The setup uses completed candles; reprice execution independently using a fresh
  // OANDA bid/ask so an old scan quote cannot turn the intended hard stop invalid.
  const latest=await this.broker.quote(symbol)
  const quoteTime=Date.parse(latest.timestamp)
  const spreadPips=new D(latest.ask).minus(latest.bid).div('0.0001')
  if(!Number.isFinite(quoteTime)||Math.abs(Date.now()-quoteTime)>60000||
     spreadPips.lte(0)||spreadPips.gt(3)){
   logShadowTrade({event:'SHADOW_ENTRY_SKIPPED_QUOTE',symbol,
    reason:!Number.isFinite(quoteTime)||Math.abs(Date.now()-quoteTime)>60000?'STALE_QUOTE':'SPREAD_EXCEEDS_3_PIPS',
    quoteTime:latest.timestamp,spreadPips:spreadPips.toFixed(2)})
   return
  }
  const reference=direction==='long'?latest.ask:latest.bid
  const plan=this.risk.plan(symbol,direction,reference,capital.toString(),candidate.matchedConditions)
  if(new D(plan.units).lte(0))return
  try{
   const fill=await this.broker.openPracticeTrade(symbol,direction,plan.units,plan.hardStop,reference)
   const official:any=await this.broker.trade(fill.tradeId)
   if(!official||official.state!=='OPEN'||official.clientExtensions?.tag!==SHADOW_TAG||
      !official.stopLossOrder?.price)throw Error('OANDA Trade ID is pending reconciliation: '+fill.tradeId)
   this.state.position={tradeId:fill.tradeId,symbol,direction,units:plan.units,
    entry:String(official.price),stop:String(official.stopLossOrder.price),originalStop:String(official.stopLossOrder.price),
    startedAt:new Date().toISOString()}
   this.state.lastAction={type:'SHADOW_OANDA_OPEN',tradeId:fill.tradeId,at:new Date().toISOString()}
   this.save()
   logShadowTrade({event:'SHADOW_OANDA_OPEN',source:'OANDA_API',tradeId:fill.tradeId,symbol,direction,fillPrice:String(official.price)})
  }catch(e){
   if(String(e).includes('INVALID_STOP')){
    logShadowTrade({event:'SHADOW_ENTRY_SKIPPED_STOP',symbol,direction,
     reason:String(e),plannedStop:plan.hardStop,referencePrice:reference,spreadPips:spreadPips.toFixed(2)})
    return
   }
   throw e
  }

 }
 async tick(){
  if(this.busy)return
  this.busy=true
  try{
   logShadowTrade({event:'SHADOW_HEARTBEAT',source:'OANDA_PRACTICE',pairs:SHADOW_OANDA_PAIRS,blockedReason:this.state.blockedReason??null,tradeId:this.state.position?.tradeId??null})
   if(this.state.blockedReason)return
   const a=await this.broker.account()
   this.risk.recordEquity(a.equity)
   await this.reconcile()
   for(const symbol of SHADOW_OANDA_PAIRS){
    try{await this.scan(symbol)}catch(e){logShadowTrade({event:'SHADOW_OANDA_ERROR',symbol,error:String(e)})}
    await this.ai.process(symbol)
   }
  }catch(e){logShadowTrade({event:'SHADOW_RECONCILE_ERROR',error:String(e)})}
  finally{this.busy=false}
 }
}
