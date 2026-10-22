import React,{useEffect,useState} from 'react'
import './SurvivalArena.css'
type Side='BUY'|'SELL'|'WAIT'
type Agent={id:string;name:string;role:string;accent:string;side:Side;reason:string;confidence:number;life:number|null;correct?:number;wrong?:number;realizedPL:number|null;status:string}
type Note={from:string;to:string;message:string}
type Challenge={id:string;status:string;days:Array<{date:string;realizedPL:number|null;met:boolean|null;tradeCount:number}>}
type Snapshot={source:string;updatedAt:string|null;status:string;profitChallenge?:Challenge[];agents:Agent[];messages:Note[];riskMessage:string;expiresAt:string}
const fallback=[
 ['atlas','Atlas','Tendência','#46cfa9'],['nova','Nova','Reversão','#b792ff'],
 ['pixel','Pixel','Volume','#ffc36f'],['sage','Sage','Proteção','#6db5fc'],
 ['echo','Echo','Consenso','#fb8bb7']
].map(([id,name,role,accent])=>({id,name,role,accent,side:'WAIT' as Side,reason:'Aguardando OANDA',confidence:0,life:null,correct:0,wrong:0,realizedPL:null,status:'RESEARCH_ONLY'}))
const desks=[{x:274,y:252},{x:500,y:208},{x:725,y:276},{x:368,y:480},{x:632,y:482}]

// Individual walking routes use SVG native transforms so characters really
// travel between desks (not just bob in place). Purely visual: no fake orders.
const walkingRoutes=[
 '0 0; 25 5; 72 25; 102 65; 82 75; 30 30; 0 0; 0 0',
 '0 0; -25 16; -65 52; -96 92; -65 52; -15 22; 0 0; 0 0',
 '0 0; -26 16; -80 38; -122 82; -86 65; -28 18; 0 0; 0 0',
 '0 0; 24 -18; 65 -52; 90 -76; 62 -45; 18 -12; 0 0; 0 0',
 '0 0; -24 -16; -68 -45; -103 -82; -72 -45; -24 -12; 0 0; 0 0'
]

