import express from'express'
import cors from'cors'
import helmet from'helmet'
import{OandaReadOnly}from'./broker/OandaReadOnly.js'
import{RiskManager}from'./risk/RiskManager.js'
import{ollamaHealth,critique}from'./ollama.js'
import{env,BROKER_MODE,OANDA_DEMO_MIRROR_ENABLED}from'./config.js'
import{ShadowBrokerFirst}from'./engines/ShadowBrokerFirst.js'
import{OllamaPracticeMirror}from'./engines/OllamaPracticeMirror.js'
import{isTagged}from'./broker/OllamaPracticeBroker.js'
import{lowBudgetGuard,SHADOW_TAG}from'./risk/LowBudgetGuard.js'
import{Decimal}from'decimal.js'
import {openVikingBridge} from './engines/OpenVikingBridge.js'

const app=express(),broker=new OandaReadOnly(),risk=new RiskManager(),engine=new ShadowBrokerFirst(broker),
 ollamaMirror=new OllamaPracticeMirror(()=>engine.ollamaSnapshot(),()=>engine.shadowSnapshot())

app.use(helmet())
app.use(cors({origin:env.CLIENT_ORIGIN}))
app.use(express.json({limit:'32kb'}))

app.get('/health',async(_q,res)=>{
  const [ollama,account]=await Promise.all([
    ollamaHealth(),
    broker.account().then(()=>true).catch(()=>false)
  ])

  res.json({
    status:account?'ok':'degraded',
    broker:account,
    ollama,
    safety:{hardStop:'0.8%',maxSlippage:'0.1%',kill24h:'3.0%',riskPerTrade:'0.25%',drawdownPersistence:true},
    mode:OANDA_DEMO_MIRROR_ENABLED?'OANDA_PRACTICE_MIRROR':'READ_ONLY_TRADE_PLANNER',
    brokerMode:BROKER_MODE,
    practiceOnly:true,
    demoMirror:{enabled:OANDA_DEMO_MIRROR_ENABLED,strategy:'SHADOW_3_OF_4',practiceOnly:true},
    ollamaPracticeMirror:ollamaMirror.snapshot(),
    engines:{shadow:'OANDA_PRACTICE',ollama:'OANDA_PRACTICE',shadowRiskState:'LOCAL_NOT_A_PROFIT_SOURCE'}
  })
})

app.get('/api/openviking',async(_q,res)=>res.json(await openVikingBridge.health()))

app.get('/api/low-budget',async(_q,res)=>{
 try{const v=await lowBudgetGuard.snapshot()
 res.json({source:v.source,budgetUsd:1000,brokerBalance:v.account.balance,
 brokerEquity:v.account.NAV??null,openTrades:v.trades.length,
 marginUsed:v.account.marginUsed??null,marginAvailable:v.account.marginAvailable??null,
 tradingEnabled:env.LOW_BUDGET_TRADING_ENABLED==='true',maxRiskPerTradeUsd:2.5,
 maxSharedStopRiskUsd:5,maxSharedMarginUsd:200,maxNotionalUsd:10000})}
 catch(e){res.status(503).json({source:'OANDA_API',status:'UNAVAILABLE',error:String(e)})}
})
app.get('/api/account',async(_q,res)=>{
  try{
    const a=await broker.account()
    risk.recordEquity(a.equity)
    res.json({...a,drawdown24h:risk.drawdown24h().toString(),locked:risk.locked()})
  }catch(e){
    res.status(503).json({error:e instanceof Error?e.message:String(e)})
  }
})

app.get('/api/positions',async(_q,res)=>{
  try{res.json(await broker.positions())}
  catch(e){res.status(503).json({error:e instanceof Error?e.message:String(e)})}
})

// Broker numbers only; local Shadow state is used solely to flag divergence.
app.get('/api/oanda-audit',async(_q,res)=>{
 try{
  const brokerState=await broker.authoritativeSnapshot()
  const shadowState=engine.shadowSnapshot()
  const shadow=shadowState.position
  const id=shadow?.brokerMirrorTradeId?String(shadow.brokerMirrorTradeId):null
  const brokerTrade=id?brokerState.openTrades.find((t:any)=>String(t.id)===id):null
  const issues:string[]=[]
  if(OANDA_DEMO_MIRROR_ENABLED){
   if(shadow&&!id)issues.push('SHADOW_OPEN_WITHOUT_OANDA_TRADE_ID')
   if(id&&!brokerTrade)issues.push('SHADOW_MIRROR_TRADE_NOT_OPEN_AT_OANDA')
   if(!shadow&&brokerState.openTrades.some((t:any)=>!isTagged(t)))issues.push('OANDA_HAS_OPEN_TRADES_WITHOUT_SHADOW_POSITION')
   if(shadow&&brokerTrade){
    if(String(brokerTrade.instrument)!==String(shadow.symbol))issues.push('INSTRUMENT_MISMATCH')
    const brokerUnits=Number(brokerTrade.currentUnits)
    const localUnits=Number(shadow.units)*(shadow.direction==='short'?-1:1)
    if(!Number.isFinite(brokerUnits)||brokerUnits!==localUnits)issues.push('DIRECTION_OR_UNITS_MISMATCH')
    const stop=Number(brokerTrade.stopLossOrder?.price)
    if(!Number.isFinite(stop))issues.push('BROKER_STOP_UNAVAILABLE')
    else if(Math.abs(stop-Number(shadow.hardStop))>0.000011)issues.push('STOP_MISMATCH')
   }
   if(shadowState.pendingMirrorCloseTradeId)issues.push('PENDING_BROKER_CLOSE')
  }
  res.json({...brokerState,mirrorEnabled:OANDA_DEMO_MIRROR_ENABLED,
   mirrorTradeId:id,mirrorTrade:brokerTrade||null,
   syncStatus:!OANDA_DEMO_MIRROR_ENABLED?'MIRROR_DISABLED':issues.length?'MISMATCH':'MATCHED',
   issues})
 }catch(e){res.status(503).json({source:'OANDA_API',syncStatus:'UNAVAILABLE',error:e instanceof Error?e.message:String(e)})}
})

