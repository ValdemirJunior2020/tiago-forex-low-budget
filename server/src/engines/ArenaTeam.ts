import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'

export type AgentSide='BUY'|'SELL'|'WAIT'
export type AgentBrief={id:string;name:string;side:AgentSide;confidence:number;reason:string}
export type TeamMessage={at:string;from:string;to:string;message:string;kind:'BRIEF'|'CONSULT'|'DECISION'}
export type CoordinatorDecision={side:AgentSide;status:'CONSENSUS'|'VETO'|'NO_SETUP';votes:{buy:number;sell:number;wait:number};reason:string;canSubmitOrder:false}
export type MemoryEntry={candleTime:string;side:AgentSide;confidence:number;reason:string;decision:AgentSide}
type Stored={version:1;lastCandle:string|null;agents:Record<string,MemoryEntry[]>;messages:TeamMessage[];decision:CoordinatorDecision|null}

export function coordinate(briefs:AgentBrief[]):CoordinatorDecision{
 const votes={buy:0,sell:0,wait:0}
 for(const b of briefs.slice(0,4)){if(b.side==='BUY')votes.buy++;else if(b.side==='SELL')votes.sell++;else votes.wait++}
 const sage=briefs.find(x=>x.id==='sage')
 const leader=votes.buy>=3?'BUY':votes.sell>=3?'SELL':'WAIT'
 const blocked=sage?.side==='WAIT'||sage?.side!==leader
 const side:AgentSide=leader==='WAIT'||blocked?'WAIT':leader
 return {side,status:leader==='WAIT'?'NO_SETUP':blocked?'VETO':'CONSENSUS',votes,
  reason:leader==='WAIT'?'Nenhuma direção recebeu três de quatro votos.'
    :blocked?'Sage bloqueou: filtro de proteção não confirmou '+leader+'.'
    :'Três analistas confirmaram '+leader+' e Sage aprovou o filtro.',
  canSubmitOrder:false}
}
export function collaborate(briefs:AgentBrief[],decision:CoordinatorDecision,at:string):TeamMessage[]{
 const find=(id:string)=>briefs.find(b=>b.id===id)
 const atlas=find('atlas'),nova=find('nova'),pixel=find('pixel'),sage=find('sage')
 const pack=(from:string,to:string,message:string,kind:TeamMessage['kind']):TeamMessage=>({at,from,to,message,kind})
 return [
  ...briefs.filter(b=>b.id!=='echo').map(b=>pack(b.name,'Echo',b.side+' | '+b.reason,'BRIEF')),
  pack('Atlas','Nova','Minha leitura '+(atlas?.side??'WAIT')+'; você identificou '+(nova?.side??'WAIT')+'. Verifique divergência de tendência/reversão.','CONSULT'),
  pack('Pixel','Sage','Volume sugere '+(pixel?.side??'WAIT')+'. Confirma proteção? '+(sage?.side??'WAIT')+'.','CONSULT'),
  pack('Echo','Equipe',decision.reason+' Resultado analítico; NÃO é autorização de ordem.','DECISION')
 ]
}
export class ArenaTeamMemory{
 private readonly path:string
 private data:Stored
 constructor(file='data/survival-team-memory.json'){
  this.path=resolve(file)
  this.data={version:1,lastCandle:null,agents:{},messages:[],decision:null}
  if(existsSync(this.path)){
   try{
    const old=JSON.parse(readFileSync(this.path,'utf8'))
    if(old.version===1&&old.agents&&Array.isArray(old.messages)&&typeof old.agents==='object')
     this.data=old
   }catch{/* preserve unreadable original, no deletion */}
  }
 }
 snapshot(){return this.data}
 record(candleTime:string,briefs:AgentBrief[]){
  if(!Number.isFinite(Date.parse(candleTime))||briefs.length!==5)return this.data
  if(this.data.lastCandle===candleTime)return this.data
  const decision=coordinate(briefs)
  const messages=collaborate(briefs,decision,candleTime)
  const next:Stored=JSON.parse(JSON.stringify(this.data))
  for(const brief of briefs){
   next.agents[brief.id]=[...(next.agents[brief.id]??[]),{
    candleTime,side:brief.side,confidence:brief.confidence,
    reason:brief.reason,decision:decision.side
   }].slice(-120)
  }
  next.messages=[...next.messages,...messages].slice(-100)
  next.decision=decision
  next.lastCandle=candleTime
  mkdirSync(dirname(this.path),{recursive:true})
  const tmp=this.path+'.tmp'
  writeFileSync(tmp,JSON.stringify(next,null,2))
  renameSync(tmp,this.path)
  this.data=next
  return this.data
 }
}
