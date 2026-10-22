import type {OandaReadOnly} from '../broker/OandaReadOnly.js'
import {SurvivalLedger} from './ArenaLife.js'
import {evaluateSurvival,type AgentChallenge} from './SurvivalProfitRule.js'

type Side='BUY'|'SELL'|'WAIT'
type Candle={time:string;open:number;high:number;low:number;close:number;volume:number}
const profiles=[
 {id:'atlas',name:'Atlas',role:'Tendência',accent:'#46cfa9',desk:0},
 {id:'nova',name:'Nova',role:'Reversão',accent:'#b792ff',desk:1},
 {id:'pixel',name:'Pixel',role:'Volume',accent:'#ffc36f',desk:2},
 {id:'sage',name:'Sage',role:'Proteção',accent:'#6db5fc',desk:3},
 {id:'echo',name:'Echo',role:'Consenso',accent:'#fb8bb7',desk:4}
] as const
function avg(items:number[]){return items.reduce((a,b)=>a+b,0)/Math.max(1,items.length)}
function decide(id:string,bars:Candle[]):{side:Side;reason:string;confidence:number}{
 if(bars.length<30)return{side:'WAIT',reason:'Aguardando 30 candles completos da OANDA',confidence:0}
 const last=bars.at(-1)!, closes=bars.map(b=>b.close),volumes=bars.map(b=>b.volume)
 const sma7=avg(closes.slice(-7)),sma21=avg(closes.slice(-21))
 const hi=Math.max(...bars.slice(-20,-1).map(b=>b.high))
 const lo=Math.min(...bars.slice(-20,-1).map(b=>b.low))
 const spread=Math.max(0.00001,hi-lo),loc=(last.close-lo)/spread
 const activity=last.volume/Math.max(1,avg(volumes.slice(-20,-1)))
 const momentum=last.close-closes.at(-6)!
 switch(id){
  case 'atlas':return{side:sma7>sma21&&momentum>0?'BUY':sma7<sma21&&momentum<0?'SELL':'WAIT',reason:'Médias 7/21 e momentum de 5 candles',confidence:Math.min(100,Math.round(Math.abs(sma7-sma21)/last.close*100000))}
  case 'nova':return{side:loc<.12?'BUY':loc>.88?'SELL':'WAIT',reason:'Posição no canal de 20 candles',confidence:Math.round(Math.abs(loc-.5)*200)}
  case 'pixel':return{side:activity>1.4?(last.close>last.open?'BUY':'SELL'):'WAIT',reason:'Volume relativo '+activity.toFixed(2)+'×; requer >1,40×',confidence:Math.round(Math.min(100,activity*35))}
  case 'sage':return{side:activity<.7?'WAIT':Math.abs(momentum)>spread*.12?(momentum>0?'BUY':'SELL'):'WAIT',reason:'Filtro de atividade e amplitude do mercado',confidence:Math.round(Math.min(100,Math.abs(momentum)/spread*150))}
  default:return{side:'WAIT',reason:'Aguardando sinais das outras mesas',confidence:0}
 }
}
type Snapshot={source:string;updatedAt:string|null;status:string;profitChallenge:AgentChallenge[];agents:Array<{id:string;name:string;role:string;accent:string;side:Side;reason:string;confidence:number;life:number|null;correct:number;wrong:number;realizedPL:null;status:string}>;messages:Array<{from:string;to:string;message:string}>;riskMessage:string;expiresAt:string}
const expiry='2026-10-24T04:00:00.000Z'
export class SurvivalArena {
 private cache:{expires:number;data:Snapshot}|null=null
 private readonly ledger=new SurvivalLedger('data/survival-arena-life.json',profiles.map(p=>p.id))
 private readonly empty=profiles.map(p=>({...p,side:'WAIT' as Side,reason:'Aguardando dados da OANDA',confidence:0,life:null,correct:0,wrong:0,realizedPL:null,status:'RESEARCH_ONLY'}))
 constructor(private readonly broker:Pick<OandaReadOnly,'candles'|'closedTrades'>){}
 async snapshot():Promise<Snapshot>{
  if(this.cache&&Date.now()<this.cache.expires)return this.cache.data
  let bars:Candle[]=[]
  let trades:Awaited<ReturnType<OandaReadOnly['closedTrades']>>=[]
  try{trades=await this.broker.closedTrades(250)}catch{/* P/L remains unavailable if broker cannot verify closed trades. */}
  const profitChallenge=profiles.map(p=>evaluateSurvival(p.id,trades))
  try{bars=await this.broker.candles('EUR_USD','M5',48)}
  catch{
   return{source:'OANDA_UNAVAILABLE',updatedAt:null,status:'WAITING_FOR_OANDA',profitChallenge,agents:this.empty,
    messages:[],riskMessage:'OANDA indisponível: nenhuma decisão ou P/L estimado.',expiresAt:expiry}
  }
  const advice=profiles.map(p=>({...p,...decide(p.id,bars),life:null,correct:0,wrong:0,realizedPL:null,status:'RESEARCH_ONLY'}))
  const votes=advice.slice(0,4).reduce((a,p)=>{if(p.side==='BUY')a.buy++;if(p.side==='SELL')a.sell++;return a},{buy:0,sell:0})
  const agreement=votes.buy>=3?'BUY':votes.sell>=3?'SELL':'WAIT'
  advice[4]={...advice[4],side:agreement,reason:agreement==='WAIT'?'Sem consenso de 3 entre 4 especialistas':'Consenso de '+Math.max(votes.buy,votes.sell)+'/4 especialistas',confidence:Math.round(Math.max(votes.buy,votes.sell)*25)}
  const candle=bars.at(-1)
  const ledger=candle&&bars.length>=30
   ?this.ledger.record({time:candle.time,close:candle.close},advice.map(a=>({id:a.id,side:a.side})))
   :this.ledger.readonlySnapshot()
  for(const a of advice){
   const result=ledger.agents[a.id]
   if(result){a.life=result.energy as any;a.correct=result.correct;a.wrong=result.wrong;
    a.status=result.energy<=0?'ELIMINATED':'RESEARCH_ONLY'}
  }
  const messages=[
   {from:'Atlas',to:'Equipe',message:'Tendência: '+advice[0].side+' — '+advice[0].reason},
   {from:'Pixel',to:'Sage',message:'Volume: '+advice[2].side+'; '+advice[2].reason},
   {from:'Sage',to:'Echo',message:'Risco: '+advice[3].side+'; entradas continuam bloqueadas nesta arena.'},
   {from:'Echo',to:'Equipe',message:agreement==='WAIT'?'Precisamos de mais confirmação.':'Consenso analítico '+agreement+'; não é uma ordem.'}
  ]
  const data:Snapshot={source:'OANDA_COMPLETED_CANDLES',profitChallenge,updatedAt:bars.at(-1)?.time??null,status:bars.length>=30?'RESEARCH_ONLY':'INSUFFICIENT_DATA',agents:advice,
   messages,riskMessage:'Cinco agentes colaboram em modo pesquisa. Nenhum envia ordens. Regra de sobrevivência financeira: cada bot precisa de US$1 líquido realizado em 22 e 23/10, confirmado por trades OANDA com identificação individual. Energia de previsão não conta como lucro.',expiresAt:expiry}
  this.cache={expires:Date.now()+60000,data}
  return data
 }
}
