import {createHash} from 'node:crypto'
import {env} from '../config.js'
import type {VerifiedLesson} from './OandaOutcomeResearch.js'

// Optional sidecar. A Viking failure must NEVER change Shadow/Ollama order decisions.
export class OpenVikingBridge {
 private lastError:string|null=null
 private lastSync:string|null=null
 private sent=new Set<string>()
 private busy=false
 private readonly base='http://127.0.0.1:1933'
 private readonly accountKey=createHash('sha256').update(env.OANDA_ACCOUNT_ID||'unconfigured').digest('hex').slice(0,12)
 get enabled(){return env.OPENVIKING_ENABLED==='true'}
 snapshot(){return {enabled:this.enabled,endpoint:this.base,mode:'READ_ONLY_TRADE_LESSONS',lastSync:this.lastSync,lastError:this.lastError,submittedThisRun:this.sent.size}}
 private async post(path:string,body:unknown){
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),5000)
  try{
   const resp=await fetch(this.base+path,{method:'POST',signal:controller.signal,headers:{
    'Content-Type':'application/json',...(env.OPENVIKING_API_KEY?{'X-API-Key':env.OPENVIKING_API_KEY}:{})
   },body:JSON.stringify(body)})
   const data:any=await resp.json().catch(()=>({}))
   if(!resp.ok||data.status==='error')throw Error('OpenViking HTTP '+resp.status+': '+String(data.error?.code||data.error?.message||'request rejected'))
   return data
  }finally{clearTimeout(timeout)}
 }
 async health(){
  if(!this.enabled)return {...this.snapshot(),reachable:false}
  try{
   const c=new AbortController(),timer=setTimeout(()=>c.abort(),2500)
   try{
    const r=await fetch(this.base+'/health',{signal:c.signal})
    return {...this.snapshot(),reachable:r.ok}
   }finally{clearTimeout(timer)}
  }catch{return {...this.snapshot(),reachable:false}}
 }
 async recall(symbol:string):Promise<string[]>{
  if(!this.enabled||!env.OANDA_ACCOUNT_ID||!['EUR_USD','GBP_USD'].includes(symbol))return []
  try{
   const result:any=await this.post('/api/v1/search/find',{
    query:symbol+' Forex-Pobre OANDA confirmed trade result win loss indicators',
    target_uri:'viking://resources/forex-pobre-'+this.accountKey,
    limit:3
   })
   const data=result.result??result
   const hits=Array.isArray(data.resources)?data.resources:Array.isArray(data.hits)?data.hits:[]
   return hits.slice(0,3).map((v:any)=>String(v.abstract||v.overview||v.snippet||'').slice(0,300))
    .filter((s:string)=>s.length>0)
  }catch(e){this.lastError='OpenViking recall unavailable: '+String(e);return []}
 }
 async syncLessons(lessons:VerifiedLesson[]){
  if(!this.enabled||this.busy||!env.OANDA_ACCOUNT_ID)return
  this.busy=true
  try{
   // OANDA-verified, closed trades only. No credentials, local paths or strategy state are uploaded.
   for(const lesson of lessons.slice(-8)){
    if(!/^\d+$/.test(lesson.tradeId)||!Number.isFinite(lesson.realizedPL))continue
    const key=lesson.tradeId+':'+lesson.closedAt
    if(this.sent.has(key))continue
    const uri='viking://resources/forex-pobre-'+this.accountKey+'/trade-'+lesson.tradeId+'.md'
    const content=[
     '# Forex-Pobre verified OANDA Practice trade',
     'Trade ID: '+lesson.tradeId,'Symbol: '+lesson.symbol,'Direction: '+lesson.direction,
     'Outcome: '+lesson.outcome,'Realized P/L USD: '+lesson.realizedPL,
     'Opened: '+lesson.openedAt,'Closed: '+lesson.closedAt,
     'Observed indicators: '+JSON.stringify(lesson.features||{}),
     'OANDA completed candle closes (historical observation only): '+
       JSON.stringify(lesson.charts?.windows.map(w=>({timeframe:w.timeframe,closes:w.bars.slice(-12).map(b=>b.close)}))||[]),
     'For research only. Do not treat historical results as guaranteed future returns.'
    ].join('\n')
    // Create once; if a previous session already created the URI, replace it.
    try{await this.post('/api/v1/content/write',{uri,content,mode:'create',wait:false})}
    catch(e){
     if(!String(e).includes('409')&&!String(e).includes('ALREADY_EXISTS'))throw e
     await this.post('/api/v1/content/write',{uri,content,mode:'replace',wait:false})
    }
    this.sent.add(key)
    this.lastSync=new Date().toISOString();this.lastError=null
   }
  }catch(e){this.lastError=e instanceof Error?e.message:String(e)}
  finally{this.busy=false}
 }
}
export const openVikingBridge=new OpenVikingBridge()
