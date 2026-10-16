import {afterEach,describe,expect,it,vi} from 'vitest'
import {OandaReadOnly} from './OandaReadOnly.js'
import {oandaAuthGate} from './OandaAuthGate.js'
import {env} from '../config.js'

const originalFetch=globalThis.fetch
afterEach(()=>{globalThis.fetch=originalFetch;oandaAuthGate.verified();vi.restoreAllMocks()})
describe('intermittent OANDA GET authorization failures',()=>{
 it('retries 401 on read-only pricing and keeps entries blocked until verified account summary',async()=>{
  let calls=0
  globalThis.fetch=vi.fn(async()=>{
   calls++
   if(calls===1)return new Response('{}',{status:401})
   if(calls===2)return new Response(JSON.stringify({prices:[{time:new Date().toISOString(),bids:[{price:'1.12340'}],asks:[{price:'1.12350'}]}]}),{status:200})
   return new Response(JSON.stringify({account:{id:env.OANDA_ACCOUNT_ID,balance:'1000',unrealizedPL:'0',marginUsed:'0',marginAvailable:'1000'}}),{status:200})
  }) as typeof fetch
  const broker=new OandaReadOnly()
  const quote=await broker.quote('EUR_USD')
  expect(quote.bid).toBe('1.1234')
  expect(calls).toBe(2)
  expect(oandaAuthGate.snapshot().ok).toBe(false)
  expect(()=>oandaAuthGate.assertMayOpen()).toThrow('OANDA_AUTH_BLOCKED')
  await broker.account()
  expect(oandaAuthGate.snapshot().ok).toBe(true)
 })
 it('does not retry forbidden 403 GET errors',async()=>{
  const spy=vi.fn(async()=>new Response('{}',{status:403}))
  globalThis.fetch=spy as typeof fetch
  await expect(new OandaReadOnly().quote('EUR_USD')).rejects.toThrow('Broker HTTP 403')
  expect(spy).toHaveBeenCalledTimes(1)
  expect(oandaAuthGate.snapshot().ok).toBe(false)
 })
})
