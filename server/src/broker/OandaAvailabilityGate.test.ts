import {describe,it,expect} from 'vitest'
import {OandaAvailabilityGate} from './OandaAvailabilityGate.js'

describe('OANDA read-only outage cooldown',()=>{
 it('backs off exhausted broker failures and permits bounded recovery probes',()=>{
  const gate=new OandaAvailabilityGate()
  expect(gate.canRead(1000)).toBe(true)
  gate.recordFailure('Broker HTTP 503',1000)
  expect(gate.snapshot().status).toBe('DEGRADED')
  expect(gate.canRead(30999)).toBe(false)
  expect(gate.canRead(31000)).toBe(true)
  gate.recordFailure('Broker HTTP 504',31000)
  expect(gate.canRead(90999)).toBe(false)
  expect(gate.canRead(91000)).toBe(true)
  gate.recordFailure('Broker HTTP 503',91000)
  gate.recordFailure('Broker HTTP 503',211000)
  gate.recordFailure('Broker HTTP 503',451000)
  expect(gate.snapshot().nextProbeAt).toBe(751000)
  expect(()=>gate.assertRead(750999)).toThrow('OANDA_UPSTREAM_COOLDOWN')
  expect(()=>gate.assertRead(751000)).not.toThrow()
 })
 it('clears the cooldown only when an OANDA read succeeds',()=>{
  const gate=new OandaAvailabilityGate()
  gate.recordFailure('Broker HTTP 503',1000)
  gate.recordSuccess()
  expect(gate.snapshot()).toEqual({status:'READY',failures:0,nextProbeAt:null,lastError:null})
  expect(gate.canRead(1001)).toBe(true)
 })
})
