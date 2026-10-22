import {describe,it,expect,afterEach} from 'vitest'
import {chooseCompetitor,survivalTradingAllowed} from './SurvivalExecutor.js'
import {env} from '../config.js'
const original={survival:env.SURVIVAL_TRADING_ENABLED,low:env.LOW_BUDGET_TRADING_ENABLED}
afterEach(()=>{env.SURVIVAL_TRADING_ENABLED=original.survival;env.LOW_BUDGET_TRADING_ENABLED=original.low})
const agents=['atlas','nova','pixel','sage','echo'].map(id=>({id,side:'BUY' as const,confidence:75}))
const results=['atlas','nova','pixel','sage','echo'].map(id=>({id,status:'IN_PROGRESS',days:[{date:'2026-10-22',met:false},{date:'2026-10-23',met:null}]}))
describe('survival broker executor safety and individual selection',()=>{
 it('requires separate, explicit two-day Practice trading enablement',()=>{
  env.LOW_BUDGET_TRADING_ENABLED='true'
  env.SURVIVAL_TRADING_ENABLED='false'
  expect(survivalTradingAllowed(new Date('2026-10-22T15:00:00Z'))).toBe(false)
  env.SURVIVAL_TRADING_ENABLED='true'
  expect(survivalTradingAllowed(new Date('2026-10-22T15:00:00Z'))).toBe(true)
  expect(survivalTradingAllowed(new Date('2026-10-24T04:00:00Z'))).toBe(false)
  expect(survivalTradingAllowed(new Date('2026-10-21T15:00:00Z'))).toBe(false)
 })
 it('rotates across eligible agents; skips eliminated, achieved or already used candle',()=>{
  const candle='2026-10-22T15:00:00Z'
  expect(chooseCompetitor(agents,results,{},candle,'2026-10-22')).toBe('atlas')
  const last={atlas:candle}
  expect(chooseCompetitor(agents,results,last,candle,'2026-10-22')).toBe('nova')
  expect(chooseCompetitor(agents,results,{atlas:'2026-10-22T14:00:00Z'},candle,'2026-10-22')).toBe('nova')
  const disabled=results.map(r=>r.id==='nova'?{...r,status:'ELIMINATED'}:r)
  expect(chooseCompetitor(agents,disabled,{atlas:candle},candle,'2026-10-22')).toBe('pixel')
  const finished=results.map(r=>r.id==='atlas'?{...r,days:[{date:'2026-10-22',met:true}]}:r)
  expect(chooseCompetitor(agents,finished,{},candle,'2026-10-22')).toBe('nova')
 })
 it('never treats a WAIT signal as permission to enter the market',()=>{
  expect(chooseCompetitor(agents.map(x=>({...x,side:'WAIT' as const})),results,{},'c','2026-10-22')).toBeNull()
 })
})
