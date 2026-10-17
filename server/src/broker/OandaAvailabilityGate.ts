// Shared read-only outage backoff. Does not submit, retry, cancel, or modify broker orders.
// After an exhausted transient failure, postpone subsequent reads and permit a periodic probe.
export class OandaAvailabilityGate {
 private failures=0
 private nextProbeAt=0
 private lastError:string|null=null
 canRead(now=Date.now()){return now>=this.nextProbeAt}
 assertRead(now=Date.now()){
  if(!this.canRead(now))throw Error('OANDA_UPSTREAM_COOLDOWN: read requests paused until next recovery probe')
 }
 recordFailure(detail:string,now=Date.now()){
  this.failures=Math.min(this.failures+1,8)
  this.nextProbeAt=now+Math.min(300000,30000*2**(this.failures-1))
  this.lastError=detail
 }
 recordSuccess(){
  this.failures=0;this.nextProbeAt=0;this.lastError=null
 }
 snapshot(){return {status:this.failures?'DEGRADED':'READY',failures:this.failures,nextProbeAt:this.nextProbeAt||null,lastError:this.lastError}}
}
export const oandaAvailabilityGate=new OandaAvailabilityGate()
