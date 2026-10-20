import {describe,it,expect} from 'vitest'
import {FINAL_TRIAL_END_UTC,finalTrialAllowsNewEntry} from './FinalTrialWindow.js'
describe('last requested Forex-Pobre Practice trial',()=>{
 it('allows new entries through Oct 21 Florida EDT only',()=>{
  expect(FINAL_TRIAL_END_UTC).toBe('2026-10-22T04:00:00.000Z')
  expect(finalTrialAllowsNewEntry(new Date('2026-10-21T23:59:59-04:00'))).toBe(true)
  expect(finalTrialAllowsNewEntry(new Date('2026-10-22T00:00:00-04:00'))).toBe(false)
  expect(finalTrialAllowsNewEntry(new Date('2026-10-23T12:00:00Z'))).toBe(false)
 })
})
