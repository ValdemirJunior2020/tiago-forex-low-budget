import {describe,it,expect} from 'vitest'
import {initialSurvivalState,updateForecasts} from './ArenaLife.js'
describe('survival arena evidence and elimination',()=>{
 it('starts with five independent agents and zero fabricated profit',()=>{
  const s=initialSurvivalState(['atlas','nova','pixel','sage','echo'])
  expect(Object.keys(s.agents)).toHaveLength(5)
  expect(s.agents.atlas.energy).toBe(100)
  expect(s.agents.atlas.correct).toBe(0)
 })
 it('judges only a later completed OANDA candle and never duplicate scores',()=>{
  let s=initialSurvivalState(['atlas','nova'])
  s=updateForecasts(s,{time:'t1',close:1.1},[{id:'atlas',side:'BUY'},{id:'nova',side:'SELL'}])
  expect(s.agents.atlas.correct).toBe(0)
  s=updateForecasts(s,{time:'t2',close:1.101},[{id:'atlas',side:'WAIT'},{id:'nova',side:'WAIT'}])
  expect(s.agents.atlas.correct).toBe(1)
  expect(s.agents.nova.wrong).toBe(1)
  expect(s.agents.nova.energy).toBe(88)
  s=updateForecasts(s,{time:'t2',close:1.101},[{id:'atlas',side:'WAIT'},{id:'nova',side:'WAIT'}])
  expect(s.agents.nova.wrong).toBe(1)
 })
 it('does not reward waiting and eventually eliminates consistently wrong predictions',()=>{
  let s=initialSurvivalState(['bot'])
  for(let i=0;i<12;i++){
   s=updateForecasts(s,{time:'t'+i,close:1.1+i*.001},[{id:'bot',side:'SELL'}])
  }
  expect(s.agents.bot.energy).toBe(0)
  expect(s.agents.bot.wrong).toBeGreaterThan(0)
  const n=s.agents.bot.wrong
  s=updateForecasts(s,{time:'future',close:1.2},[{id:'bot',side:'BUY'}])
  expect(s.agents.bot.wrong).toBe(n)
 })
})
