import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import type {OandaReadOnly} from '../broker/OandaReadOnly.js'

type Prediction={side:'BUY'|'SELL'|'WAIT';confidence:number;status:string;validation:{fitness:number;signals:number;sampleCount:number};lastTrainingCandle:string}
type Output={source:string;agents:Record<string,Prediction>}
const root=resolve('..')
const script=resolve(root,'neat/neat_agents.py')
const file=resolve(root,'data/neat-candles.json')
const models=resolve(root,'data/neat-models')
const reports=resolve(models,'reports.json')
const ids=['atlas','nova','pixel','sage','echo']

function python(mode:'train'|'predict'):Promise<Output>{
 return new Promise((done,reject)=>{
  const executable=process.platform==='win32'?'py':'python3'
  const prefix=process.platform==='win32'?['-3']:[]
  const task=spawn(executable,[...prefix,script,mode,'--input',file,'--models',models],{
   cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let stdout='',stderr=''
  const timer=setTimeout(()=>task.kill(),mode==='train'?180000:20000)
  task.stdout.on('data',part=>{stdout+=String(part).slice(0,300000)})
  task.stderr.on('data',part=>{stderr+=String(part).slice(0,3000)})
  task.on('error',err=>{clearTimeout(timer);reject(err)})
  task.on('close',code=>{clearTimeout(timer)
   if(code!==0){reject(new Error((stderr||'Local NEAT subprocess exited '+code).slice(-500)));return}
   try{done(JSON.parse(stdout.trim()) as Output)}catch{reject(new Error('NEAT returned invalid JSON'))}
  })
 })
}
export class LocalNeatResearch{
 private state:'DISABLED'|'WAITING_FOR_OANDA'|'TRAINING'|'READY'|'ERROR'='WAITING_FOR_OANDA'
 private error:string|null=null
 private models:Record<string,Prediction>={}
 private trainedAt:string|null=null
 private busy=false
 constructor(private readonly broker:Pick<OandaReadOnly,'candles'>){}
 snapshot(){return{source:'NEAT_PYTHON_LOCAL_RESEARCH',status:this.state,error:this.error,trainedAt:this.trainedAt,
  predictions:this.models,brokerOrdersEnabled:false,agents:ids,usesHistoricalCompletedCandles:true}}
 async update(){
  if(this.busy)return
  this.busy=true
  try{
   // Data is from the official broker API, never fabricated and never downloaded from an unrelated source.
   const bars=await this.broker.candles('EUR_USD','M5',500)
   if(bars.length<120){this.state='WAITING_FOR_OANDA';return}
   mkdirSync(resolve(root,'data'),{recursive:true})
   writeFileSync(file,JSON.stringify({bars}))
   // Retrain at most once per day, keeping last known model if available.
   const latest=bars.at(-1)!.time
   const previous=existsSync(reports)?JSON.parse(readFileSync(reports,'utf8')):null
   const last=previous?.atlas?.lastTrainingCandle as string|undefined
   if(!last||Date.parse(latest)-Date.parse(last)>86400000){
    this.state='TRAINING'
    await python('train')
   }
   const result=await python('predict')
   if(!ids.every(id=>result.agents[id]?.status==='RESEARCH_ONLY'))throw Error('NEAT prediction incomplete')
   this.models=result.agents
   this.trainedAt=latest
   this.state='READY';this.error=null
  }catch(e){this.state='ERROR';this.error=String(e).slice(0,250)}
  finally{this.busy=false}
 }
}