// Six read-only OANDA candle windows for visible live chart desk (separate from closed-trade research).
// Cache per symbol to keep the local dashboard from flooding the Practice API.
const liveChartCache=new Map<string,{until:number;result:unknown}>()
app.get('/api/charts/live/:symbol',async(req,res)=>{
 const symbol=String(req.params.symbol)
 if(!['EUR_USD','GBP_USD'].includes(symbol)){res.status(400).json({error:'Unsupported chart symbol'});return}
 const cache=liveChartCache.get(symbol)
 if(cache&&Date.now()<cache.until){res.json(cache.result);return}
 try{
  const frames=['M1','M5','M10','M15','H1','H4'] as const
  const settled=await Promise.allSettled(frames.map(tf=>broker.candles(symbol,tf,60)))
  const windows=frames.map((timeframe,i)=>({
   timeframe,
   bars:settled[i].status==='fulfilled'?(settled[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof broker.candles>>>).value:[],
   error:settled[i].status==='rejected'?'OANDA candle request unavailable':null
  }))
  const payload={source:'OANDA_COMPLETED_MID_CANDLES',symbol,
   updatedAt:new Date().toISOString(),windows}
  liveChartCache.set(symbol,{until:Date.now()+60000,result:payload})
  res.json(payload)
 }catch(e){res.status(503).json({error:'Unable to load live OANDA chart windows'})}
})

app.get('/api/quote/:symbol',async(req,res)=>{
  try{res.json(await broker.quote(req.params.symbol))}
  catch(e){res.status(503).json({error:e instanceof Error?e.message:String(e)})}
})

app.post('/api/plan',async(req,res)=>{
  try{
    const a=await broker.account()
    const q=await broker.quote(req.body.symbol)
    const direction=req.body.direction==='short'?'short':'long'
    const price=direction==='long'?q.ask:q.bid
    const plan=risk.plan(req.body.symbol,direction,price,Decimal.min(1000,new Decimal(a.equity)).toString(),req.body.reasons||[])
    const margin=await broker.marginMetrics(req.body.symbol,price,plan.units,a.marginAvailable)
    const ai=await critique({plan,margin,quote:q}).catch(()=>({decision:'NEUTRAL',reason:'Ollama unavailable'}))
    res.json({plan:{...plan,...margin},ai,manualExecutionRequired:true})
  }catch(e){
    res.status(400).json({error:e instanceof Error?e.message:String(e)})
  }
})

app.get('/api/shadow-results',async(_q,res)=>{
 try{
  const all=await broker.closedTrades(250)
  const own=(all as any[]).filter(t=>t.clientExtensions?.tag===SHADOW_TAG)
  const pl=own.reduce((acc,t)=>acc.plus(String(t.realizedPL||'0')),new Decimal(0))
  res.json({source:'OANDA_API',strategy:'SHADOW_3_OF_4',realizedPL:pl.toString(),
   trades:own.length,wins:own.filter(t=>new Decimal(String(t.realizedPL||'0')).gt(0)).length,
   losses:own.filter(t=>new Decimal(String(t.realizedPL||'0')).lt(0)).length,
   history:own.slice(0,20).map(t=>({tradeId:t.id,symbol:t.instrument,realizedPL:t.realizedPL,closedAt:t.closeTime}))})
 }catch(e){res.status(503).json({source:'OANDA_API',status:'UNAVAILABLE',error:String(e)})}
})

app.get('/api/engine',(_q,res)=>res.json({...engine.snapshot(),source:'OANDA_PRACTICE_ENGINE'}))

// Independent broker-verified Ollama results. This endpoint NEVER submits orders.
app.get('/api/ollama-mirror',(_q,res)=>res.json(ollamaMirror.snapshot()))
// Manual OANDA read-only recheck. Does not place, close or modify broker orders.
app.post('/api/ollama-mirror/reconcile',async(_q,res)=>{try{res.json(await ollamaMirror.reconcileOnly())}catch(e){res.status(503).json({error:String(e)})}})

app.post('/api/validate-fill',(req,res)=>{
  try{
    const direction=req.body.direction==='short'?'short':'long'
    res.json(risk.validateFill(String(req.body.referencePrice),String(req.body.fillPrice),direction))
  }catch(e){
    res.status(400).json({error:e instanceof Error?e.message:String(e)})
  }
})

app.listen(env.PORT,'127.0.0.1',()=>{
 console.log(`Forex-Pobre OANDA Practice http://127.0.0.1:${env.PORT}`)
 engine.start()
 ollamaMirror.start()
})
