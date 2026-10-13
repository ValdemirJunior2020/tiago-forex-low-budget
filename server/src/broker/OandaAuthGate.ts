// Shared OANDA Practice authentication gate. Never resets credentials or submits orders.
let blockedAt:string|null=null
let reason:string|null=null
let lastVerifiedAt:string|null=null
export const oandaAuthGate={
 trip(httpStatus:number){
  if(httpStatus===401||httpStatus===403){
   blockedAt=new Date().toISOString()
   reason=httpStatus===401?'OANDA_HTTP_401_UNAUTHORIZED':'OANDA_HTTP_403_FORBIDDEN'
  }
 },
 verified(){
  // Only a successful authenticated account-summary request can clear the gate.
  blockedAt=null;reason=null;lastVerifiedAt=new Date().toISOString()
 },
 assertMayOpen(){
  if(reason)throw new Error('OANDA_AUTH_BLOCKED: '+reason+'; verify Practice token and account configuration locally')
 },
 snapshot(){return {ok:reason===null,reason,blockedAt,lastVerifiedAt}}
}
