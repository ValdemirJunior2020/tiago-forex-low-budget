import {describe,it,expect} from 'vitest'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ArenaTeamMemory,collaborate,coordinate,type AgentBrief} from './ArenaTeam.js'
const briefs:AgentBrief[]=[
 {id:'atlas',name:'Atlas',side:'BUY',confidence:75,reason:'trend'},
 {id:'nova',name:'Nova',side:'BUY',confidence:70,reason:'reversal'},
 {id:'pixel',name:'Pixel',side:'BUY',confidence:78,reason:'volume'},
 {id:'sage',name:'Sage',side:'BUY',confidence:71,reason:'risk'},
 {id:'echo',name:'Echo',side:'WAIT',confidence:0,reason:'coordinator'}
]
describe('agent collaboration coordinator and persisted trace',()=>{
 it('requires 3/4 confirmation plus Sage agreement and never grants order permission',()=>{
  const d=coordinate(briefs)
  expect(d.status).toBe('CONSENSUS');expect(d.side).toBe('BUY');expect(d.canSubmitOrder).toBe(false)
  expect(collaborate(briefs,d,'2026-10-22T15:00:00Z')).toHaveLength(7)
 })
 it('vetoes even 3 votes when Sage disagrees; does not trade on no setup',()=>{
  expect(coordinate(briefs.map(b=>b.id==='sage'?{...b,side:'WAIT'}:b)).status).toBe('VETO')
  expect(coordinate(briefs.map(b=>({...b,side:'WAIT'}))).side).toBe('WAIT')
 })
 it('writes each agent memory once per OANDA candle and persists after restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'team-office-'))
  try{
   const file=join(dir,'team.json')
   const team=new ArenaTeamMemory(file)
   team.record('2026-10-22T15:00:00Z',briefs)
   team.record('2026-10-22T15:00:00Z',briefs)
   expect(team.snapshot().messages).toHaveLength(7)
   expect(team.snapshot().agents.atlas).toHaveLength(1)
   const another=new ArenaTeamMemory(file)
   expect(another.snapshot().agents.echo).toHaveLength(1)
   expect(another.snapshot().decision?.side).toBe('BUY')
   expect(JSON.parse(readFileSync(file,'utf8')).messages).toHaveLength(7)
  }finally{rmSync(dir,{recursive:true,force:true})}
 })
 it('keeps only a bounded memory and handles stale malformed data without writing',()=>{
  const team=new ArenaTeamMemory(join(tmpdir(),'nonexistent-arena-memory-'+process.pid+'.json'))
  expect(team.record('invalid',briefs).lastCandle).toBeNull()
 })
})
