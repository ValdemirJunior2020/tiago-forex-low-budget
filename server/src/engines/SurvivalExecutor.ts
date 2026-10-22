import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {Decimal as D} from 'decimal.js'
import {env} from '../config.js'
import {OandaReadOnly} from '../broker/OandaReadOnly.js'
import {lowBudgetGuard} from '../risk/LowBudgetGuard.js'
import {oandaAuthGate} from '../broker/OandaAuthGate.js'
import {finalTrialAllowsNewEntry} from './FinalTrialWindow.js'
import {floridaDay,evaluateSurvival} from './SurvivalProfitRule.js'
import type {SurvivalArena} from './SurvivalArena.js'

const ids=['atlas','nova','pixel','sage','echo'] as const
type AgentId=typeof ids[number]
type Side='BUY'|'SELL'|'WAIT'
type Pending={agent:AgentId;clientId:string;tag:string;symbol:'EUR_USD'|'GBP_USD';side:Side;candle:string;at:string;tradeId:string|null;status:'SUBMITTING'|'OPEN'|'REVIEW_REQUIRED'}
type State={version:1;pending:Pending|null;lastAttempt:Record<string,string>;events:{at:string;message:string}[]}
const filename=resolve('data/survival-execution-state.json')
const initially=():State=>({version:1,pending:null,lastAttempt:{},events:[]})
export function survivalTradingAllowed(now=new Date()){
 const date=floridaDay(now.toISOString())
 return env.SURVIVAL_TRADING_ENABLED==='true'&&env.LOW_BUDGET_TRADING_ENABLED==='true'&&
  env.OANDA_REST_BASE_URL.replace(/\/$/,'')==='https://api-fxpractice.oanda.com'&&
  date!==null&&date>='2026-10-22'&&date<='2026-10-23'&&finalTrialAllowsNewEntry(now)
}
function symbolTag(id:AgentId){return 'SURVIVAL_'+id.toUpperCase()}
function uniqueId(id:AgentId,candle:string){return 'SV_'+id.toUpperCase()+'_'+createHash('sha256').update(candle).digest('hex').slice(0,18)}
export function chooseCompetitor(agents:{id:string;side:Side;confidence:number}[],
 results:{id:string;status:string;days:{date:string;met:boolean|null}[]}[],
 lastAttempt:Record<string,string>,candle:string,day:string):AgentId|null{
 for(const id of ids){
  const a=agents.find(x=>x.id===id),r=results.find(x=>x.id===id)
  if(!a||!r||r.status==='ELIMINATED'||r.status==='SURVIVED'||a.side==='WAIT')continue
  if(r.days.find(x=>x.date===day)?.met===true)continue
  if(lastAttempt[id]===candle)continue
  return id
 }
 return null
}
type Dependencies={arena:Pick<SurvivalArena,'snapshot'>;broker?:OandaReadOnly;now?:()=>Date;stateFile?:string;
 submit?:(payload:unknown)=>Promise<{tradeId:string}>}
