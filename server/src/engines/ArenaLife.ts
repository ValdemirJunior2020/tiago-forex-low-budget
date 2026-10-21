import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
export type ForecastSide='BUY'|'SELL'|'WAIT'
export type Forecast={id:string;side:ForecastSide}
type Competitor={id:string;energy:number;correct:number;wrong:number;forecast:{candleTime:string;close:number;side:ForecastSide}|null;lastJudged:string|null}
export type SurvivalState={version:1;agents:Record<string,Competitor>;lastUpdated:string|null}
export function initialSurvivalState(ids:string[]):SurvivalState{
 return {version:1,lastUpdated:null,agents:Object.fromEntries(ids.map(id=>[id,{id,energy:100,correct:0,wrong:0,forecast:null,lastJudged:null}]))}
}
export function updateForecasts(state:SurvivalState,current:{time:string;close:number},forecasts:Forecast[]):SurvivalState{
 if(!current?.time||!Number.isFinite(current.close))return state
 const next:SurvivalState=JSON.parse(JSON.stringify(state))
 for(const f of forecasts){
  const agent=next.agents[f.id]
  if(!agent||agent.energy<=0)continue
  const prior=agent.forecast
  if(prior&&prior.candleTime!==current.time&&prior.lastJudged!==current.time){
   const change=current.close-prior.close
   // The magnitude threshold avoids rewarding tiny price movement or spread noise.
   const threshold=prior.close*0.00003
   const moved=Math.abs(change)>threshold
   if(prior.side!=='WAIT'&&moved){
    const correct=prior.side==='BUY'?change>0:change<0
    agent.energy=Math.max(0,Math.min(100,agent.energy+(correct?6:-12)))
    if(correct)agent.correct++;else agent.wrong++
   }
   agent.lastJudged=current.time
  }
  if(!prior||prior.candleTime!==current.time)
   agent.forecast={candleTime:current.time,close:current.close,side:f.side}
 }
 next.lastUpdated=current.time
 return next
}
export class SurvivalLedger {
 private state:SurvivalState
 constructor(private readonly file:string,ids:string[]){
  this.state=initialSurvivalState(ids)
  if(existsSync(file))try{
   const raw=JSON.parse(readFileSync(file,'utf8'))
   if(raw.version===1&&raw.agents&&ids.every(id=>raw.agents[id]&&typeof raw.agents[id].energy==='number'))
    this.state=raw
  }catch{/* Keep unreadable file untouched; do not falsely claim persisted history. */}
 }
 readonlySnapshot(){return this.state}
 record(candle:{time:string;close:number},forecast:Forecast[]){
  if(this.state.lastUpdated===candle.time)return this.state
  const updated=updateForecasts(this.state,candle,forecast)
  mkdirSync(dirname(this.file),{recursive:true})
  const temporary=this.file+'.tmp'
  writeFileSync(temporary,JSON.stringify(updated,null,2))
  renameSync(temporary,this.file)
  this.state=updated
  return this.state
 }
}
