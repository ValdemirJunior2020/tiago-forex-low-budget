import {describe,it,expect} from 'vitest'
import {oandaAuthGate} from './OandaAuthGate.js'

describe('OANDA authenticated-order circuit breaker',()=>{
 it('blocks new orders after 401 until broker account verification succeeds',()=>{
  oandaAuthGate.verified()
  expect(oandaAuthGate.snapshot().ok).toBe(true)
  oandaAuthGate.trip(401)
  expect(oandaAuthGate.snapshot().reason).toBe('OANDA_HTTP_401_UNAUTHORIZED')
  expect(()=>oandaAuthGate.assertMayOpen()).toThrow('OANDA_AUTH_BLOCKED')
  oandaAuthGate.verified()
  expect(oandaAuthGate.snapshot().ok).toBe(true)
  expect(()=>oandaAuthGate.assertMayOpen()).not.toThrow()
 })
 it('treats 403 as a block and ignores unrelated HTTP errors',()=>{
  oandaAuthGate.verified()
  oandaAuthGate.trip(403)
  oandaAuthGate.trip(504)
  expect(oandaAuthGate.snapshot().reason).toBe('OANDA_HTTP_403_FORBIDDEN')
  oandaAuthGate.verified()
 })
})
