import {describe,it,expect} from 'vitest'
import {DAILY_TARGET_USD,evaluateSurvival,floridaDay} from './SurvivalProfitRule.js'
const t=(id:string,date:string,pl:string,tag='SURVIVAL_ATLAS')=>({id,closeTime:date,realizedPL:pl,clientExtensions:{tag}})
describe('two-day survival challenge: $1 net verified each Florida day',()=>{
 it('counts by New York day including midnight UTC boundary',()=>{
  expect(floridaDay('2026-10-23T03:59:00Z')).toBe('2026-10-22')
  expect(floridaDay('2026-10-23T04:00:00Z')).toBe('2026-10-23')
  expect(DAILY_TARGET_USD).toBe(1)
 })
 it('requires $1 NET on BOTH days, not combined',()=>{
  const trades=[t('1','2026-10-22T16:00:00Z','2.10'),t('2','2026-10-22T17:00:00Z','-1.10'),
   t('3','2026-10-23T16:00:00Z','1.25')]
  const result=evaluateSurvival('atlas',trades,new Date('2026-10-24T05:00:00Z'))
  expect(result.days.map(x=>x.realizedPL)).toEqual([1,1.25])
  expect(result.status).toBe('SURVIVED')
 })
 it('does not count Shadow, Ollama, other agents, or unrealized trades',()=>{
  const result=evaluateSurvival('atlas',[t('1','2026-10-22T16:00:00Z','100','SHADOW_3_4'),
   t('2','2026-10-23T16:00:00Z','200','SURVIVAL_NOVA')],new Date('2026-10-24T05:00:00Z'))
  expect(result.status).toBe('AWAITING_AGENT_BROKER_TRADES')
  expect(result.days.every(x=>x.realizedPL===null)).toBe(true)
 })
 it('eliminates below-target realized day after Florida day ends',()=>{
  const result=evaluateSurvival('atlas',[t('1','2026-10-22T16:00:00Z','0.99')],new Date('2026-10-23T04:01:00Z'))
  expect(result.status).toBe('ELIMINATED')
 })
 it('keeps below-target bot in progress until its day ends',()=>{
  const result=evaluateSurvival('atlas',[t('1','2026-10-22T16:00:00Z','-0.25')],new Date('2026-10-22T20:00:00Z'))
  expect(result.status).toBe('IN_PROGRESS')
 })
})