function Desk({x,y,accent}:{x:number;y:number;accent:string}){
 return <g transform={`translate(${x} ${y})`}>
  <ellipse cx="4" cy="37" rx="86" ry="29" fill="#081322" opacity=".28"/>
  <polygon points="-74,-15 -1,-51 77,-15 1,22" fill="#506176"/>
  <polygon points="-74,-15 1,22 1,35 -74,-2" fill="#273b4a"/>
  <polygon points="1,22 77,-15 77,-2 1,35" fill="#34495b"/>
  <polygon points="-28,-22 -4,-34 35,-14 10,0" fill="#132634"/>
  <polygon points="-27,-22 -7,-32 31,-14 10,-4" fill="#1d3947"/>
  <polygon points="-19,-21 -3,-29 21,-17 4,-9" fill={accent} opacity=".72"/>
  <polygon points="-4,-4 17,-14 22,-11 1,0" fill="#b8d2d8"/>
  <polygon points="9,0 25,-8 43,1 28,10" fill="#142637"/>
  <polygon points="-27,7 -4,-5 23,9 0,21" fill="#37485d"/>
  <ellipse cx="-28" cy="0" rx="11" ry="6" fill="#b4c9bc"/>
  <path d="M-28 0v-13" stroke="#99b5aa" strokeWidth="4"/>
 </g>
}
function Avatar({agent,x,y,chosen,onClick,index}:{agent:Agent;x:number;y:number;chosen:boolean;onClick:()=>void;index:number}){
 return <g onClick={onClick} className={'arena-avatar'+(chosen?' selected':'')} style={{cursor:'pointer'}}>
  <animateTransform attributeName="transform" type="translate" values={walkingRoutes[index]} keyTimes="0;0.14;0.28;0.43;0.57;0.72;0.86;1" dur={`${17+index*2}s`} repeatCount="indefinite" calcMode="linear"/>
  <g className="arena-avatar-bob">
   <ellipse cx={x} cy={y+18} rx="22" ry="10" fill="#14222d" opacity=".35"/>
   {chosen&&<ellipse cx={x} cy={y+15} rx="28" ry="14" fill="none" stroke={agent.accent} strokeWidth="3"/>}
   <path d={`M${x-13} ${y-8}Q${x} ${y-18} ${x+13} ${y-8}L${x+15} ${y+14}Q${x} ${y+23} ${x-15} ${y+14}Z`} fill={agent.accent} stroke="#253443" strokeWidth="2"/>
   <rect x={x-12} y={y-29} width="24" height="25" rx="9" fill="#e7ad85"/>
   <path d={`M${x-12} ${y-19}Q${x-13} ${y-42} ${x+8} ${y-31}L${x+13} ${y-21}Q${x+2} ${y-31} ${x-12} ${y-19}`} fill="#2c3149"/>
   <rect x={x-11} y={y+12} width="9" height="12" rx="3" fill="#23324b"/>
   <rect x={x+3} y={y+12} width="9" height="12" rx="3" fill="#23324b"/>
  </g>
  <rect x={x-39} y={y-65} width="78" height="22" rx="11" fill="#142737" stroke={agent.accent} strokeOpacity=".65"/>
  <text x={x} y={y-50} textAnchor="middle" fontWeight="800" fontSize="11" fill="#fff">{agent.name}</text>
  <circle cx={x+36} cy={y-54} r="5" fill={agent.side==='WAIT'?'#a2b2c2':agent.accent}/>
 </g>
}
export default function SurvivalArena(){
 const[data,setData]=useState<Snapshot|null>(null)
 const[selected,setSelected]=useState('atlas')
 const[activity,setActivity]=useState(0)
 const[showHelp,setShowHelp]=useState(false)
 useEffect(()=>{
  let active=true
  const load=()=>fetch('/api/survival-arena').then(r=>{if(!r.ok)throw Error('OANDA offline');return r.json()}).then(x=>{if(active)setData(x)}).catch(()=>{if(active)setData(null)})
  load();const id=setInterval(load,30000)
  const talk=setInterval(()=>setActivity(n=>n+1),4500)
  return()=>{active=false;clearInterval(id);clearInterval(talk)}
 },[])
 const agents=data?.agents?.length===5?data.agents:fallback
 const picked=agents.find(a=>a.id===selected)??agents[0]
 const financial=data?.profitChallenge?.find(c=>c.id===picked.id)
 const notes=data?.messages??[]
 const note=notes.length?notes[activity%notes.length]:null
 return <section className="arena-page" aria-label="TIAGO Survival Arena">
  <div className="arena-header">
   <div><span className="arena-kicker">TIAGO • AI SURVIVAL ARENA</span>
    <h2>O escritório dos <em>5 agentes</em></h2>
    <p>Uma arena colaborativa inspirada no escritório isométrico. Análises reais da OANDA, sem P/L inventado.</p></div>
   <div className="arena-tag"><span className="arena-status-dot"/> {data?.source==='OANDA_COMPLETED_CANDLES'?'OANDA • CANDLES CONFIRMADOS':'AGUARDANDO OANDA'}<small>PESQUISA • SEM ORDENS DOS AGENTES</small></div>
  </div>
  <div className="arena-layout">
   <div className="arena-world">
    <div className="arena-world-top"><span>🏢 TIAGO TRADING OFFICE</span><span>5 agentes · 1 equipe</span><button onClick={()=>setShowHelp(v=>!v)}>{showHelp?'FECHAR':'? COMO FUNCIONA'}</button></div>
    <svg className="arena-svg" viewBox="0 0 1000 695" role="img" aria-label="Escritório isométrico com cinco mesas e cinco agentes">
     <defs><pattern id="gridfloor" width="58" height="33" patternUnits="userSpaceOnUse"><path d="M0 0H58V33" fill="none" stroke="#708997" strokeOpacity=".15"/></pattern>
      <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#93a8ac"/><stop offset="1" stopColor="#566e7d"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#4d95aa"/><stop offset="1" stopColor="#173949"/></linearGradient>
     </defs>
     <rect width="1000" height="695" fill="#263f4c"/>
     <path d="M0 165 500 0 1000 174 1000 695 500 555 0 695Z" fill="#344f59"/>
     <path d="M108 160 502 30 916 170 915 493 504 653 85 495Z" fill="#142936" opacity=".35"/>
     <polygon points="85,185 502,44 914,185 501,339" fill="#889ea4"/>
     <polygon points="85,185 501,339 501,655 85,503" fill="#344f61"/>
     <polygon points="501,339 914,185 914,501 501,655" fill="#496473"/>
     <polygon points="85,185 502,44 914,185 501,339" fill="#b4bec0"/>
     <polygon points="85,185 502,44 914,185 501,339" fill="url(#gridfloor)"/>
     <path d="M85 185V122L502 0V44Z" fill="url(#wall)"/>
     <path d="M502 0 914 122V185L502 44Z" fill="#526775"/>
     {Array.from({length:5},(_,i)=><g key={i}>
       <path d={`M${150+i*68} ${110-i*20}l47 -14v-35l-47 15Z`} fill="url(#glass)" stroke="#d0dbd9" strokeWidth="3"/>
       <path d={`M${596+i*57} ${38+i*17}l39 12v39l-39 -12Z`} fill="url(#glass)" stroke="#d0dbd9" strokeWidth="3"/>
      </g>)}
     <polygon points="231,262 501,174 776,269 501,365" fill="#a4b4b8" opacity=".9"/>
     <polygon points="231,262 501,365 501,383 231,281" fill="#8da5a8"/>
     <polygon points="501,365 776,269 776,287 501,383" fill="#90a1aa"/>
     <path d="M225 258 500 164 786 264" fill="none" stroke="#d7e0d6" strokeWidth="6" opacity=".6"/>
     <g><ellipse cx="168" cy="286" rx="27" ry="12" fill="#455d62"/><path d="M151 268L162 304H175L188 268" fill="#cb9b6e"/><circle cx="169" cy="258" r="28" fill="#448e75"/><circle cx="151" cy="260" r="21" fill="#59ad83"/></g>
     <g><ellipse cx="832" cy="283" rx="22" ry="8" fill="#43545b"/><path d="M818 266L825 291H839L849 266" fill="#c79c75"/><circle cx="832" cy="257" r="24" fill="#3a9076"/></g>
     <g><rect x="108" y="327" width="95" height="56" rx="8" fill="#546578"/><rect x="116" y="335" width="78" height="41" rx="4" fill="#263c48"/><text x="155" y="360" fill="#7feacf" fontSize="12" textAnchor="middle">OANDA</text></g>
     <g><rect x="817" y="322" width="64" height="112" rx="4" fill="#708c92"/><rect x="827" y="332" width="45" height="54" rx="4" fill="#153c49"/><text x="849" y="360" textAnchor="middle" fill="#7ce6e3" fontSize="11">LIVE</text></g>
     {agents.map((a,i)=><Desk key={a.id} {...desks[i]} accent={a.accent}/>)}
     {agents.map((a,i)=><Avatar key={a.id} agent={a} x={desks[i].x+16} y={desks[i].y+72} chosen={selected===a.id} onClick={()=>setSelected(a.id)} index={i}/>)}
     <g><rect x="345" y="585" width="321" height="44" rx="13" fill="#192c40" stroke="#75b7b3" strokeOpacity=".55"/><text x="505" y="612" textAnchor="middle" fontWeight="700" fill="#d5f4ee" fontSize="17">SURVIVAL OFFICE · OANDA PRACTICE</text></g>
    </svg>
    <div className="arena-world-bottom">
     <span className="arena-activity-dot"/><span>{note?`${note.from} → ${note.to}: ${note.message}`:'Aguardando análises colaborativas da OANDA...'}</span>
    </div>
    {showHelp&&<div className="arena-help">Os cinco personagens representam pesquisas diferentes sobre os mesmos candles completos da OANDA. Eles trocam conclusões no painel de conversas. Nenhum personagem executa ordens. A sobrevivência FINANCEIRA exige US$1 líquido realizado por bot em cada um dos dias 22 e 23 de outubro, com Trade IDs OANDA individualmente atribuídos. A energia é apenas um jogo de previsão, não lucro. Os cinco agentes ainda não enviam ordens. O Shadow 3/4 continua separado.</div>}
   </div>
   <aside className="arena-side">
    <div className="arena-panel">
     <div className="arena-side-title">AGENTES <span>05 ONLINE NA ARENA</span></div>
     {agents.map(a=><button key={a.id} className={'arena-agent-row'+(picked.id===a.id?' on':'')} onClick={()=>setSelected(a.id)}>
      <span className="arena-face" style={{background:a.accent}}>{a.name[0]}</span>
      <span className="arena-agent-text"><b>{a.name}</b><small>{a.role}</small></span>
      <span className={'arena-signal '+a.side.toLowerCase()}>{a.status==='ELIMINATED'?'ELIMINADO':a.side}</span>
     </button>)}
    </div>
    <div className="arena-panel">
     <div className="arena-side-title">MESA SELECIONADA</div>
     <h3 style={{color:picked.accent}}>{picked.name}</h3>
     <p>{picked.reason}</p>
     <div className="arena-detail-line"><span>Decisão analítica</span><b>{picked.side}</b></div>
     <div className="arena-detail-line"><span>Confiança heurística</span><b>{picked.confidence}%</b></div>
     <div className="arena-detail-line"><span>Energia de sobrevivência</span><b>{picked.life==null?'—':picked.life+' / 100'}</b></div>
     <div className="arena-energy"><div style={{width:(picked.life??0)+'%',background:picked.accent}}/></div>
     <div className="arena-detail-line"><span>Acertos / erros observados</span><b>{picked.correct??0} / {picked.wrong??0}</b></div>
     <div className="arena-detail-line"><span>Meta diária</span><b>US$1 líquido · 2 dias</b></div>
     {financial?.days.map(d=><div className="arena-detail-line" key={d.date}><span>{d.date.slice(8,10)}/10 · OANDA</span><b>{d.realizedPL===null?'Não atribuído':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(d.realizedPL)}</b></div>)}
     <div className="arena-detail-line"><span>Sobrevivência financeira</span><b>{financial?.status==='SURVIVED'?'SOBREVIVEU':financial?.status==='ELIMINATED'?'ELIMINADO':financial?.status==='IN_PROGRESS'?'EM DISPUTA':'AGUARDANDO TRADES'}</b></div>
     <small>Sobreviver exige pelo menos US$1 líquido realizado em cada dia, 22 e 23/10, por Trade IDs oficiais atribuídos ao bot. Energia de previsões não conta para a meta.</small>
    </div>
    <div className="arena-panel"><div className="arena-side-title">CONVERSAS DA EQUIPE</div>
     <div className="arena-chat">{notes.length?notes.map((n,i)=><div className="arena-chat-message" key={i}><strong>{n.from} → {n.to}</strong><span>{n.message}</span></div>):<p>Aguardando dados oficiais da OANDA.</p>}</div>
    </div>
    <div className="arena-panel arena-safety"><b>🛡️ Limites protegidos</b><p>Somente pesquisa nesta arena. Shadow não foi modificado. Novas entradas têm prazo definido; posições existentes exigem acompanhamento na OANDA.</p><small>{data?.updatedAt?'Último candle OANDA: '+new Date(data.updatedAt).toLocaleString('pt-BR'):'Fonte oficial temporariamente indisponível'}</small></div>
   </aside>
  </div>
 </section>
}