export class SurvivalExecutor{
 private readonly broker:OandaReadOnly
 private readonly now:()=>Date
 private readonly stateFile:string
 private state:State=initially()
 private busy=false
 private timer:ReturnType<typeof setInterval>|null=null
 constructor(private readonly dependencies:Dependencies){
  this.broker=dependencies.broker??new OandaReadOnly()
  this.now=dependencies.now??(()=>new Date())
  this.stateFile=resolve(dependencies.stateFile??filename)
  if(existsSync(this.stateFile)){
   try{const old=JSON.parse(readFileSync(this.stateFile,'utf8')) as State
    if(old.version===1&&old.lastAttempt&&Array.isArray(old.events))this.state=old
   }catch{this.state.pending={agent:'atlas',clientId:'CORRUPTED_STATE',tag:'SURVIVAL_ATLAS',symbol:'EUR_USD',side:'WAIT',candle:'',at:'',tradeId:null,status:'REVIEW_REQUIRED'}}
  }
 }
 snapshot(){return{enabled:survivalTradingAllowed(this.now()),mode:'OANDA_PRACTICE_ONLY',pending:this.state.pending,
  lastAttempt:this.state.lastAttempt,events:this.state.events.slice(-8),riskLimits:'shared $2.50 per trade; $5 stop risk; $200 margin; $10k notional'}}
 private persist(message:string){
  this.state.events=[...this.state.events,{at:this.now().toISOString(),message}].slice(-40)
  mkdirSync(dirname(this.stateFile),{recursive:true})
  const tmp=this.stateFile+'.tmp'
  writeFileSync(tmp,JSON.stringify(this.state,null,2));renameSync(tmp,this.stateFile)
 }
 async reconcile(){
  const p=this.state.pending
  if(!p)return
  // During ambiguous submissions never resend the order; match both open and
  // closed broker IDs to the exact client ID and ownership tag.
  const all=await this.broker.allTrades(250)
  const found=all.filter(t=>t.clientExtensions?.id===p.clientId&&t.clientExtensions?.tag===p.tag)
  if(found.length>1)throw Error('DUPLICATE_AGENT_BROKER_TRADES_MANUAL_REVIEW')
  if(found.length===0){if(p.status==='SUBMITTING')this.state.pending={...p,status:'REVIEW_REQUIRED'};this.persist('Order not verified; manual review required, no retry');return}
  const t=found[0]
  if(t.state==='CLOSED'){this.state.pending=null;this.persist(p.agent+' trade '+t.id+' closed at OANDA');return}
  if(t.state!=='OPEN'||!t.stopLossOrder?.price){this.state.pending={...p,status:'REVIEW_REQUIRED',tradeId:String(t.id)};this.persist('Trade without confirmed broker stop requires manual review');return}
  this.state.pending={...p,status:'OPEN',tradeId:String(t.id)}
  this.persist(p.agent+' verified OANDA trade '+t.id)
 }
 async tick(){
  if(this.busy)return
  this.busy=true
  try{await this.run()}catch(e){
   this.state.events=[...this.state.events,{at:this.now().toISOString(),message:'BLOCKED: '+String(e).slice(0,180)}].slice(-40)
  }finally{this.busy=false}
 }
 private async run(){
  if(this.state.pending){await this.reconcile();if(this.state.pending)return}
  const now=this.now()
  if(!survivalTradingAllowed(now))return
  const market=await import('../broker/OandaMarketHours.js')
  if(!market.isOandaForexSessionOpen(now))return
  const snapshot=await this.dependencies.arena.snapshot()
  if(snapshot.source!=='OANDA_COMPLETED_CANDLES'||!snapshot.updatedAt||snapshot.agents.length!==5)return
  const day=floridaDay(now.toISOString())!
  const id=chooseCompetitor(snapshot.agents,snapshot.profitChallenge,this.state.lastAttempt,snapshot.updatedAt,day)
  if(!id)return
  const a=snapshot.agents.find(x=>x.id===id)!
  const symbol='EUR_USD' as const
  const q=await this.broker.quote(symbol)
  const at=Date.parse(q.timestamp)
  if(!Number.isFinite(at)||Math.abs(now.getTime()-at)>60000)return
  const ask=new D(q.ask),bid=new D(q.bid),spread=ask.minus(bid)
  if(spread.lte(0)||spread.gt('0.0003'))return
  const direction=a.side==='BUY'?'long':'short'
  const reference=direction==='long'?ask:bid
  const distance=reference.mul('0.001')
  const units=D.min(new D(1800),new D('2.49').div(distance).floor())
  if(units.lt(1))return
  const stop=direction==='long'?reference.minus(distance):reference.plus(distance)
  const target=direction==='long'?reference.plus(distance.mul('1.3')):reference.minus(distance.mul('1.3'))
  const normalizedStop=await this.broker.formatPrice(symbol,stop.toString())
  const normalizedTarget=await this.broker.formatPrice(symbol,target.toString())
  const candleTime=snapshot.updatedAt
  const clientId=uniqueId(id,candleTime),tag=symbolTag(id)
  // Preflight BOTH account state and per-agent eligibility. A single global
  // guard serializes all submitters (Shadow/Ollama/Survival).
  await lowBudgetGuard.execute({symbol,direction,units:units.toString(),stop:normalizedStop,referencePrice:reference.toString()},async()=>{
   const open=await this.broker.positions()
   if(open.length>0)throw Error('SURVIVAL_ONE_SHARED_OPEN_TRADE_AT_A_TIME')
   if(this.state.pending)throw Error('SURVIVAL_PENDING_INTENT')
   this.state.lastAttempt[id]=candleTime
   this.state.pending={agent:id,clientId,tag,symbol,side:a.side,candle:candleTime,at:now.toISOString(),tradeId:null,status:'SUBMITTING'}
   this.persist('Submitting '+id+' '+a.side+' to OANDA Practice')
   const priceBound=await this.broker.formatPrice(symbol,(direction==='long'?reference.mul('1.001'):reference.mul('0.999')).toString())
   const payload={order:{type:'MARKET',instrument:symbol,units:direction==='long'?units.toFixed(0):units.neg().toFixed(0),
    timeInForce:'FOK',positionFill:'OPEN_ONLY',priceBound,
    stopLossOnFill:{price:normalizedStop,timeInForce:'GTC'},
    takeProfitOnFill:{price:normalizedTarget,timeInForce:'GTC'},
    clientExtensions:{id:clientId+'_order',tag,comment:'Survival Arena Practice order'},
    tradeClientExtensions:{id:clientId,tag,comment:'Survival independent '+id}}}
   const filled=this.dependencies.submit?await this.dependencies.submit(payload):await this.submitOanda(payload)
   this.state.pending={...this.state.pending!,tradeId:filled.tradeId,status:'SUBMITTING'}
   this.persist('OANDA fill returned '+filled.tradeId+'; verification required')
  })
  await this.reconcile()
 }
 private async submitOanda(body:unknown):Promise<{tradeId:string}>{
  oandaAuthGate.assertMayOpen()
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
  try{
   const r=await fetch('https://api-fxpractice.oanda.com/v3/accounts/'+encodeURIComponent(env.OANDA_ACCOUNT_ID)+'/orders',{
    method:'POST',headers:{Authorization:'Bearer '+env.OANDA_API_TOKEN,'Content-Type':'application/json'},
    signal:controller.signal,body:JSON.stringify(body)})
   const b:any=await r.json().catch(()=>({}))
   if(!r.ok){oandaAuthGate.trip(r.status);throw Error('OANDA ORDER HTTP '+r.status)}
   const id=b.orderFillTransaction?.tradeOpened?.tradeID??b.orderFillTransaction?.tradesOpened?.[0]?.tradeID
   if(!id)throw Error('OANDA did not confirm trade ID')
   return{tradeId:String(id)}
  }finally{clearTimeout(timer)}
 }
 start(){if(this.timer)return;void this.tick();this.timer=setInterval(()=>void this.tick(),60000)}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null}
}
