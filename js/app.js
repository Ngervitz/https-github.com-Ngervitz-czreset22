// =============================================================================
// CONSTANTS & CONFIG
// =============================================================================
const ALGORITHM_VERSION = "mi_plan_v4_tracking_printable";
const STORAGE_KEY = "cr_v3";
const API = {
  guardar:  "https://api.credizona.com.uy/api/reset/guardar",   // TODO IT
  clearing: "https://api.credizona.com.uy/api/reset/clearing",  // TODO IT
  pago:     "https://api.credizona.com.uy/api/reset/pago",      // TODO IT
  ia:       "https://api.credizona.com.uy/api/reset/ia",        // TODO IT
};
const API_TOKEN = "REEMPLAZAR_CON_TOKEN_REAL"; // TODO IT


const ESTADOS_DEUDA = [
  {v:"al_dia",      l:"🟢 Al dia",                  color:"#34ffaf", impact:"Sin impacto en tu perfil",           puntaje:0},
  {v:"atraso_leve", l:"🟡 Atraso leve (1-30 dias)",  color:"#ffd447", impact:"Empieza a afectar tu historial",     puntaje:1},
  {v:"atraso_grave",l:"🔴 Atraso grave (31-90 dias)", color:"#ff7538", impact:"Impacto fuerte — el banco ya lo ve", puntaje:2},
  {v:"mora",        l:"⛔ En mora (+90 dias)",        color:"#ff4e72", impact:"Impacto critico — prioridad maxima",  puntaje:3},
];
function getEstado(v){return ESTADOS_DEUDA.find(e=>e.v===v)||null;}
const TASAS = {tarjeta:95,prestamo:62,financiera:78,cooperativa:54,servicios:28,informal:120,mora:140};
const DEBT_TYPES = [
  {v:"tarjeta",    l:"Tarjeta de credito",  tasa:95},
  {v:"prestamo",   l:"Prestamo bancario",   tasa:62},
  {v:"financiera", l:"Financiera",          tasa:78},
  {v:"cooperativa",l:"Cooperativa",         tasa:54},
  {v:"servicios",  l:"Servicios atrasados", tasa:28},
  {v:"informal",   l:"Prestamo informal",   tasa:120},
  {v:"mora",       l:"Deuda en mora",       tasa:140},
];
const EXPENSE_CATS = [
  {k:"alquiler",    l:"Alquiler / Vivienda"},
  {k:"servicios",   l:"Servicios (UTE, OSE, ANTEL)"},
  {k:"alimentacion",l:"Alimentacion"},
  {k:"transporte",  l:"Transporte"},
  {k:"salud",       l:"Salud / mutualista"},
  {k:"otros",       l:"Otros gastos"},
];
const SITUACION_LABELS = {
  relacion_dependencia:"Relacion de dependencia",
  monotributista:"Monotributista",
  responsable_inscripto:"Responsable inscripto",
  informal:"Trabajo informal",
  desempleado:"Sin ingreso fijo",
};

// =============================================================================
// PRE-LOADED DATA
// =============================================================================
function getPreLoaded() {
  const p = new URLSearchParams(window.location.search);
  const resp = {};
  for (let i=1;i<=10;i++) resp["p"+i] = p.get("p"+i)||null;
  return {
    nombre:   p.get("nombre")  || "Martin Rodriguez",
    cedula:   p.get("cedula")  || "3.456.789-0",
    email:    p.get("email")   || "martin@email.com",
    telefono: p.get("telefono")|| "",
    ingreso:  parseFloat(p.get("ingreso"))||65000,
    laboral:  p.get("laboral") || "relacion_dependencia",
    monto:    parseFloat(p.get("monto"))||0,
    respuestas: resp,
  };
}
const PRE = getPreLoaded();
const TIENE_ENCUESTA = Object.values(PRE.respuestas).some(v=>v!==null);
const SEGMENTO = !!new URLSearchParams(window.location.search).get("ingreso")
  ? (TIENE_ENCUESTA ? 1 : 2) : 3;

// =============================================================================
// STATE
// =============================================================================
let step = 0;
let gastos = {};
let deudas = [];
let diag = null;
let saldoInicial = 0;
let snapshot = null;
let activeTab = "situacion";
let resetPlusEstado = "sin_pago";
let iaResultado = null;
let herramientas = {ingresos:{formal:0,extras:[],total:0},gastos_clasificados:{},gestiones:{},compromisos:{},semaforo:{},habitos:{},atrasos:{},vencimientos:{}};

// =============================================================================
// STORAGE
// =============================================================================
function guardarLocal(extra={}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      step,gastos,deudas,diag,saldoInicial,snapshot,
      activeTab,resetPlusEstado,iaResultado,herramientas,
      fecha:new Date().toISOString(),algorithm_version:ALGORITHM_VERSION,...extra
    }));
  } catch(e){}
}
function cargarLocal() {
  try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch(e){return null;}
}

// =============================================================================
// TRACKING & CRM
// =============================================================================
function track(evento, datos={}) {
  const payload = {
    event: evento,
    app: "credizona_mi_plan",
    algorithm_version: ALGORITHM_VERSION,
    timestamp: new Date().toISOString(),
    segmento: SEGMENTO,
    ...datos
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);

  console.log("[MI_PLAN]", evento, payload);
}
function buildCRMData(motor) {
  return {
    user:{nombre:PRE.nombre,cedula:PRE.cedula,email:PRE.email,telefono:PRE.telefono,
      ingreso_declarado:PRE.ingreso,situacion_laboral:PRE.laboral,monto_solicitado:PRE.monto,segmento:SEGMENTO},
    survey:{completada:TIENE_ENCUESTA,score:motor?.enc?.score,nivel:motor?.enc?.nivel,b_plus:motor?.enc?.bPlus,flags:motor?.enc?.flagsRiesgo,version_algoritmo:"reset_v2_simple"},
    expenses:gastos,
    debts:deudas.map(d=>({...d,interes_estimado:TASAS[d.tipo]||62,priority_score:calcularPrioridad(d)})),
    diagnosis:motor?{deuda_total:motor.fin.totalDeuda,pago_mensual_total:motor.fin.totalPago,
      interes_promedio:motor.fin.interesProm,nivel_riesgo:motor.fin.nivelRiesgo,
      score_reset:motor.scoreReset,nivel_reset:motor.nivelR,plan_id:motor.planId,
      causa_principal:motor.causaPrincipal,capacidad_segura_ataque:motor.capacidadSeguraAtaque,
      horizontes:motor.horizontes,partner_candidate:motor.partnerCandidate}:{},
    informe_completo:{estado:resetPlusEstado},
    metadata:{algorithm_version:ALGORITHM_VERSION,timestamp:new Date().toISOString(),segmento:SEGMENTO},
  };
}
async function enviarCRM(evento, motor) {
  track(evento, buildCRMData(motor));
  try{await fetch(API.guardar,{method:"POST",headers:{"Content-Type":"application/json","X-Reset-Token":API_TOKEN},body:JSON.stringify({evento,...buildCRMData(motor)})});}
  catch(e){console.warn("[CRM]",e.message);}
}

// =============================================================================
// HELPERS
// =============================================================================
const fmt = n => "$"+Number(n||0).toLocaleString("es-UY",{maximumFractionDigits:0});
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function colorRiesgo(r){return r==="Critico"?"#ff4e72":r==="Medio"?"#ffd36f":"#34ffaf";}
function colorScore(s){return s>=21?"#34ffaf":s>=12?"#ffd36f":"#ff4e72";}
function colorNivel(n){return n==="A"||n==="MANEJABLE"?"#34ffaf":n==="B+"?"#a78bfa":n==="B"||n==="EN PROCESO"?"#ffd36f":"#ff4e72";}
function nivelTexto(n){return n==="A"?"MANEJABLE":n==="B+"?"MUY BUENO":n==="B"?"EN PROCESO":n==="C"?"REQUIERE ATENCION":n;}

// =============================================================================
// MOTOR — ENCUESTA
// =============================================================================
function p2n(r){return r==="A"?3:r==="B"?2:r==="C"?1:r==="D"?0:null;}
function calcularEncuesta(resp) {
  // Algoritmo reset_v2_simple — suma directa P1-P10, max 30 pts
  if(!resp||!TIENE_ENCUESTA) return {score:15,scoreTotal:0,nivel:"B",bPlus:false,flagsRiesgo:[],version:"reset_v2_simple"};
  const v = k => p2n(resp["p"+k]);

  // Suma directa de los 10 items (0-3 cada uno, max 30)
  const scoreTotal = [1,2,3,4,5,6,7,8,9,10]
    .reduce((s,k)=>{ const val=v(k); return s+(val!==null?val:0); }, 0);

  // Normalizar a 0-100 para compatibilidad con el motor
  const score = scoreTotal; // 0-30 scale, no normalization

  // Segmentacion: A=24-30, B=15-23, C=0-14
  let nivel = scoreTotal>=24?"A":scoreTotal>=15?"B":"C";
  const flags = [];

  // Reglas duras — forzar C
  if(resp.p6==="D"){nivel="C";flags.push("prestamo_informal");}
  if(resp.p8==="D"){nivel="C";flags.push("sin_accion_reciente");}
  if(resp.p10==="D"){nivel="C";flags.push("sin_constancia");}

  // Flag B+: nivel B con buena disposicion al cambio
  const bPlus = nivel==="B"
    && resp.p8==="A"
    && (resp.p3==="A"||resp.p3==="B")
    && (resp.p10==="A"||resp.p10==="B");

  return {score:scoreTotal,nivel:bPlus?"B+":nivel,nivelBase:nivel,bPlus,flagsRiesgo:flags,version:"reset_v2_simple"};
}

// =============================================================================
// MOTOR — FINANCIERO
// =============================================================================
function calcularFinanciero() {
  const totalGastos=Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const totalDeuda=deudas.reduce((s,d)=>s+(parseFloat(d.monto)||0),0);
  const totalPago=deudas.reduce((s,d)=>s+(parseFloat(d.pago)||0),0);
  const ingreso=PRE.ingreso;
  const flujoLibre=ingreso-totalGastos-totalPago;
  const ratio=ingreso>0?totalPago/ingreso:0;
  let interesProm=0;
  if(totalDeuda>0) interesProm=Math.round(deudas.reduce((s,d)=>{const m=parseFloat(d.monto)||0;return s+(m/totalDeuda)*(TASAS[d.tipo]||62);},0));
  let score=100;
  if(ratio>0.50)score-=38;else if(ratio>0.35)score-=24;else if(ratio>0.20)score-=10;
  if(flujoLibre<0)score-=32;else if(flujoLibre<ingreso*.10)score-=14;
  const moras=deudas.filter(d=>d.estado==="mora"||d.estado==="atraso_grave").length;
  const informales=deudas.filter(d=>d.tipo==="informal").length;
  score-=Math.min(moras*12,25);
  if(informales>0)score-=16;
  if(deudas.length>=5)score-=10;
  if(totalGastos>ingreso*.85)score-=10;
  score=clamp(Math.round(score),0,100);
  const score30 = clamp(Math.round(score/100*30),0,30);
  let nivelRiesgo="Bajo";
  if(totalPago>50000||interesProm>90)nivelRiesgo="Critico";
  else if(totalPago>25000||interesProm>60)nivelRiesgo="Medio";
  return {totalGastos,totalDeuda,totalPago,flujoLibre,ratio,interesProm,scoreFinanciero:score30,scoreFinanciero100:score,nivelRiesgo,cantMoras:moras,cantInformales:informales};
}

function calcularPrioridad(d) {
  const est=getEstado(d.estado);
  return (parseFloat(d.monto)||0)*0.12+(parseFloat(d.pago)||0)*0.30+(TASAS[d.tipo]||62)*35+(est?est.puntaje*2500:0);
}
function deudaPrioritaria() {
  if(!deudas.length)return null;
  return [...deudas].sort((a,b)=>calcularPrioridad(b)-calcularPrioridad(a))[0];
}

// =============================================================================
// PLANES
// =============================================================================
const PLANES = {
  1:{id:1,titulo:"Orden Financiero",icon:"🗂️",color:"#5b7cff",
    problema:"No tenes claro cuanto entra, cuanto sale ni cuanto debes. Sin eso, cualquier plan es a ciegas.",
    objetivo:"Entender exactamente tu situacion financiera antes de tomar cualquier decision.",
    prioridades:["Anotar todo lo que entra y todo lo que sale este mes, sin excepcion.","Separar lo que no podes dejar de pagar de lo que podes reducir.","Calcular cuanta plata te queda libre cada mes despues de pagar todo."],
    cta:"Completar mapa financiero",reevaluacion:"30 dias"},
  2:{id:2,titulo:"Reduccion de Deuda",icon:"📉",color:"#ff4e72",
    problema:"Estas pagando demasiado en relacion a lo que ganas. Cada mes es un esfuerzo y no alcanzas a salir.",
    objetivo:"Bajar lo que pagas por mes y atacar primero las deudas que mas te estan frenando.",
    prioridades:["Atacar primero la deuda que mas dano te hace — la que esta en mora o la mas cara.","No sacar ninguna deuda nueva por al menos 30 dias.","Llamar al banco o financiera para negociar. Muchas veces aceptan planes que no publicitan."],
    cta:"Ver deuda prioritaria",reevaluacion:"60 a 90 dias"},
  3:{id:3,titulo:"Recuperacion Rapida",icon:"🚀",color:"#34ffaf",
    problema:"Tu situacion esta bien encaminada. Hay algunos detalles que corregir para que el banco te diga que si.",
    objetivo:"Hacer los ajustes puntuales que faltan para que el banco te apruebe en la proxima solicitud.",
    prioridades:["Pagar todo en fecha. Un solo atraso puede echarte atras meses de progreso.","Bajar lo que pagas en deudas para que sea menos del 30% de lo que ganas.","En 30-60 dias volver a evaluar el perfil para ver si ya podes aplicar."],
    cta:"Activar plan 30-60 dias",reevaluacion:"30 a 60 dias"},
  4:{id:4,titulo:"Estabilizacion Critica",icon:"🚨",color:"#ff4e72",
    problema:"Tu situacion esta en un punto critico. Antes de pedir otro credito, hay que estabilizar lo que tenes.",
    objetivo:"Parar la caida primero. Estabilizarte. Despues, con la situacion ordenada, pensar en el credito.",
    prioridades:["No tomar ninguna deuda nueva bajo ningun concepto.","Ordenar las deudas informales y las que estan en mora. Son las que mas dano hacen.","Lograr que cada mes te sobre aunque sea un poco. Eso es la base de todo."],
    cta:"Empezar primeros auxilios",reevaluacion:"90 a 120 dias"},
  5:{id:5,titulo:"Reperfilamiento",icon:"🔄",color:"#a78bfa",
    problema:"Tu historial financiero esta danado, pero tu actitud muestra que queres salir. Eso es recuperable.",
    objetivo:"Reconstruir el perfil con habitos sostenidos, menor presion de deuda y seguimiento.",
    prioridades:["Hacer lo mismo bien durante 60-90 dias seguidos. La constancia es lo que reconstruye el historial.","Regularizar o negociar los atrasos que figuran reportados. Eso limpia el perfil.","En 90 dias, volver a medir el avance antes de pedir el credito."],
    cta:"Iniciar seguimiento 90 dias",reevaluacion:"90 dias"},
};

function asignarPlan(enc, fin) {
  const r=PRE.respuestas;
  if(enc.nivel==="C"||fin.flujoLibre<0||fin.cantInformales>0||(fin.cantMoras>=2))return 4;
  if(fin.ratio>0.35||fin.cantMoras>0||fin.nivelRiesgo==="Critico")return 2;
  if(fin.nivelRiesgo==="Medio"&&(r.p1==="C"||r.p1==="D"||r.p7==="C"||r.p7==="D"))return 1;
  if((enc.nivel==="A"||enc.nivel==="B+")&&fin.ratio<0.35&&fin.cantMoras===0&&fin.flujoLibre>0)return 3;
  if((r.p3==="A"||r.p3==="B")&&(r.p8==="A"||r.p8==="B")&&(r.p9==="A"||r.p9==="B"))return 5;
  return 1;
}

function detectarCausaPrincipal(enc, fin) {
  const r = PRE.respuestas || {};
  if(fin.flujoLibre < 0) return "flujo_negativo";
  if(fin.cantMoras > 0) return "mora_activa";
  if(fin.interesProm >= 85) return "deuda_cara";
  if(deudas.length >= 5) return "demasiadas_deudas";
  if(r.p1 === "C" || r.p1 === "D" || r.p7 === "C" || r.p7 === "D") return "falta_organizacion";
  if(r.p5 === "C" || r.p5 === "D") return "estres_alto";
  if(r.p8 === "C" || r.p8 === "D") return "sin_accion";
  return "ordenar_y_sostener";
}

function labelCausaPrincipal(causa) {
  const labels = {
    flujo_negativo: "Te está faltando aire mensual",
    mora_activa: "La mora está dañando tu perfil",
    deuda_cara: "Los intereses están comiendo tu plata",
    demasiadas_deudas: "Tenés demasiados pagos abiertos",
    falta_organizacion: "Falta claridad para decidir bien",
    estres_alto: "El estrés financiero está mandando",
    sin_accion: "Todavía falta pasar a la acción",
    ordenar_y_sostener: "El foco es sostener buenos hábitos"
  };
  return labels[causa] || labels.ordenar_y_sostener;
}

function calcularHorizontes(fin, planId) {
  const base = planId === 4 || fin.flujoLibre < 0 ? "emergencia" : planId === 2 ? "deuda" : "orden";
  if(base === "emergencia") {
    return {
      d30: "Frenar nuevas deudas y recuperar control mensual.",
      d90: "Regularizar atrasos principales y estabilizar pagos mínimos.",
      d180: "Reperfilar deudas caras y volver a evaluar oportunidades."
    };
  }
  if(base === "deuda") {
    return {
      d30: "Elegir la deuda prioritaria y negociar o atacarla primero.",
      d90: "Bajar presión mensual y reducir intereses evitables.",
      d180: "Mostrar historial más ordenado y menor carga de deuda."
    };
  }
  return {
    d30: "Ordenar datos, vencimientos y pagos del mes.",
    d90: "Sostener pagos en fecha y reducir la deuda más sensible.",
    d180: "Consolidar hábitos y volver a medir el perfil completo."
  };
}

function detectarPartnerCandidate(fin, prio) {
  if(!prio) return null;
  const est = getEstado(prio.estado);
  const tasa = TASAS[prio.tipo] || 62;
  const consolidable = ["tarjeta","financiera","prestamo","cooperativa","mora"].includes(prio.tipo);
  if(consolidable && (tasa >= 75 || (est && est.puntaje >= 2) || fin.ratio > 0.35)) {
    return {
      eligible: true,
      reason: "deuda_consolidable_o_refinanciable",
      possible_partners: ["ChauDeudas", "MiDeuda"],
      visible_to_user: false
    };
  }
  return { eligible:false, visible_to_user:false };
}

function calcularMotor() {
  const enc=calcularEncuesta(PRE.respuestas);
  const fin=calcularFinanciero();
  const scoreReset=clamp(Math.round(fin.scoreFinanciero*.55+enc.score*.45),0,30);
  let nivelR=scoreReset>=21?"A":scoreReset>=12?"B":"C";
  const planId=asignarPlan(enc,fin);
  if(planId===4)nivelR="C";
  if(planId===2&&nivelR==="A")nivelR="B";
  const plan=PLANES[planId];
  const prio=deudaPrioritaria();
  const causaPrincipal=detectarCausaPrincipal(enc,fin);
  const capacidadSeguraAtaque=Math.max(0,Math.round(fin.flujoLibre-(PRE.ingreso*0.10)));
  const horizontes=calcularHorizontes(fin,planId);
  const partnerCandidate=detectarPartnerCandidate(fin,prio);
  const diasRec=snapshot?Math.floor((Date.now()-new Date(snapshot.fecha_inicio).getTime())/86400000):0;
  return {enc,fin,scoreReset,nivelR,planId,plan,prio,causaPrincipal,causaLabel:labelCausaPrincipal(causaPrincipal),capacidadSeguraAtaque,horizontes,partnerCandidate,diasRec};
}

// =============================================================================
// INIT
// =============================================================================
function init() {
  const sesion=cargarLocal();
  if(sesion&&sesion.diag){
    step=3;gastos=sesion.gastos||{};deudas=sesion.deudas||[];
    diag=sesion.diag;saldoInicial=sesion.saldoInicial||0;
    snapshot=sesion.snapshot||null;activeTab=["situacion","deudas","plan","progreso","informe"].includes(sesion.activeTab)?sesion.activeTab:"situacion";
    resetPlusEstado=sesion.resetPlusEstado||"sin_pago";
    iaResultado=sesion.iaResultado||null;
    if(sesion.herramientas)herramientas=sesion.herramientas;
  }
  render();
  track("mi_plan_started",{segmento:SEGMENTO});
}

// =============================================================================
// NAVIGATION
// =============================================================================
function next() {
  if(step===0&&SEGMENTO===1){step=1;track("diagnosis_continue_clicked");render();return;}
  if(step===0){
    const total=Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0);
    if(total===0){alert("Completa al menos un gasto para continuar.");return;}
    step=2;render();return;
  }
  if(step===1){
    const total=Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0);
    if(total===0){alert("Completa al menos un gasto para continuar.");return;}
    step=2;render();return;
  }
  if(step===2){
    if(deudas.length===0){alert("Agrega al menos una deuda para continuar.");return;}
    diag=calcularMotor();
    saldoInicial=deudas.reduce((s,d)=>s+(parseFloat(d.monto)||0),0);
    snapshot={fecha_inicio:new Date().toISOString(),score_reset:diag.scoreReset,nivel:diag.nivelR,plan_id:diag.planId,saldo_inicial:saldoInicial};
    guardarLocal();track("plan_generated",{score:diag.scoreReset,nivel:diag.nivelR,causa_principal:diag.causaPrincipal,plan_tipo:diag.plan.titulo,deuda_prioritaria_tipo:diag.prio?.tipo||null,deuda_prioritaria_acreedor:diag.prio?.acreedor||null,flujo_libre:diag.fin.flujoLibre,capacidad_segura_ataque:diag.capacidadSeguraAtaque});enviarCRM("plan_generated",diag);
    step=3;activeTab="situacion";render();return;
  }
}
function prev(){if(step>0&&step<3){step--;render();}}
function resetear(){
  try{localStorage.removeItem(STORAGE_KEY);}catch(e){}
  step=0;gastos={};deudas=[];diag=null;saldoInicial=0;snapshot=null;
  activeTab="situacion";resetPlusEstado="sin_pago";iaResultado=null;
  herramientas={ingresos:{formal:0,extras:[],total:0},gastos_clasificados:{},gestiones:{},compromisos:{},semaforo:{},habitos:{},atrasos:{},vencimientos:{}};
  cerrarModal("modal-nuevo");render();
}
function confirmarNuevo(){abrirModal("modal-nuevo");}
function abrirModal(id){document.getElementById(id).classList.remove("hidden");}
function cerrarModal(id){document.getElementById(id).classList.add("hidden");}

// =============================================================================
// RENDER
// =============================================================================
function render() {
  updateHeader();
  const main=document.getElementById("main-content");
  let html="";
  if(step===0&&SEGMENTO===1)html=renderDiagInicial();
  else if(step===0||step===1)html=renderGastos();
  else if(step===2)html=renderDeudas();
  else if(step===3)html=renderDashboard();
  main.innerHTML='<div class="fade">'+html+"</div>";
  if(step===3)bindDashboard();
  updateSticky();
  window.scrollTo({top:0,behavior:"smooth"});
}

function updateHeader() {
  const isDash=step===3;
  const day=document.getElementById("header-day");
  const btnN=document.getElementById("btn-nuevo");
  if(isDash){
    if(snapshot){const d=Math.floor((Date.now()-new Date(snapshot.fecha_inicio).getTime())/86400000);if(d>0){day.textContent="Dia "+d;day.classList.remove("hidden");}}
    btnN.classList.remove("hidden");
  }else{day.classList.add("hidden");btnN.classList.add("hidden");}
}

function updateSticky() {
  const lbl=document.getElementById("sticky-lbl");
  const st=document.getElementById("sticky-step");
  const cta=document.getElementById("sticky-cta");
  if(step===0&&SEGMENTO===1){lbl.textContent="Evaluacion inicial";st.textContent="Ver mi evaluacion y continuar";cta.textContent="Ver evaluacion";cta.className="sticky-btn";cta.onclick=next;}
  else if(step===0||step===1){lbl.textContent="Paso "+(SEGMENTO===1?2:1)+" de "+(SEGMENTO===1?3:2);st.textContent="Completa tus gastos mensuales";cta.textContent="Continuar";cta.className="sticky-btn";cta.onclick=next;}
  else if(step===2){lbl.textContent="Ultimo paso";st.textContent="Genera tu diagnostico completo";cta.textContent="Ver mi plan";cta.className="sticky-btn";cta.onclick=next;}
  else if(step===3){lbl.textContent=diag?.plan?.cta||"Tu plan";st.textContent="Profundizá con Informe Completo";cta.textContent="Informe Completo";cta.className="sticky-btn informe";cta.onclick=abrirModalPremium;}
}

// =============================================================================
// STEP 0 — DIAGNOSTICO INICIAL (Solo Segmento 1)
// =============================================================================
function renderDiagInicial() {
  const enc=calcularEncuesta(PRE.respuestas);
  const r=PRE.respuestas;
  const signals=[];
  const goodSignals=[];
  if(r.p1==="C"||r.p1==="D")signals.push({icon:"⚠️",title:"Sin claridad financiera",text:"No tenes claro cuanto entra y sale cada mes. Eso hace casi imposible priorizar correctamente."});
  if(r.p6==="D")signals.push({icon:"⚠️",title:"Prestamos informales detectados",text:"Los prestamos informales son los que mas rapido destruyen el flujo mensual."});
  if(r.p5==="D")signals.push({icon:"⚠️",title:"Estres financiero maximo",text:"Tu nivel de estres financiero es maximo. Eso afecta directamente las decisiones que tomas."});
  if(r.p7==="C"||r.p7==="D")signals.push({icon:"⚠️",title:"Deudas sin plan de salida",text:"No sabes cuanto tiempo te llevaria salir de tus deudas. Esa falta de claridad es una senal importante."});
  if(r.p8==="A")goodSignals.push({icon:"✅",title:"Ya tomaste acciones recientes",text:"Eso es una ventaja real. El sistema valora que ya estes haciendo algo al respecto."});
  if(r.p3==="A"||r.p3==="B")goodSignals.push({icon:"✅",title:"Responsabilidad financiera alta",text:"Tu nivel de responsabilidad es bueno. Con un plan claro, eso se traduce en resultados."});
  if(signals.length===0)signals.push({icon:"⚠️",title:"Posible carga mensual alta",text:"Puede haber demasiados pagos compitiendo con tus ingresos. Necesitamos tus datos para confirmarlo."});

  return '<div class="badge"><div class="dot"></div>Tu evaluacion inicial esta lista</div>'

    +'<h1>Ya analizamos tus respuestas.<br><span class="gradient">Ahora veamos el plan.</span></h1>'

    +'<div class="lead">Encontramos factores que podrian estar afectando hoy tu perfil financiero y tus posibilidades de aprobacion.</div>'

    +'<div class="sub">La idea no es pedirte otro formulario de cero. Primero te mostramos una lectura inicial. Despues, si queres mas precision, completas gastos y deudas.</div>'

    +'<div class="btn-wrap" style="margin-bottom:20px;">'
    +'<button class="btn btn-primary" onclick="mostrarEvaluacion()">Ver mi evaluacion inicial</button>'
    +'<button class="btn btn-secondary" onclick="step=1;render();">Completar analisis profundo</button>'
    +'</div>'
    +'<div class="disclaimer">No afecta futuras solicitudes. No es un score crediticio oficial.</div>'

    // Evaluacion card (oculta)
    +'<div id="eval-card" class="hidden" style="margin-top:26px;">'
    +'<div class="card">'
    +'<div class="card-top">'
    +'<div class="card-label">Evaluacion inicial</div>'
    +(signals.length>0?'<div class="alert-badge">ATENCION</div>':'<div class="alert-badge" style="border-color:rgba(52,255,175,.35);color:#34ffaf;">TODO BIEN</div>')
    +'</div>'

    +'<div class="card-title">Perfil con senales de presion financiera</div>'

    +signals.map(s=>'<div class="signal"><div class="signal-icon">'+s.icon+'</div><div><div class="signal-title">'+s.title+'</div><div class="signal-text">'+s.text+'</div></div></div>').join("")
    +goodSignals.map(s=>'<div class="signal" style="border-color:rgba(52,255,175,.2);background:rgba(52,255,175,.05);"><div class="signal-icon">'+s.icon+'</div><div><div class="signal-title">'+s.title+'</div><div class="signal-text">'+s.text+'</div></div></div>').join("")

    +'<div class="good-news"><strong>La buena noticia:</strong>con algunos ajustes podes mejorar progresivamente tu situacion y aumentar tus posibilidades futuras de aprobacion.</div>'

    +'<div style="margin-top:26px;">'
    +'<button class="btn btn-primary" onclick="step=1;render();">Ver mi plan personalizado</button>'
    +'</div>'
    +'</div>'

    // Como funciona
    +'<div class="card">'
    +'<div class="section-title">Para darte un diagnostico mas preciso necesitamos 2 minutos mas.</div>'
    +'<div class="section-text">No necesitas montos exactos. Una estimacion alcanza para detectar patrones y entender que deuda te esta danando mas.</div>'
    +'<div class="steps">'
    +[["1","Gastos","Vemos cuanto margen mensual queda."],["2","Deudas","Identificamos acreedores y montos."],["3","Prioridad","Calculamos que deuda dana mas."],["4","Plan","Te mostramos que hacer primero."]].map(([n,t,d])=>'<div class="step"><div class="step-num">'+n+'</div><div class="step-title">'+t+'</div><div class="step-text">'+d+'</div></div>').join("")
    +'</div>'
    +'</div>'
    +'</div>';
}

function mostrarEvaluacion() {
  const el=document.getElementById("eval-card");
  if(el){el.classList.remove("hidden");el.scrollIntoView({behavior:"smooth",block:"start"});}
  track("diagnosis_viewed",{segmento:SEGMENTO});
}

// =============================================================================
// STEP 1 — GASTOS
// =============================================================================
function renderGastos() {
  const total=Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const ingreso=PRE.ingreso;
  const pct=ingreso>0?total/ingreso:0;
  const pctColor=pct>.9?"#ff4e72":pct>.7?"#ffd36f":"#34ffaf";

  let html=renderStepPills(SEGMENTO===1?1:0,SEGMENTO===1?3:2);

  // Datos precargados
  if(SEGMENTO<=2){
    html+='<div class="card">'
    +'<div class="card-label" style="margin-bottom:18px;">Datos de tu solicitud</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">'
    +[["Nombre",PRE.nombre],["Email",PRE.email],["Ingreso mensual",fmt(PRE.ingreso)],["Situacion laboral",SITUACION_LABELS[PRE.laboral]||PRE.laboral]].filter(([,v])=>v).map(([l,v])=>'<div><label>'+l+'</label><div style="font-size:18px;font-weight:700;color:rgba(255,255,255,.9);">'+v+'</div></div>').join("")
    +'</div></div>';
  }

  html+='<div class="card">'
    +'<div class="section-title">Gastos mensuales</div>'
    +'<div class="section-text">No necesitas montos exactos. Una estimacion ya nos permite detectar patrones financieros importantes.</div>'

    // Accordion
    +EXPENSE_CATS.map((c,i)=>{
      const val=parseFloat(gastos[c.k])||0;
      const isOpen=val>0||i===0;
      return '<div class="accordion-item">'
        +'<button class="accordion-trigger'+(isOpen?" open":"")+'" onclick="toggleAccordion(this)">'
        +'<span>'+c.l+(val>0?' <span style="color:#40d7ff;font-size:17px;">'+fmt(val)+'</span>':"")+'</span>'
        +'<span class="chevron">▼</span>'
        +'</button>'
        +'<div class="accordion-body'+(isOpen?" open":"")+'">'
        +'<div style="position:relative;">'
        +'<span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
        +'<input type="number" style="padding-left:36px;" placeholder="0" value="'+(gastos[c.k]||"")+'" oninput="gastos[\''+c.k+'\']=this.value;actualizarTotalGastos()"/>'
        +'</div></div></div>';
    }).join("")

    // Total
    +(total>0?'<div style="margin-top:20px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.2);border-radius:18px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;">'
    +'<span style="font-size:19px;font-weight:700;color:rgba(255,255,255,.8);">Total gastos</span>'
    +'<span style="font-size:36px;font-weight:900;color:'+pctColor+';">'+fmt(total)+'</span>'
    +'</div>':"")
    +'</div>';

  if(SEGMENTO===1){
    html+='<button class="nav-back" onclick="step=0;render();">&#8592; Atras</button>';
  }

  return html;
}

function toggleAccordion(btn){
  btn.classList.toggle("open");
  btn.nextElementSibling.classList.toggle("open");
}

function actualizarTotalGastos(){
  const total=Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const ingreso=PRE.ingreso;
  const pct=ingreso>0?total/ingreso:0;
  const pctColor=pct>.9?"#ff4e72":pct>.7?"#ffd36f":"#34ffaf";
  // Update total display if visible
  const totalEls=document.querySelectorAll(".total-gastos-val");
  totalEls.forEach(el=>{el.textContent=fmt(total);el.style.color=pctColor;});
}

// =============================================================================
// STEP 2 — DEUDAS
// =============================================================================
function renderDeudas() {
  let html=renderStepPills(SEGMENTO===1?2:1,SEGMENTO===1?3:2);
  html+='<div class="card">'
    +'<div class="section-title">Tus deudas</div>'
    +'<div class="section-text">El acreedor y el tipo de deuda son fundamentales para detectar que deuda te esta danando mas y por donde empezar.</div>'
    +'<div id="deudas-container">'+deudas.map((d,i)=>renderDeudaCard(d,i)).join("")+'</div>'
    +'<button class="btn btn-secondary" style="height:68px;font-size:20px;margin-bottom:0;" onclick="agregarDeuda()">+ Agregar deuda</button>'

    // Metricas live
    +'<div class="metrics" id="metrics-live">'
    +renderMetricsLive()
    +'</div>'

    // Result live
    +'<div class="result" id="result-live">'
    +'<h3 id="result-title">Todavia no analizamos tus deudas</h3>'
    +'<p id="result-text">Completa tus deudas para detectar que acreedor esta generando mas presion financiera.</p>'
    +'</div>'
    +'</div>'

    +'<button class="nav-back" onclick="prev();">&#8592; Atras</button>';

  return html;
}

function renderMetricsLive(){
  const fin=calcularFinanciero();
  return '<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">'+fmt(fin.totalDeuda)+'</strong></div>'
    +'<div class="metric"><small>Pago mensual</small><strong style="color:#ffd36f;">'+fmt(fin.totalPago)+'</strong></div>'
    +'<div class="metric"><small>Interes promedio</small><strong style="color:'+(fin.interesProm>90?"#ff4e72":fin.interesProm>60?"#ffd36f":"#34ffaf")+';">'+fin.interesProm+'%</strong></div>'
    +'<div class="metric"><small>Nivel de riesgo</small><strong style="color:'+colorRiesgo(fin.nivelRiesgo)+';">'+fin.nivelRiesgo+'</strong></div>';
}

function renderDeudaCard(d,i){
  const insight=d.tipo?getMicroInsight(d.tipo):null;
  const tasa=d.tipo?TASAS[d.tipo]:null;
  const est=getEstado(d.estado);
  const borderColor=est?est.color:"rgba(61,220,255,.25)";
  return '<div class="debt-card" id="debt-card-'+i+'" style="border-left-color:'+borderColor+';">'
    +'<div class="debt-top"><div class="debt-name">Deuda #'+(i+1)+(d.acreedor?" — "+d.acreedor:"")+'</div>'
    +'<button class="remove-btn" onclick="eliminarDeuda('+i+')">×</button></div>'
    +'<div class="grid">'
    +'<div class="field"><label>Tipo de deuda</label>'
    +'<select onchange="updateDeuda('+i+',\'tipo\',this.value);rerenderDeuda('+i+')">'
    +'<option value="">Selecciona...</option>'
    +DEBT_TYPES.map(t=>'<option value="'+t.v+'"'+(d.tipo===t.v?" selected":"")+'>'+t.l+' (~'+t.tasa+'% TNA)</option>').join("")
    +'</select></div>'
    +'<div class="field"><label>Acreedor</label><input type="text" placeholder="Ej: BROU, OCA..." value="'+(d.acreedor||"")+'" oninput="updateDeuda('+i+',\'acreedor\',this.value)"/></div>'
    +'<div class="field"><label>Monto de la deuda</label>'
    +'<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    +'<input type="number" style="padding-left:36px;" placeholder="0" value="'+(d.monto||"")+'" oninput="updateDeuda('+i+',\'monto\',this.value);actualizarMetrics()"/></div></div>'
    +'<div class="field"><label>Pago mensual</label>'
    +'<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    +'<input type="number" style="padding-left:36px;" placeholder="0" value="'+(d.pago||"")+'" oninput="updateDeuda('+i+',\'pago\',this.value);actualizarMetrics()"/></div></div>'
    +'</div>'
    +'<div class="field" style="margin-top:12px;">'
    +'<label>Estado de la deuda</label>'
    +'<select onchange="updateDeuda('+i+',\'estado\',this.value);rerenderDeuda('+i+');actualizarMetrics()">'
    +'<option value="">Selecciona el estado...</option>'
    +ESTADOS_DEUDA.map(e=>'<option value="'+e.v+'"'+(d.estado===e.v?" selected":"")+'>'+e.l+'</option>').join("")
    +'</select></div>'
    +(est?'<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 14px;border-radius:10px;background:'+est.color+'15;border:1px solid '+est.color+'30;">'
    +'<div style="width:12px;height:12px;border-radius:50%;background:'+est.color+';flex-shrink:0;box-shadow:0 0 8px '+est.color+'80;"></div>'
    +'<span style="font-size:14px;font-weight:700;color:'+est.color+';">'+est.impact+'</span>'
    +'</div>':"")
    +(tasa?'<div style="font-size:14px;color:#8390b5;margin-top:8px;">Tasa estimada: ~'+tasa+'% TNA · intereses aprox. '+fmt(Math.round((parseFloat(d.monto)||0)*tasa/100/12))+'/mes</div>':"")
    +(insight?'<div class="micro-insight micro-'+insight.cls+'">'+insight.txt+'</div>':"")
    +'</div>';
}

function getMicroInsight(tipo){
  const m={tarjeta:{cls:"warn",txt:"⚠️ Las tarjetas de credito acumulan el interes mas rapido. Son prioridad."},informal:{cls:"danger",txt:"⚠️ Los prestamos informales destruyen el flujo financiero muy rapido."},mora:{cls:"danger",txt:"⚠️ Las deudas en mora tienen el impacto mas fuerte sobre tu perfil."},financiera:{cls:"warn",txt:"⚠️ Las financieras tienen tasas altas. Considera refinanciar si es posible."}};
  return m[tipo]||null;
}

function updateDeuda(i,k,v){if(deudas[i])deudas[i][k]=v;}
function rerenderDeuda(i){const c=document.getElementById("debt-card-"+i);if(c)c.outerHTML=renderDeudaCard(deudas[i],i);}
function agregarDeuda(){deudas.push({tipo:"",acreedor:"",monto:"",pago:""});const c=document.getElementById("deudas-container");if(c)c.innerHTML=deudas.map((d,i)=>renderDeudaCard(d,i)).join("");track("debt_added",{debt_count:deudas.length});}
function eliminarDeuda(i){if(deudas.length>0){deudas.splice(i,1);const c=document.getElementById("deudas-container");if(c)c.innerHTML=deudas.map((d,i)=>renderDeudaCard(d,i)).join("");actualizarMetrics();}}
function actualizarMetrics(){
  const m=document.getElementById("metrics-live");
  if(m)m.innerHTML=renderMetricsLive();
  actualizarResultLive();
}
function actualizarResultLive(){
  const fin=calcularFinanciero();
  const prio=deudaPrioritaria();
  const title=document.getElementById("result-title");
  const text=document.getElementById("result-text");
  if(!title||!text)return;
  if(!prio){title.textContent="Todavia no analizamos tus deudas";text.textContent="Completa tus deudas para detectar que acreedor esta generando mas presion financiera.";return;}
  title.textContent=(prio.acreedor||prio.tipo||"Esta deuda")+" parece ser tu deuda mas sensible";
  if(fin.nivelRiesgo==="Critico")text.textContent="Detectamos una combinacion de pagos altos y deuda cara. La prioridad es recuperar flujo y evitar seguir acumulando intereses.";
  else if(fin.nivelRiesgo==="Medio")text.textContent="Tu situacion parece ordenable, pero ya hay presion financiera. La prioridad deberia ser reorganizar y atacar primero la deuda de "+(prio.acreedor||prio.tipo)+".";
  else text.textContent="No parece una situacion critica, pero hay oportunidades claras para mejorar tu perfil y reducir presion financiera si priorizas correctamente.";
}

// =============================================================================
// STEP PILLS
// =============================================================================
function renderStepPills(cur,total){
  const labels=SEGMENTO===1?["Evaluacion","Gastos","Deudas"]:["Gastos","Deudas"];
  const t=total||labels.length;
  let html='<div class="step-pills">';
  labels.slice(0,t).forEach(function(l,i){
    const done=i<cur,active=i===cur;
    html+='<div class="pill"><div class="pill-num'+(done?" done":active?" active":"")+'">'+(done?"✓":(i+1))+'</div><span class="pill-label'+(active?" active":"")+'">'+l+'</span></div>';
    if(i<labels.slice(0,t).length-1)html+='<div class="pill-div"></div>';
  });
  html+='</div>';
  return html;
}

// =============================================================================
// DASHBOARD
// =============================================================================
function renderDashboard(){
  const isLocked=id=>(id==="informe")&&resetPlusEstado==="sin_pago";
  const TABS=[
    {id:"situacion",l:"Mi situación",icon:"📊"},
    {id:"deudas",l:"Mis deudas",icon:"✏️"},
    {id:"plan",l:"Mi Plan",icon:"🎯"},
    {id:"progreso",l:"Mi progreso",icon:"📈"},
    {id:"informe",l:"Informe completo",icon:"⭐",locked:isLocked("informe")},
  ];
  return '<div class="tabs">'
    +TABS.map(t=>'<button class="tab-btn'+(activeTab===t.id?" active":"")+(t.locked?" locked":"")+'" onclick="'+(t.locked?"abrirModalPremium()":"switchTab('"+t.id+"')")+'" data-tab="'+t.id+'">'
    +t.icon+" "+t.l+(t.locked?' 🔒':"")+'</button>').join("")
    +'</div>'
    +'<div id="tab-content"></div>';
}

function bindDashboard(){renderTab();}
function switchTab(id){
  activeTab=id;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
  renderTab();track("tab_viewed",{tab:id});guardarLocal();
}
function renderTab(){
  const el=document.getElementById("tab-content");
  if(!el)return;
  if(activeTab==="situacion")el.innerHTML=renderTabSituacion();
  if(activeTab==="plan")el.innerHTML=renderTabPlan();
  if(activeTab==="deudas")el.innerHTML=renderTabDeudas();
  if(activeTab==="progreso")el.innerHTML=renderTabProgreso();
  if(activeTab==="informe")el.innerHTML=renderTabInformeCompleto();
}


// =============================================================================
// RADIOGRAFIA FINANCIERA — 5 indicadores de valor real
// Tasas estimadas de mercado — disclaimer visible en cada calculo
// =============================================================================
function calcularRadiografia() {
  const fin = calcularFinanciero();
  const ing = PRE.ingreso;

  // 1. Cuanto pagas de interes puro por mes (no reduce capital)
  const interesMensualTotal = deudas.reduce((s,d) => {
    const monto = parseFloat(d.monto)||0;
    const tasa  = TASAS[d.tipo]||62;
    return s + monto * (tasa/100/12);
  }, 0);
  const capitalMensual = Math.max(0, fin.totalPago - interesMensualTotal);

  // 2. Meses para cancelar cada deuda al ritmo actual
  const mesesPorDeuda = deudas.map(d => {
    const monto = parseFloat(d.monto)||0;
    const pago  = parseFloat(d.pago)||0;
    const tasa  = (TASAS[d.tipo]||62)/100/12;
    if(pago<=0||monto<=0) return null;
    if(pago <= monto*tasa) return 999; // nunca cancela
    const meses = Math.ceil(-Math.log(1 - monto*tasa/pago) / Math.log(1+tasa));
    return isFinite(meses) ? meses : 999;
  });

  // 3. Ahorro si paga $X extra en la deuda prioritaria
  const prio = deudaPrioritaria();
  let ahorroPagandoExtra = null;
  if(prio) {
    const monto = parseFloat(prio.monto)||0;
    const pago  = parseFloat(prio.pago)||0;
    const extra = Math.round(ing * 0.05); // 5% del ingreso como extra
    const tasa  = (TASAS[prio.tipo]||62)/100/12;
    if(pago>monto*tasa && (pago+extra)>monto*tasa) {
      const mesesSin  = Math.ceil(-Math.log(1-monto*tasa/pago)/Math.log(1+tasa));
      const mesesCon  = Math.ceil(-Math.log(1-monto*tasa/(pago+extra))/Math.log(1+tasa));
      const interesTotal = (pago*mesesSin) - monto;
      const interesCon   = ((pago+extra)*mesesCon) - monto;
      ahorroPagandoExtra = {
        extra, mesesSin, mesesCon,
        ahorro: Math.max(0, interesTotal - interesCon),
        mesesMenos: Math.max(0, mesesSin - mesesCon),
      };
    }
  }

  // 4. % del sueldo comprometido antes de que llegue
  const comprometido = fin.totalGastos + fin.totalPago;
  const pctComprometido = ing>0 ? Math.min(Math.round(comprometido/ing*100),100) : 0;

  // 5. Estimacion de cuando podria calificar
  const ratioActual = fin.ratio;
  const metaRatio   = 0.30;
  let mesesParaCalificar = null;
  if(fin.cantMoras === 0 && ratioActual <= metaRatio && fin.flujoLibre > ing*.15) {
    mesesParaCalificar = 1;
  } else {
    let meses = 0;
    if(fin.cantMoras > 0)          meses += fin.cantMoras * 3;
    if(ratioActual > 0.5)          meses += 9;
    else if(ratioActual > 0.35)    meses += 4;
    if(fin.flujoLibre < 0)         meses += 6;
    else if(fin.flujoLibre < ing*.15) meses += 2;
    mesesParaCalificar = Math.max(1, meses);
  }
  const fechaCalificar = new Date();
  fechaCalificar.setMonth(fechaCalificar.getMonth() + mesesParaCalificar);
  const mesCalifica = fechaCalificar.toLocaleDateString("es-UY", {month:"long", year:"numeric"});

  return {interesMensualTotal, capitalMensual, mesesPorDeuda, ahorroPagandoExtra,
    pctComprometido, comprometido, mesesParaCalificar, mesCalifica, fin, prio};
}

function renderRadiografia() {
  if(!diag || deudas.length === 0) return "";
  const r = calcularRadiografia();
  const DISCLAIMER = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">* Basado en tasas estimadas de mercado. Tu tasa real puede variar.</div>';

  return '<div style="margin-bottom:20px;">'

    // Header
    +'<div style="font-size:11px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">Tu radiografia financiera</div>'

    // 1. Interes puro mensual
    +'<div style="background:rgba(255,78,114,.07);border:1px solid rgba(255,78,114,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
    +'<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">💸 Lo que pagas sin reducir deuda</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
    +'<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo intereses por mes</div>'
    +'<div style="font-family:Syne,sans-serif;font-size:34px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-1px;">'+fmt(Math.round(r.interesMensualTotal))+'</div>'
    +'<div style="font-size:12px;color:#8390b5;margin-top:4px;">plata que desaparece</div></div>'
    +'<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo en un ano</div>'
    +'<div style="font-family:Syne,sans-serif;font-size:34px;font-weight:900;color:#ffd447;line-height:1;letter-spacing:-1px;">'+fmt(Math.round(r.interesMensualTotal*12))+'</div>'
    +'<div style="font-size:12px;color:#8390b5;margin-top:4px;">si no cambia nada</div></div>'
    +'</div>'+DISCLAIMER+'</div>'

    // 2. Meses para cancelar cada deuda
    +(deudas.some((_,i)=>r.mesesPorDeuda[i]!==null)
    ?'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
    +'<div style="font-size:13px;font-weight:800;color:#ffd447;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📅 Cuando cancelarias cada deuda</div>'
    +deudas.map((d,i)=>{
      const meses = r.mesesPorDeuda[i];
      if(meses===null) return "";
      const nombre = d.acreedor||DEBT_TYPES.find(t=>t.v===d.tipo)?.l||"Deuda #"+(i+1);
      const color  = meses>=60?"#ff4e72":meses>=24?"#ffd447":"#34ffaf";
      const txt    = meses>=999?"Nunca con el pago actual":meses===1?"1 mes":meses+" meses";
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);">'
        +'<div style="font-size:15px;font-weight:700;">'+nombre+'</div>'
        +'<div style="font-family:Syne,sans-serif;font-size:20px;font-weight:900;color:'+color+';">'+txt+'</div>'
        +'</div>';
    }).join("")
    +DISCLAIMER+'</div>':"")

    // 3. Ahorro pagando extra
    +(r.ahorroPagandoExtra
    ?'<div style="background:rgba(52,255,175,.07);border:1px solid rgba(52,255,175,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
    +'<div style="font-size:13px;font-weight:800;color:#34ffaf;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">⚡ Si pagas '+fmt(r.ahorroPagandoExtra.extra)+' extra por mes</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
    +'<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Te ahorras en intereses</div>'
    +'<div style="font-family:Syne,sans-serif;font-size:34px;font-weight:900;color:#34ffaf;line-height:1;letter-spacing:-1px;">'+fmt(Math.round(r.ahorroPagandoExtra.ahorro))+'</div></div>'
    +'<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Cancelas '+r.ahorroPagandoExtra.mesesMenos+' meses antes</div>'
    +'<div style="font-family:Syne,sans-serif;font-size:34px;font-weight:900;color:#34ffaf;line-height:1;letter-spacing:-1px;">'+r.ahorroPagandoExtra.mesesCon+' meses</div>'
    +'<div style="font-size:12px;color:#8390b5;margin-top:4px;">vs '+r.ahorroPagandoExtra.mesesSin+' meses sin el extra</div></div>'
    +'</div>'
    +'<div style="margin-top:12px;font-size:14px;color:#8390b5;">Aplicado a tu deuda prioritaria: <strong style="color:rgba(255,255,255,.8);">'+(r.prio?.acreedor||DEBT_TYPES.find(t=>t.v===r.prio?.tipo)?.l||"deuda principal")+'</strong></div>'
    +DISCLAIMER+'</div>':"")

    // 4. % comprometido del sueldo
    +'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
    +'<div style="font-size:13px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📊 De tu sueldo, cuanto ya esta comprometido</div>'
    +'<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">'
    +'<div style="font-family:Syne,sans-serif;font-size:52px;font-weight:900;color:'+(r.pctComprometido>85?"#ff4e72":r.pctComprometido>70?"#ffd447":"#34ffaf")+';line-height:1;letter-spacing:-2px;">'+r.pctComprometido+'%</div>'
    +'<div style="font-size:15px;color:#8390b5;line-height:1.5;">'+(r.pctComprometido>85?"Casi todo tu sueldo ya esta gastado antes de que llegue.":r.pctComprometido>70?"La mayoria de tu sueldo ya tiene destino fijo.":"Tenes un margen razonable para maniobrar.")+'</div>'
    +'</div>'
    +'<div style="height:14px;background:rgba(255,255,255,.08);border-radius:7px;overflow:hidden;margin-bottom:8px;">'
    +'<div style="height:100%;border-radius:7px;width:'+r.pctComprometido+'%;background:'+(r.pctComprometido>85?"#ff4e72":r.pctComprometido>70?"#ffd447":"#34ffaf")+';transition:width .6s ease;"></div>'
    +'</div>'
    +'<div style="display:flex;justify-content:space-between;font-size:12px;color:#8390b5;"><span>Comprometido: '+fmt(Math.round(r.comprometido))+'</span><span>Libre: '+fmt(Math.max(0,PRE.ingreso-r.comprometido))+'</span></div>'
    +'</div>'

    // 5. Cuando podria calificar
    +'<div style="background:linear-gradient(135deg,rgba(91,124,255,.12),rgba(61,220,255,.08));border:1px solid rgba(91,124,255,.3);border-radius:18px;padding:20px;">'
    +'<div style="font-size:13px;font-weight:800;color:#5b7cff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">🎯 Cuando podrias volver a calificar</div>'
    +(r.mesesParaCalificar===1
    ?'<div style="font-family:Syne,sans-serif;font-size:28px;font-weight:900;color:#34ffaf;margin-bottom:8px;">Muy pronto — menos de 1 mes</div>'
    +'<div style="font-size:15px;color:#8390b5;line-height:1.6;">Tu perfil esta cerca del umbral de aprobacion. Con algunos ajustes menores podes intentarlo.</div>'
    :'<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;">'
    +'<div style="font-family:Syne,sans-serif;font-size:52px;font-weight:900;color:#40d7ff;line-height:1;letter-spacing:-2px;">'+r.mesesParaCalificar+'</div>'
    +'<div style="font-size:20px;font-weight:700;color:#8390b5;">meses</div>'
    +'</div>'
    +'<div style="font-size:16px;color:rgba(255,255,255,.8);font-weight:700;margin-bottom:8px;">Aproximadamente '+r.mesCalifica+'</div>'
    +'<div style="font-size:14px;color:#8390b5;line-height:1.6;">Siguiendo el plan asignado y sin tomar nuevas deudas. Esta es una proyeccion basada en los datos que declaraste.</div>')
    +'<div style="margin-top:14px;padding:12px 14px;background:rgba(61,220,255,.08);border:1px solid rgba(61,220,255,.15);border-radius:12px;font-size:13px;color:#8390b5;line-height:1.6;">'
    +'<strong style="color:#40d7ff;">Para confirmar esta proyeccion</strong> necesitas saber exactamente que ve el banco sobre vos. Eso es lo que incluye Informe Completo.'
    +'</div>'
    +'</div>'

    +'</div>';
}

// =============================================================================
// TAB: MI SITUACION
// =============================================================================
function renderTabSituacion(){
  const d=diag;
  const fin=d.fin;
  const prio=d.prio;
  return '<div class="fade">'
    +'<div class="plan-card" style="border-color:'+colorScore(d.scoreReset)+'33;">'
    +'<div class="plan-badge" style="background:'+colorScore(d.scoreReset)+'20;color:'+colorScore(d.scoreReset)+';">Diagnóstico resumido</div>'
    +'<div class="plan-title-big">'+d.causaLabel+'</div>'
    +'<div class="plan-desc">Tu situación no se define por un número. El punto central detectado es: <strong style="color:white;">'+d.causaLabel+'</strong>. Desde ahí armamos el plan.</div>'
    +'<div class="metrics">'
    +'<div class="metric"><small>Score Mi Plan</small><strong style="color:'+colorScore(d.scoreReset)+';">'+d.scoreReset+'</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">de 30</div></div>'
    +'<div class="metric"><small>Nivel</small><strong style="color:'+colorNivel(d.nivelR)+';font-size:30px;">'+nivelTexto(d.nivelR)+'</strong></div>'
    +'<div class="metric"><small>Flujo libre</small><strong style="color:'+(fin.flujoLibre<0?'#ff4e72':'#34ffaf')+';">'+fmt(fin.flujoLibre)+'</strong></div>'
    +'<div class="metric"><small>Capacidad segura</small><strong style="color:#40d7ff;">'+fmt(d.capacidadSeguraAtaque)+'</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">para atacar deuda sin ahogarte</div></div>'
    +'</div>'
    +'</div>'
    +(prio?'<div class="priority-card"><div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">Deuda más sensible</div><div style="font-size:28px;font-weight:900;margin-bottom:10px;">'+(prio.acreedor||DEBT_TYPES.find(t=>t.v===prio.tipo)?.l||'Deuda principal')+'</div><div style="font-size:18px;color:#b3bed8;line-height:1.6;">Por monto, pago mensual, tasa estimada y estado, esta es la deuda que más conviene mirar primero.</div></div>':'')
    +renderReportActions()
    +'</div>';
}

// =============================================================================
// TAB: MI PLAN
// =============================================================================
function renderTabPlan(){
  const d=diag;
  const fin=d.fin;
  const pc=d.plan.color;
  const prio=d.prio;
  const progreso=saldoInicial>0?Math.max(0,(saldoInicial-fin.totalDeuda)/saldoInicial*100):0;

  return '<div class="fade">'

    // Plan hero
    +'<div class="plan-card" style="border-color:'+pc+'33;">'
    +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;">'
    +'<div>'
    +'<div class="plan-badge" style="background:'+pc+'20;color:'+pc+';">Plan #'+d.planId+' · '+d.plan.titulo+'</div>'
    +'<div class="plan-title-big">'+d.plan.icon+' '+d.plan.titulo+'</div>'
    +'<div class="plan-desc">'+d.plan.problema+'</div>'
    +'</div>'
    +'<div style="text-align:right;flex-shrink:0;">'
    +'<div class="score-big" style="color:'+colorScore(d.scoreReset)+';">'+d.scoreReset+'</div>'
    +'<div style="font-size:14px;color:#8390b5;margin-top:4px;">de 30</div>'
    +'<div style="font-size:14px;font-weight:800;color:'+colorNivel(d.nivelR)+';margin-top:6px;">'+nivelTexto(d.nivelR)+'</div>'
    +'</div>'
    +'</div>'
    +'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:18px;">'
    +'<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Objetivo</div>'
    +'<div style="font-size:19px;color:rgba(255,255,255,.9);line-height:1.6;">'+d.plan.objetivo+'</div>'
    +'</div>'
    +'</div>'

    // Puntaje descompuesto
    +'<div class="plan-card">'
    +'<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Como se calcula tu puntaje</div>'
    +'<div class="grid">'
    +'<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    +'<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Situacion financiera</div>'
    +'<div style="font-size:52px;font-weight:900;color:'+colorScore(fin.scoreFinanciero)+';line-height:1;letter-spacing:-2px;">'+fin.scoreFinanciero+'</div>'
    +'<div style="font-size:14px;color:#8390b5;margin-top:6px;">gastos y deudas</div>'
    +'</div>'
    +'<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    +'<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Habitos financieros</div>'
    +'<div style="font-size:52px;font-weight:900;color:'+colorScore(d.enc.score)+';line-height:1;letter-spacing:-2px;">'+(TIENE_ENCUESTA?d.enc.score:"—")+'</div>'
    +'<div style="font-size:14px;color:#8390b5;margin-top:6px;">encuesta conductual</div>'
    +'</div>'
    +'</div>'
    +'<div style="margin-top:14px;font-size:15px;color:#8390b5;text-align:center;">Revision sugerida en <strong style="color:rgba(255,255,255,.8);">'+d.plan.reevaluacion+'</strong></div>'
    +'</div>'

    // Radiografia
    +renderRadiografia()

    // Metricas
    +'<div class="metrics">'
    +[
      {l:"Plata que te sobra/mes",v:fmt(fin.flujoLibre),c:fin.flujoLibre<0?"#ff4e72":"#34ffaf",s:fin.flujoLibre<0?"deficit":"disponible"},
      {l:"Total de deudas",v:fmt(fin.totalDeuda),c:"#ffd36f",s:deudas.length+" deuda"+(deudas.length!==1?"s":"")},
      {l:"De tu sueldo va a deudas",v:Math.round(fin.ratio*100)+"%",c:fin.ratio>0.5?"#ff4e72":fin.ratio>0.35?"#ffd36f":"#34ffaf",s:"meta: menos del 30%"},
      {l:"Pagas en cuotas por mes",v:fmt(fin.totalPago),c:"rgba(255,255,255,.7)",s:"suma de minimos"},
    ].map(m=>'<div class="metric"><small>'+m.l+'</small><strong style="color:'+m.c+';">'+m.v+'</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">'+m.s+'</div></div>').join("")
    +'</div>'

    // Progreso
    +(saldoInicial>0?'<div class="plan-card" style="margin-top:0;">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    +'<div><div style="font-size:20px;font-weight:800;">Tu progreso</div><div style="font-size:15px;color:#8390b5;margin-top:4px;">Dia '+d.diasRec+' de recuperacion</div></div>'
    +'<div style="text-align:right;"><div style="font-size:52px;font-weight:900;color:'+(progreso>0?"#34ffaf":"#8390b5")+';line-height:1;letter-spacing:-2px;">'+Math.round(progreso)+'%</div><div style="font-size:14px;color:#8390b5;">reducido</div></div>'
    +'</div>'
    +'<div class="progress-wrap"><div class="progress-bar" style="width:'+progreso+'%;background:'+(progreso>50?"#34ffaf":progreso>20?"#ffd36f":"#ff4e72")+';"></div></div>'
    +'<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:15px;color:#8390b5;"><span>Inicio: '+fmt(saldoInicial)+'</span><span>Hoy: '+fmt(fin.totalDeuda)+'</span></div>'
    +'</div>':"")

    // Prioridades
    +'<div class="plan-card" style="margin-top:0;">'
    +'<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Que hacer primero</div>'
    +d.plan.prioridades.map((p,i)=>'<div class="prioridad-item"><div class="prioridad-num" style="background:'+pc+'20;color:'+pc+';">'+(i+1)+'</div><div class="prioridad-text">'+p+'</div></div>').join("")
    +'</div>'

    // Deuda prioritaria
    +(prio?'<div class="priority-card">'
    +'<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">⚠ Deuda prioritaria</div>'
    +'<div style="font-size:28px;font-weight:900;margin-bottom:14px;">'+(prio.acreedor||prio.tipo||"Sin nombre")+(prio.acreedor&&prio.tipo?" ("+DEBT_TYPES.find(t=>t.v===prio.tipo)?.l+")" :"")+'</div>'
    +'<div class="grid">'
    +'<div><small style="color:#8390b5;display:block;margin-bottom:6px;">Monto</small><strong style="font-size:32px;color:#ff4e72;">'+fmt(parseFloat(prio.monto)||0)+'</strong></div>'
    +'<div><small style="color:#8390b5;display:block;margin-bottom:6px;">Pago mensual</small><strong style="font-size:32px;color:#ffd36f;">'+fmt(parseFloat(prio.pago)||0)+'</strong></div>'
    +'<div><small style="color:#8390b5;display:block;margin-bottom:6px;">Tasa estimada</small><strong style="font-size:32px;color:#ff4e72;">~'+(TASAS[prio.tipo]||62)+'% TNA</strong></div>'
    +'<div><small style="color:#8390b5;display:block;margin-bottom:6px;">Interes/mes aprox.</small><strong style="font-size:32px;color:#ffd36f;">'+fmt(Math.round((parseFloat(prio.monto)||0)*(TASAS[prio.tipo]||62)/100/12))+'</strong></div>'
    +'</div></div>':"")

    // Herramientas del plan
    +renderHerramientas()

    // Acciones de informe
    +renderReportActions()

    // CTA Informe Completo
    +'<div class="premium-card">'
    +'<div class="premium-badge">Opcional · Informe Completo</div>'
    +'<div class="premium-title">Informe Completo</div>'
    +'<div class="premium-text">Si queres profundizar el analisis, accede a Clearing, Central de Riesgos BCU y un informe IA cruzando todos tus datos reales.</div>'
    +'<button class="btn btn-secondary" style="height:68px;font-size:20px;" onclick="abrirModalPremium()">Ver Informe Completo</button>'
    +'</div>'

    +'</div>';
}

// =============================================================================
// TAB: MIS DEUDAS
// =============================================================================
function renderTabDeudas(){
  const total=deudas.reduce((s,d)=>s+(parseFloat(d.monto)||0),0);
  const canceladas=deudas.filter(d=>parseFloat(d.monto)===0||d.cancelada).length;
  return '<div class="fade">'
    +'<div class="section-text">Actualiza tus saldos a medida que vas pagando. El plan y el puntaje se recalculan solos.</div>'
    +'<div class="metrics" style="margin-bottom:22px;">'
    +'<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">'+fmt(total)+'</strong></div>'
    +'<div class="metric"><small>Canceladas</small><strong style="color:#34ffaf;">'+canceladas+'/'+deudas.length+'</strong></div>'
    +'<div class="metric"><small>Puntaje actual</small><strong style="color:'+colorScore(diag.scoreReset)+';">'+diag.scoreReset+'</strong></div>'
    +'<div class="metric"><small>Nivel</small><strong style="color:'+colorNivel(diag.nivelR)+';font-size:24px;">'+nivelTexto(diag.nivelR)+'</strong></div>'
    +'</div>'
    +deudas.map((d,i)=>renderDeudaLive(d,i)).join("")
    +'<div style="text-align:center;margin-top:14px;font-size:16px;color:#8390b5;">Los cambios se guardan automaticamente.</div>'
    +'</div>';
}
function renderDeudaLive(d,i){
  const cancelada=parseFloat(d.monto)===0||d.cancelada;
  return '<div class="debt-card" id="dlive-'+i+'" style="border-color:'+(cancelada?"rgba(52,255,175,.3)":"rgba(255,255,255,.1)")+';opacity:'+(cancelada?.65:1)+';">'
    +'<div class="debt-top">'
    +'<div class="debt-name">'+(cancelada?"✅ ":"")+(d.acreedor||DEBT_TYPES.find(t=>t.v===d.tipo)?.l||"Deuda #"+(i+1))+(cancelada?" — Cancelada!":"")+'</div>'
    +(!cancelada?'<button class="btn btn-secondary" style="height:44px;font-size:14px;padding:0 16px;color:#34ffaf;border-color:rgba(52,255,175,.3);" onclick="cancelarDeuda('+i+')">✓ Cancelar</button>':"")
    +'</div>'
    +(!cancelada?'<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span><input type="number" style="padding-left:36px;" value="'+(d.monto||"")+'" placeholder="0" oninput="editarDeuda('+i+',this.value)"/></div>':"")
    +'</div>';
}
function cancelarDeuda(i){deudas[i].monto="0";deudas[i].cancelada=true;recalcular();renderTab();}
function editarDeuda(i,v){deudas[i].monto=v;deudas[i].cancelada=false;recalcular();renderTab();}
function recalcular(){diag=calcularMotor();guardarLocal();enviarCRM("reset_profile_updated",diag);}

// =============================================================================
// TAB: MI PROGRESO
// =============================================================================
function renderTabProgreso(){
  const d=diag;
  const fin=d.fin;
  const progreso=saldoInicial>0?Math.max(0,(saldoInicial-fin.totalDeuda)/saldoInicial*100):0;
  track("progress_viewed",{score:d.scoreReset,nivel:d.nivelR});
  return '<div class="fade">'
    +'<div class="plan-card">'
    +'<div class="plan-badge" style="background:rgba(64,215,255,.15);color:#40d7ff;">Seguimiento</div>'
    +'<div class="plan-title-big">Tu avance</div>'
    +'<div class="plan-desc">La mejora real no pasa por mirar el score todos los días. Pasa por sostener acciones durante 30, 90 y 180 días.</div>'
    +'<div class="metrics">'
    +'<div class="metric"><small>Día actual</small><strong style="color:#40d7ff;">'+d.diasRec+'</strong></div>'
    +'<div class="metric"><small>Deuda reducida</small><strong style="color:'+(progreso>0?'#34ffaf':'#8390b5')+';">'+Math.round(progreso)+'%</strong></div>'
    +'<div class="metric"><small>Inicio</small><strong>'+fmt(saldoInicial)+'</strong></div>'
    +'<div class="metric"><small>Hoy</small><strong>'+fmt(fin.totalDeuda)+'</strong></div>'
    +'</div>'
    +'<div class="progress-wrap" style="margin-top:18px;"><div class="progress-bar" style="width:'+progreso+'%;background:'+(progreso>50?'#34ffaf':progreso>20?'#ffd36f':'#ff4e72')+';"></div></div>'
    +'</div>'
    +renderHorizontes()
    +'</div>';
}

function renderHorizontes(){
  if(!diag||!diag.horizontes)return '';
  const h=diag.horizontes;
  return '<div class="plan-card">'
    +'<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Horizontes de recuperación</div>'
    +[['30 días',h.d30],['90 días',h.d90],['180 días',h.d180]].map(([t,txt],i)=>'<div class="prioridad-item"><div class="prioridad-num" style="background:rgba(64,215,255,.15);color:#40d7ff;">'+(i+1)+'</div><div><div style="font-size:19px;font-weight:900;margin-bottom:4px;">'+t+'</div><div class="prioridad-text">'+txt+'</div></div></div>').join('')
    +'</div>';
}

// =============================================================================
// TAB: INFORME COMPLETO
// =============================================================================
function renderTabInformeCompleto(){
  return '<div class="fade">'
    +'<div class="locked-overlay">'
    +'<div class="locked-blur" style="height:320px;background:rgba(255,255,255,.03);border-radius:22px;"></div>'
    +'<div class="locked-gate">'
    +'<div class="locked-icon">📊</div>'
    +'<div class="locked-title">Informe Completo</div>'
    +'<div class="locked-text">Incluye Clearing, Central de Riesgos BCU y un informe IA cruzando encuesta, deudas, gastos e historial real.</div>'
    +'<button class="btn btn-primary" style="height:68px;font-size:20px;" onclick="abrirModalPremium()">Ver opciones</button>'
    +'<div style="margin-top:12px;font-size:16px;color:#8390b5;">No promete aprobación. Te muestra qué ve el sistema financiero.</div>'
    +'</div></div>'
    +renderReportActions()
    +'</div>';
}

// =============================================================================
// TAB: ASISTENTE IA
// =============================================================================
function renderTabIA(){
  if(resetPlusEstado==="sin_pago"){
    return '<div class="fade"><div class="locked-overlay">'
      +'<div class="locked-blur">'+renderTabIAContent()+'</div>'
      +'<div class="locked-gate">'
      +'<div class="locked-icon">🤖</div>'
      +'<div class="locked-title">Asistente IA</div>'
      +'<div class="locked-text">El asistente analiza tu informe Clearing con inteligencia artificial y te da recomendaciones especificas para tu caso.</div>'
      +'<button class="btn btn-primary" style="height:68px;font-size:20px;" onclick="abrirModalPremium()">Ver Informe Completo</button>'
      +'</div></div></div>';
  }
  return '<div class="fade">'+renderTabIAContent()+'</div>';
}
function renderTabIAContent(){
  if(!iaResultado)return '<div class="result"><h3>Generando tu analisis...</h3><p>El asistente esta procesando tu informe Clearing.</p></div>';
  return '<div class="result"><h3 style="color:#40d7ff;">"'+iaResultado.mensaje+'"</h3></div>'
    +'<div class="plan-card"><div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">🔍 Diagnostico</div><div style="font-size:19px;color:rgba(255,255,255,.8);line-height:1.65;">'+iaResultado.diagnostico+'</div></div>'
    +'<div class="plan-card"><div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">🎯 Por que este plan</div><div style="font-size:19px;color:rgba(255,255,255,.8);line-height:1.65;">'+iaResultado.plan+'</div></div>'
    +(iaResultado.primerPaso?'<div class="plan-card" style="background:rgba(52,255,175,.07);border-color:rgba(52,255,175,.2);"><div style="font-size:13px;color:#34ffaf;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">Hace esto esta semana</div><div style="font-size:22px;font-weight:800;line-height:1.5;">'+iaResultado.primerPaso+'</div></div>':"");
}

// =============================================================================
// TAB: RESET PLUS
// =============================================================================
function renderTabPlus(){
  if(resetPlusEstado==="sin_pago"){
    return '<div class="fade"><div class="locked-overlay">'
      +'<div class="locked-blur" style="height:300px;background:rgba(255,255,255,.03);border-radius:22px;"></div>'
      +'<div class="locked-gate">'
      +'<div class="locked-icon">📊</div>'
      +'<div class="locked-title">Informe Clearing</div>'
      +'<div class="locked-text">Mira exactamente que informacion tiene registrada el sistema financiero sobre vos — deudas, atrasos, consultas y mas.</div>'
      +'<button class="btn btn-primary" style="height:68px;font-size:20px;" onclick="abrirModalPremium()">Ver Informe Completo</button>'
      +'<div style="margin-top:12px;font-size:16px;color:#8390b5;">Desde UYU 990 · Garantia 7 dias</div>'
      +'</div></div></div>';
  }
  return '<div class="fade"><div class="result"><h3>Informe disponible</h3><p>Tu informe Clearing esta listo.</p></div></div>';
}

// =============================================================================
// HERRAMIENTAS POR PLAN
// =============================================================================
function trackHerramienta(evento,datos={}){
  track(evento,{...datos,plan_id:diag?.planId,score:diag?.scoreReset});
  guardarLocal();
  enviarCRM(evento,diag);
}
function contarCompletadas(){
  const pid=diag?.planId;
  if(pid===1)return [herramientas.ingresos.total>0,Object.keys(herramientas.gastos_clasificados).length>0,herramientas.ingresos.total>0&&Object.keys(herramientas.gastos_clasificados).length>0].filter(Boolean).length;
  if(pid===2)return [Object.keys(herramientas.gestiones||{}).length>0,Object.values(herramientas.compromisos||{}).some(Boolean),true].filter(Boolean).length;
  if(pid===3)return [Object.keys(herramientas.vencimientos||{}).length>0,Object.values(herramientas.compromisos||{}).some(Boolean),true].filter(Boolean).length;
  if(pid===4)return [Object.keys(herramientas.semaforo||{}).length===3,Object.values(herramientas.compromisos||{}).some(Boolean),true].filter(Boolean).length;
  if(pid===5)return [Object.keys(herramientas.habitos||{}).length>0,Object.keys(herramientas.atrasos||{}).length>0,true].filter(Boolean).length;
  return 0;
}
function renderHerramientas(){
  if(!diag)return "";
  const completadas=contarCompletadas();
  const pid=diag.planId;
  const pc=diag.plan.color;
  let html='<div style="margin-top:4px;">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
    +'<div><div style="font-size:20px;font-weight:900;">Herramientas del plan</div><div style="font-size:15px;color:#8390b5;margin-top:2px;">Cada paso que completas nos ayuda a ayudarte mejor</div></div>'
    +'<div style="text-align:right;"><div style="font-size:44px;font-weight:900;color:'+(completadas===3?pc:"#8390b5")+';line-height:1;letter-spacing:-2px;">'+completadas+'/3</div><div style="font-size:14px;color:#8390b5;">completadas</div></div>'
    +'</div>'
    +'<div class="progress-wrap" style="margin-bottom:18px;"><div class="progress-bar" style="width:'+Math.round(completadas/3*100)+'%;background:'+pc+';"></div></div>';
  if(pid===1)html+=renderHerramientasPlan1();
  else if(pid===2)html+=renderHerramientasPlan2();
  else if(pid===3)html+=renderHerramientasPlan3();
  else if(pid===4)html+=renderHerramientasPlan4();
  else if(pid===5)html+=renderHerramientasPlan5();
  html+='</div>';
  return html;
}
function renderToolCard(num,titulo,desc,contenido,done){
  const pc=diag?.plan?.color||"#40d7ff";
  return '<div class="tool-card">'
    +'<div class="tool-header"><div class="tool-num'+(done?" done":"")+'"><span>'+(done?"✓":num)+'</span></div>'
    +'<div><div class="tool-title">'+titulo+'</div><div class="tool-desc">'+desc+'</div></div>'
    +'</div>'
    +(contenido||"")
    +'</div>';
}

// PLAN 1
function renderHerramientasPlan1(){
  const ing=herramientas.ingresos;
  const gc=herramientas.gastos_clasificados;
  const totalAjustable=EXPENSE_CATS.filter(c=>gc[c.k]==="ajustable").reduce((s,c)=>s+(parseFloat(gastos[c.k])||0),0);
  const flujoReal=(ing.total||PRE.ingreso)-Object.values(gastos).reduce((s,v)=>s+(parseFloat(v)||0),0)-diag.fin.totalPago;
  const comp1=ing.total>0;
  const comp2=Object.keys(gc).length>0;
  const gastosConValor=EXPENSE_CATS.filter(c=>parseFloat(gastos[c.k])>0);

  const h1=renderToolCard(1,"Cuanto te entra realmente por mes?","Tu sueldo declarado es "+fmt(PRE.ingreso)+". Suma cualquier otro ingreso que no figure en la solicitud.",
    '<div style="margin-top:4px;">'
    +'<div style="position:relative;margin-bottom:12px;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    +'<input type="number" style="padding-left:36px;" value="'+(ing.formal||PRE.ingreso)+'" oninput="updateIngresoFormal(this.value)"/></div>'
    +'<div id="ingresos-extras">'
    +(ing.extras||[]).map((e,i)=>'<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:flex-end;margin-bottom:12px;">'
      +'<div><label>Tipo</label><select onchange="updateIngresoExtra('+i+',\'tipo\',this.value)"><option value="">Selecciona...</option>'
      +["Changa","Alquiler que cobro","Ayuda familiar","Comision","Horas extra","Otro"].map(t=>'<option value="'+t+'"'+(e.tipo===t?" selected":"")+'>'+t+'</option>').join("")
      +'</select></div>'
      +'<div><label>Monto mensual</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
      +'<input type="number" style="padding-left:36px;" value="'+(e.monto||"")+'" oninput="updateIngresoExtra('+i+',\'monto\',this.value)"/></div></div>'
      +'<button class="remove-btn" onclick="quitarIngresoExtra('+i+')" style="margin-bottom:0;">×</button>'
      +'</div>').join("")
    +'</div>'
    +'<button class="btn btn-secondary" style="height:56px;font-size:17px;margin-bottom:14px;" onclick="agregarIngresoExtra()">+ Agregar otro ingreso</button>'
    +(ing.total>0?'<div style="background:rgba(64,215,255,.1);border:1px solid rgba(64,215,255,.3);border-radius:16px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;">'
    +'<span style="font-size:18px;font-weight:700;color:rgba(255,255,255,.8);">Total real que te entra</span>'
    +'<span style="font-size:40px;font-weight:900;color:#40d7ff;letter-spacing:-2px;">'+fmt(ing.total)+'</span>'
    +'</div>':"")
    +'</div>',comp1);

  const h2=renderToolCard(2,"Separa lo que no podes reducir de lo que si podes","Para cada gasto marca si es fijo o si podes reducirlo.",
    gastosConValor.length===0
    ?'<div style="font-size:17px;color:#8390b5;margin-top:8px;">No cargaste gastos aun.</div>'
    :'<div style="margin-top:8px;">'
    +gastosConValor.map(c=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
      +'<div><div style="font-size:18px;font-weight:700;">'+c.l+'</div><div style="font-size:15px;color:#8390b5;">'+fmt(parseFloat(gastos[c.k])||0)+'/mes</div></div>'
      +'<div style="display:flex;gap:8px;">'
      +'<button onclick="clasificarGasto(&quot;'+c.k+'&quot;,&quot;fijo&quot;)" style="padding:8px 16px;border-radius:12px;border:1.5px solid '+(gc[c.k]==="fijo"?"#ff4e72":"rgba(255,255,255,.15)")+';background:'+(gc[c.k]==="fijo"?"rgba(255,78,114,.15)":"transparent")+';color:'+(gc[c.k]==="fijo"?"#ff4e72":"rgba(255,255,255,.6)")+';font-size:15px;font-weight:800;cursor:pointer;">Fijo</button>'
      +'<button onclick="clasificarGasto(&quot;'+c.k+'&quot;,&quot;ajustable&quot;)" style="padding:8px 16px;border-radius:12px;border:1.5px solid '+(gc[c.k]==="ajustable"?"#34ffaf":"rgba(255,255,255,.15)")+';background:'+(gc[c.k]==="ajustable"?"rgba(52,255,175,.1)":"transparent")+';color:'+(gc[c.k]==="ajustable"?"#34ffaf":"rgba(255,255,255,.6)")+';font-size:15px;font-weight:800;cursor:pointer;">Puedo reducirlo</button>'
      +'</div></div>').join("")
    +(totalAjustable>0?'<div style="margin-top:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">'
    +'<div style="font-size:17px;color:rgba(255,255,255,.8);">Potencial de ahorro mensual</div>'
    +'<div style="font-size:36px;font-weight:900;color:#34ffaf;letter-spacing:-1px;">'+fmt(totalAjustable)+'</div>'
    +'</div>':"")
    +'</div>',comp2);

  const h3=renderToolCard(3,"Tu plata libre real cada mes","Con todo lo que entra y todo lo que sale, esto es lo que te queda.",
    (comp1&&comp2)?'<div style="text-align:center;padding:24px;background:'+(flujoReal>=0?"rgba(52,255,175,.08)":"rgba(255,78,114,.08)")+';border:1px solid '+(flujoReal>=0?"rgba(52,255,175,.25)":"rgba(255,78,114,.25)")+';border-radius:16px;margin-top:8px;">'
    +'<div style="font-size:16px;color:#8390b5;margin-bottom:8px;">Te queda libre cada mes</div>'
    +'<div style="font-size:64px;font-weight:900;color:'+(flujoReal>=0?"#34ffaf":"#ff4e72")+';line-height:1;letter-spacing:-3px;">'+fmt(Math.abs(flujoReal))+'</div>'
    +'<div style="font-size:18px;color:'+(flujoReal>=0?"#34ffaf":"#ff4e72")+';font-weight:700;margin-top:8px;">'+(flujoReal>=0?"despues de pagar todo":"EN DEFICIT")+'</div>'
    +'</div>'
    +(flujoReal<0?'<div class="micro-insight micro-danger" style="margin-top:12px;">Cada mes gastar mas de lo que entra acelera el deterioro del perfil. Reducir los gastos ajustables ('+fmt(totalAjustable)+' de potencial) es el primer paso.</div>':"")
    :'<div style="font-size:17px;color:#8390b5;margin-top:8px;">Completa las herramientas 1 y 2 primero para ver este resultado.</div>',
    comp1&&comp2);
  return h1+h2+h3;
}

// PLAN 2
function renderHerramientasPlan2(){
  const gest=herramientas.gestiones||{};
  const comp_=herramientas.compromisos||{};
  const comp1=Object.keys(gest).length>0;
  const comp2=Object.values(comp_).some(Boolean);
  const interesMensual=diag.fin.totalDeuda*(diag.fin.interesProm/100/12);
  const RESULTADOS=[{v:"no_intentado",l:"Todavia no lo intente"},{v:"sin_respuesta",l:"Llame pero no pude hablar"},{v:"ofrecieron_plan",l:"Me ofrecieron un plan de pagos"},{v:"sin_acuerdo",l:"Hable pero no llegamos a un acuerdo"},{v:"negociado",l:"Ya negocie algo"}];
  const COMPROMISOS_P2=[{id:"no_deuda_nueva",l:"No voy a sacar ninguna deuda nueva este mes"},{id:"pagar_minimos",l:"Voy a pagar los minimos en fecha"},{id:"contactar",l:"Voy a intentar contactar a mi acreedor principal esta semana"}];

  const h1=renderToolCard(1,"Pudiste contactar a tus acreedores?","Para cada deuda contanos como esta la gestion. Eso nos permite ayudarte mejor.",
    '<div style="margin-top:8px;">'
    +deudas.map((d,i)=>{
      const key=d.acreedor||d.tipo||"deuda_"+(i+1);
      const g=gest[key]||{};
      return '<div style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
        +'<div style="font-size:18px;font-weight:800;margin-bottom:10px;">'+(d.acreedor||DEBT_TYPES.find(t=>t.v===d.tipo)?.l||"Deuda #"+(i+1))+'<span style="font-size:15px;font-weight:400;color:#8390b5;"> · '+fmt(parseFloat(d.monto)||0)+'</span></div>'
        +'<select onchange="updateGestion(&quot;'+key+'&quot;,this.value)">'
        +RESULTADOS.map(r=>'<option value="'+r.v+'"'+(g.resultado===r.v?" selected":"")+'>'+r.l+'</option>').join("")
        +'</select>'
        +(g.resultado==="sin_respuesta"?'<div class="micro-insight micro-warn" style="margin-top:8px;">Vamos a ayudarte a intentarlo de nuevo. Anotamos que no pudiste contactarlos.</div>':"")
        +(g.resultado==="ofrecieron_plan"?'<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Excelente! Queres que te ayudemos a evaluar si el plan conviene? Eso lo podes hacer con Reset Plus.</div>':"")
        +(g.resultado==="negociado"?'<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Muy bien! Eso mejora tu perfil directamente.</div>':"")
        +'</div>';
    }).join("")
    +(deudas.length===0?'<div style="font-size:17px;color:#8390b5;">No tenes deudas cargadas.</div>':"")
    +'</div>',comp1);

  const h2=renderToolCard(2,"Tus compromisos de este mes","Tres cosas concretas. Sin estas, cualquier plan es solo papel.",
    '<div style="margin-top:8px;">'
    +COMPROMISOS_P2.map(c=>'<div class="compromiso-item" onclick="toggleCompromiso(&quot;'+c.id+'&quot;)">'
    +'<div class="compromiso-check'+(comp_[c.id]?" checked":"")+'">'+( comp_[c.id]?"✓":"")+'</div>'
    +'<div class="compromiso-text">'+c.l+'</div></div>').join("")
    +(Object.values(comp_).filter(Boolean).length===3?'<div style="margin-top:14px;padding:14px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);border-radius:14px;text-align:center;font-size:18px;font-weight:800;color:#34ffaf;">Comprometiste los 3 puntos. Eso marca la diferencia.</div>':"")
    +'</div>',comp2);

  const h3=renderToolCard(3,"Cuanto te cuesta no hacer nada","Cada mes que pasa sin atacar la deuda, los intereses siguen corriendo.",
    '<div style="margin-top:8px;"><div class="grid">'
    +'<div style="text-align:center;padding:18px;background:rgba(255,78,114,.08);border:1px solid rgba(255,78,114,.2);border-radius:16px;">'
    +'<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Pagas de interes POR MES</div>'
    +'<div style="font-size:44px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-2px;">'+fmt(Math.round(interesMensual))+'</div>'
    +'</div>'
    +'<div style="text-align:center;padding:18px;background:rgba(255,211,111,.08);border:1px solid rgba(255,211,111,.2);border-radius:16px;">'
    +'<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">En UN ANO si no actuas</div>'
    +'<div style="font-size:44px;font-weight:900;color:#ffd36f;line-height:1;letter-spacing:-2px;">'+fmt(Math.round(interesMensual*12))+'</div>'
    +'</div></div>'
    +'<div style="margin-top:12px;font-size:16px;color:#8390b5;line-height:1.5;">Solo en intereses, sin contar el capital. Atacar primero reduce este numero rapidamente.</div>'
    +'</div>',true);
  return h1+h2+h3;
}

// PLAN 3
function renderHerramientasPlan3(){
  const venc=herramientas.vencimientos||{};
  const comp_=herramientas.compromisos||{};
  const comp1=Object.keys(venc).length>0;
  const comp2=Object.values(comp_).some(Boolean);
  const ratioActual=diag.fin.ratio;
  const diferencia=Math.max(0,(ratioActual-.30)*PRE.ingreso);
  const COMPROMISOS_P3=[{id:"pagar_fecha",l:"Voy a pagar todo en fecha este mes"},{id:"no_gasto_extra",l:"No voy a hacer gastos que no tenia planeados"},{id:"revisar_ratio",l:"En 30 dias voy a revisar mi ratio de deuda"}];

  const h1=renderToolCard(1,"Tus vencimientos este mes","Anota cuando vence cada pago. Un solo atraso puede echarte atras meses.",
    '<div style="margin-top:8px;">'
    +deudas.map((d,i)=>{
      const key=d.acreedor||d.tipo||"deuda_"+(i+1);
      return '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
        +'<div style="flex:1;font-size:17px;font-weight:700;">'+(d.acreedor||DEBT_TYPES.find(t=>t.v===d.tipo)?.l||"Deuda #"+(i+1))+'</div>'
        +'<input type="date" style="width:180px;" value="'+(venc[key]||"")+'" onchange="updateVencimiento(&quot;'+key+'&quot;,this.value)"/>'
        +'</div>';
    }).join("")
    +(deudas.length===0?'<div style="font-size:17px;color:#8390b5;">No tenes deudas cargadas.</div>':"")
    +'</div>',comp1);

  const h2=renderToolCard(2,"Tus compromisos de recuperacion","Estos tres habitos son los que marcan la diferencia en tu caso.",
    '<div style="margin-top:8px;">'
    +COMPROMISOS_P3.map(c=>'<div class="compromiso-item" onclick="toggleCompromiso(&quot;'+c.id+'&quot;)">'
    +'<div class="compromiso-check'+(comp_[c.id]?" checked":"")+'">'+( comp_[c.id]?"✓":"")+'</div>'
    +'<div class="compromiso-text">'+c.l+'</div></div>').join("")
    +'</div>',comp2);

  const h3=renderToolCard(3,"Tu progreso hacia el objetivo","Tu meta es bajar el ratio de deuda por debajo del 30% de tu ingreso.",
    '<div style="margin-top:8px;">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:17px;font-weight:700;">'
    +'<span>Ratio actual: <span style="color:'+(ratioActual>.35?"#ff4e72":"#ffd36f")+';">'+Math.round(ratioActual*100)+'%</span></span>'
    +'<span>Meta: <span style="color:#34ffaf;">30%</span></span>'
    +'</div>'
    +'<div class="progress-wrap" style="height:14px;margin-bottom:10px;"><div class="progress-bar" style="width:'+Math.min(ratioActual/.30*100,100)+'%;background:'+(ratioActual<=.30?"#34ffaf":"#ff4e72")+';height:14px;"></div></div>'
    +(diferencia>0?'<div style="font-size:17px;color:#8390b5;">Para llegar al 30% necesitas reducir tus pagos mensuales en <strong style="color:#40d7ff;">'+fmt(Math.round(diferencia))+'</strong> por mes.</div>':'<div style="font-size:17px;color:#34ffaf;font-weight:800;">Ya estas dentro del objetivo! Mantenerlo es la clave.</div>')
    +'</div>',true);
  return h1+h2+h3;
}

// PLAN 4
function renderHerramientasPlan4(){
  const sem=herramientas.semaforo||{};
  const comp_=herramientas.compromisos||{};
  const comp1=Object.keys(sem).length===3;
  const comp2=Object.values(comp_).some(Boolean);
  const PREGUNTAS=[{id:"nueva_deuda",l:"Tomaste alguna deuda nueva este mes?"},{id:"pago_minimos",l:"Pudiste pagar todos los minimos?"},{id:"flujo_positivo",l:"Tu flujo este mes fue positivo (te sobro algo)?"}];
  const COMPROMISOS_P4=[{id:"no_deuda",l:"No voy a tomar ninguna deuda nueva"},{id:"ord_informal",l:"Voy a ordenar mis deudas informales primero"},{id:"ingreso_extra",l:"Voy a buscar aunque sea una fuente de ingreso extra"}];
  const semOk=sem.nueva_deuda===false&&sem.pago_minimos===true&&sem.flujo_positivo===true;

  const h1=renderToolCard(1,"Semaforo de tu situacion","Tres preguntas para saber como estas esta semana.",
    '<div style="margin-top:8px;">'
    +PREGUNTAS.map(p=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    +'<span style="font-size:17px;font-weight:700;flex:1;">'+p.l+'</span>'
    +'<div style="display:flex;gap:8px;">'
    +'<button onclick="updateSemaforo(&quot;'+p.id+'&quot;,true)" style="padding:8px 18px;border-radius:12px;border:1.5px solid '+(sem[p.id]===true?"#34ffaf":"rgba(255,255,255,.15)")+';background:'+(sem[p.id]===true?"rgba(52,255,175,.1)":"transparent")+';color:'+(sem[p.id]===true?"#34ffaf":"rgba(255,255,255,.6)")+';font-size:16px;font-weight:800;cursor:pointer;">Si</button>'
    +'<button onclick="updateSemaforo(&quot;'+p.id+'&quot;,false)" style="padding:8px 18px;border-radius:12px;border:1.5px solid '+(sem[p.id]===false?"#ff4e72":"rgba(255,255,255,.15)")+';background:'+(sem[p.id]===false?"rgba(255,78,114,.1)":"transparent")+';color:'+(sem[p.id]===false?"#ff4e72":"rgba(255,255,255,.6)")+';font-size:16px;font-weight:800;cursor:pointer;">No</button>'
    +'</div></div>').join("")
    +(comp1?'<div style="margin-top:14px;padding:16px;border-radius:14px;background:'+(semOk?"rgba(52,255,175,.1)":"rgba(255,78,114,.1)")+';border:1px solid '+(semOk?"rgba(52,255,175,.25)":"rgba(255,78,114,.25)")+';text-align:center;font-size:18px;font-weight:800;color:'+(semOk?"#34ffaf":"#ff4e72")+';"><span style="font-size:28px;">'+( semOk?"✅":"⚠️")+'</span><br>'+(semOk?"Bien encaminado — seguila":"Hay senales de alerta — revisemos las prioridades")+'</div>':"")
    +'</div>',comp1);

  const h2=renderToolCard(2,"Compromisos de emergencia","Estos tres son innegociables en tu situacion actual.",
    '<div style="margin-top:8px;">'
    +COMPROMISOS_P4.map(c=>'<div class="compromiso-item" onclick="toggleCompromiso(&quot;'+c.id+'&quot;)">'
    +'<div class="compromiso-check'+(comp_[c.id]?" checked":"")+'">'+( comp_[c.id]?"✓":"")+'</div>'
    +'<div class="compromiso-text">'+c.l+'</div></div>').join("")
    +'</div>',comp2);

  const h3=renderToolCard(3,"Cuanto podes liberar reduciendo gastos","Cada peso que liberas es un paso hacia la estabilizacion.",
    '<div style="margin-top:8px;">'
    +EXPENSE_CATS.filter(c=>parseFloat(gastos[c.k])>0).map(c=>{
      const val=parseFloat(gastos[c.k])||0;
      return '<div style="margin-bottom:16px;">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'
        +'<span style="font-size:16px;font-weight:700;">'+c.l+'</span>'
        +'<span style="font-size:16px;font-weight:700;color:#40d7ff;" id="lib-val-'+c.k+'">'+fmt(val)+'</span>'
        +'</div>'
        +'<input type="range" min="0" max="'+val+'" step="500" value="'+val+'" data-cat="'+c.k+'" style="width:100%;accent-color:#40d7ff;" oninput="actualizarLiberador(&quot;'+c.k+'&quot;,this.value)"/>'
        +'</div>';
    }).join("")
    +'<div style="background:rgba(64,215,255,.1);border:1px solid rgba(64,215,255,.25);border-radius:14px;padding:16px 20px;text-align:center;">'
    +'<div style="font-size:15px;color:#8390b5;margin-bottom:6px;">Si reduces a estos niveles, liberarias</div>'
    +'<div style="font-size:48px;font-weight:900;color:#40d7ff;letter-spacing:-2px;" id="total-liberado">'+fmt(0)+'</div>'
    +'<div style="font-size:15px;color:#8390b5;margin-top:4px;">por mes</div>'
    +'</div>'
    +'</div>',true);
  return h1+h2+h3;
}

// PLAN 5
function renderHerramientasPlan5(){
  const hab=herramientas.habitos||{};
  const atr=herramientas.atrasos||{};
  const comp1=Object.keys(hab).length>0;
  const comp2=Object.keys(atr).length>0;
  const diasRec=diag.diasRec||0;
  const pct90=Math.min(Math.round(diasRec/90*100),100);
  const hoy=new Date();
  const diasSemana=[];
  for(let i=6;i>=0;i--){const d=new Date(hoy);d.setDate(hoy.getDate()-i);diasSemana.push(d.toISOString().slice(0,10));}
  const ESTADOS_ATRASO=[{v:"sin_gestionar",l:"Sin gestionar"},{v:"en_negociacion",l:"En proceso de negociacion"},{v:"plan_pagos",l:"Acorde un plan de pagos"},{v:"regularizada",l:"Regularizada"}];

  const h1=renderToolCard(1,"Tu tracker de constancia","Marca los dias en que mantuviste tus habitos positivos. La constancia reconstruye el historial.",
    '<div style="margin-top:10px;">'
    +'<div style="display:flex;gap:8px;justify-content:space-between;margin-bottom:14px;">'
    +diasSemana.map(f=>{
      const d=new Date(f);
      const lbl=["Do","Lu","Ma","Mi","Ju","Vi","Sa"][d.getDay()];
      const num=d.getDate();
      const marcado=hab[f];
      return '<div style="text-align:center;cursor:pointer;" onclick="toggleHabito(&quot;'+f+'&quot;)">'
        +'<div style="font-size:13px;color:#8390b5;margin-bottom:6px;">'+lbl+'</div>'
        +'<div style="width:40px;height:40px;border-radius:50%;border:2px solid '+(marcado?"#34ffaf":"rgba(255,255,255,.2)")+';background:'+(marcado?"rgba(52,255,175,.2)":"transparent")+';display:flex;align-items:center;justify-content:center;font-size:'+(marcado?"18":"16")+'px;font-weight:900;color:'+(marcado?"#34ffaf":"rgba(255,255,255,.4)")+';margin:0 auto;transition:all .2s;">'+(marcado?"✓":num)+'</div>'
        +'</div>';
    }).join("")
    +'</div>'
    +(diasRec>0?'<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.2);border-radius:12px;">'
    +'<span style="font-size:17px;font-weight:700;color:#40d7ff;">'+diasRec+' dias de constancia</span>'
    +'<span style="font-size:15px;color:#8390b5;">Meta: 90 dias</span>'
    +'</div>':"")
    +'</div>',comp1);

  const h2=renderToolCard(2,"Estado de tus atrasos reportados","Actualiza el estado de cada deuda a medida que avanzas.",
    '<div style="margin-top:8px;">'
    +deudas.map((d,i)=>{
      const key=d.acreedor||d.tipo||"deuda_"+(i+1);
      const est=atr[key]||"sin_gestionar";
      return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
        +'<div style="font-size:17px;font-weight:800;margin-bottom:8px;">'+(d.acreedor||DEBT_TYPES.find(t=>t.v===d.tipo)?.l||"Deuda #"+(i+1))+'</div>'
        +'<select onchange="updateAtraso(&quot;'+key+'&quot;,this.value)">'
        +ESTADOS_ATRASO.map(e=>'<option value="'+e.v+'"'+(est===e.v?" selected":"")+'>'+e.l+'</option>').join("")
        +'</select>'
        +(est==="regularizada"?'<div class="micro-insight" style="margin-top:8px;background:rgba(52,255,175,.1);border:1px solid rgba(52,255,175,.25);color:#34ffaf;">Excelente! Eso mejora directamente tu perfil crediticio.</div>':"")
        +'</div>';
    }).join("")
    +(deudas.length===0?'<div style="font-size:17px;color:#8390b5;">No tenes deudas cargadas.</div>':"")
    +'</div>',comp2);

  const h3=renderToolCard(3,"Tu progreso a 90 dias","La meta es 90 dias de habitos sostenidos y atrasos regularizados.",
    '<div style="margin-top:8px;">'
    +'<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:17px;font-weight:700;"><span>Dia '+diasRec+' de 90</span><span style="color:#40d7ff;">'+pct90+'%</span></div>'
    +'<div class="progress-wrap" style="height:14px;margin-bottom:14px;"><div class="progress-bar" style="width:'+pct90+'%;background:#40d7ff;height:14px;"></div></div>'
    +'<div class="grid">'
    +[{d:30,l:"Primera revision"},{d:60,l:"Mitad del camino"},{d:90,l:"Meta final"}].map(m=>{
      const ok=diasRec>=m.d;
      return '<div style="text-align:center;padding:14px;background:'+(ok?"rgba(52,255,175,.1)":"rgba(255,255,255,.03)")+';border:1px solid '+(ok?"rgba(52,255,175,.25)":"rgba(255,255,255,.08)")+';border-radius:14px;">'
        +'<div style="font-size:13px;font-weight:800;color:'+(ok?"#34ffaf":"#8390b5")+';margin-bottom:4px;">'+(ok?"✓ ":"")+'Dia '+m.d+'</div>'
        +'<div style="font-size:13px;color:#8390b5;">'+m.l+'</div>'
        +'</div>';
    }).join("")
    +'</div></div>',true);
  return h1+h2+h3;
}

// HERRAMIENTAS — ACCIONES
function updateIngresoFormal(v){herramientas.ingresos.formal=parseFloat(v)||0;recalcularIngresos();}
function agregarIngresoExtra(){if(!herramientas.ingresos.extras)herramientas.ingresos.extras=[];herramientas.ingresos.extras.push({tipo:"",monto:0});renderTab();}
function quitarIngresoExtra(i){herramientas.ingresos.extras.splice(i,1);recalcularIngresos();renderTab();}
function updateIngresoExtra(i,k,v){herramientas.ingresos.extras[i][k]=k==="monto"?parseFloat(v)||0:v;recalcularIngresos();}
function recalcularIngresos(){
  const formal=herramientas.ingresos.formal||PRE.ingreso;
  const extra=(herramientas.ingresos.extras||[]).reduce((s,e)=>s+(parseFloat(e.monto)||0),0);
  herramientas.ingresos.total=formal+extra;
  trackHerramienta("ingreso_real_declarado",{ingreso_formal:formal,ingreso_extra:extra,total_real:herramientas.ingresos.total});
  renderTab();
}
function clasificarGasto(k,tipo){herramientas.gastos_clasificados[k]=tipo;trackHerramienta("gasto_clasificado",{categoria:k,tipo});renderTab();}
function updateGestion(key,resultado){
  if(!herramientas.gestiones)herramientas.gestiones={};
  herramientas.gestiones[key]={resultado,fecha:new Date().toISOString()};
  trackHerramienta("deuda_gestion",{acreedor:key,resultado});renderTab();
}
function toggleCompromiso(id){
  if(!herramientas.compromisos)herramientas.compromisos={};
  herramientas.compromisos[id]=!herramientas.compromisos[id];
  trackHerramienta("compromisos_actualizados",{id,valor:herramientas.compromisos[id]});renderTab();
}
function updateSemaforo(id,val){
  if(!herramientas.semaforo)herramientas.semaforo={};
  herramientas.semaforo[id]=val;
  trackHerramienta("semaforo_actualizado",{pregunta:id,respuesta:val});renderTab();
}
function actualizarLiberador(k,v){
  const el=document.getElementById("lib-val-"+k);if(el)el.textContent=fmt(parseFloat(v)||0);
  let total=0;
  EXPENSE_CATS.filter(c=>parseFloat(gastos[c.k])>0).forEach(c=>{
    const slider=document.querySelector("input[data-cat='"+c.k+"']");
    if(slider)total+=(parseFloat(gastos[c.k])||0)-(parseFloat(slider.value)||0);
  });
  const tot=document.getElementById("total-liberado");if(tot)tot.textContent=fmt(Math.round(total));
}
function toggleHabito(fecha){
  if(!herramientas.habitos)herramientas.habitos={};
  herramientas.habitos[fecha]=!herramientas.habitos[fecha];
  trackHerramienta("habito_marcado",{fecha,cumplido:herramientas.habitos[fecha]});renderTab();
}
function updateVencimiento(key,fecha){
  if(!herramientas.vencimientos)herramientas.vencimientos={};
  herramientas.vencimientos[key]=fecha;
  trackHerramienta("vencimiento_cargado",{acreedor:key,fecha});guardarLocal();
}
function updateAtraso(key,estado){
  if(!herramientas.atrasos)herramientas.atrasos={};
  herramientas.atrasos[key]=estado;
  trackHerramienta("atraso_actualizado",{acreedor:key,estado});renderTab();
}

// =============================================================================
// INFORME IMPRIMIBLE / PDF BROWSER
// =============================================================================
function renderReportActions(){
  return '<div class="plan-card" style="border-color:rgba(64,215,255,.18);">'
    +'<div class="plan-badge" style="background:rgba(64,215,255,.12);color:#40d7ff;">Informe gratis</div>'
    +'<div style="font-size:28px;font-weight:900;margin-bottom:12px;">Guardá tu diagnóstico</div>'
    +'<div class="plan-desc">Podés imprimirlo o guardarlo como PDF desde el navegador. La opción de email queda preparada para la próxima etapa.</div>'
    +'<div class="grid">'
    +'<button class="btn btn-primary" style="height:64px;font-size:19px;" onclick="abrirInformeImprimible()">Imprimir / guardar PDF</button>'
    +'<button class="btn btn-secondary" style="height:64px;font-size:18px;opacity:.75;" onclick="solicitarInformeEmail()">Enviarme por email · Próximamente</button>'
    +'</div>'
    +'</div>';
}

function solicitarInformeEmail(){
  track("report_email_interest",{status:"coming_soon",email:PRE.email||null,score:diag?.scoreReset,nivel:diag?.nivelR,causa_principal:diag?.causaPrincipal});
  alert("Próximamente vas a poder recibir este informe por email. Ya registramos tu interés.");
}

function abrirInformeImprimible(){
  if(!diag){alert("Primero generá tu Mi Plan.");return;}
  track("report_printed",{score:diag.scoreReset,nivel:diag.nivelR,causa_principal:diag.causaPrincipal});
  const html=generarHTMLInforme();
  const w=window.open("","_blank");
  if(!w){alert("El navegador bloqueó la ventana emergente. Permití popups para imprimir el informe.");return;}
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

function generarHTMLInforme(){
  const d=diag;
  const fin=d.fin;
  const prio=d.prio;
  const r=calcularRadiografia();
  const deudaNombre=prio?(prio.acreedor||DEBT_TYPES.find(t=>t.v===prio.tipo)?.l||"Deuda principal"):"Sin deuda prioritaria";
  const fecha=new Date().toLocaleDateString("es-UY");
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Credizona Mi Plan - Informe</title>'
    +'<style>body{font-family:Inter,Arial,sans-serif;color:#111827;background:#fff;margin:0;padding:32px;line-height:1.45}.wrap{max-width:760px;margin:auto}.brand{font-size:26px;font-weight:900;margin-bottom:4px}.muted{color:#6b7280}.hero{border:1px solid #e5e7eb;border-radius:20px;padding:24px;margin:24px 0;background:#f8fafc}h1{font-size:34px;line-height:1.05;margin:0 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:12px}.label{font-size:11px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.08em}.val{font-size:28px;font-weight:900;margin-top:4px}.danger{color:#dc2626}.good{color:#059669}.warn{color:#d97706}.section{margin-top:26px}ul{padding-left:20px}.cta{background:#0f172a;color:white;border-radius:18px;padding:22px;margin-top:26px}.small{font-size:12px;color:#6b7280}@media print{button{display:none}body{padding:0}.wrap{max-width:none}}</style></head><body>'
    +'<div class="wrap"><button onclick="window.print()" style="float:right;padding:10px 16px;border-radius:10px;border:0;background:#2563eb;color:white;font-weight:800;cursor:pointer;">Imprimir / guardar PDF</button>'
    +'<div class="brand">Credizona Mi Plan</div><div class="muted">Informe generado el '+fecha+'</div>'
    +'<div class="hero"><h1>'+d.causaLabel+'</h1><p>Este informe resume tu diagnóstico declarado, tu deuda más sensible, tu plan sugerido y los próximos pasos. No es un score crediticio oficial ni promete aprobación.</p></div>'
    +'<div class="grid"><div class="box"><div class="label">Score Mi Plan</div><div class="val">'+d.scoreReset+'/30</div></div><div class="box"><div class="label">Nivel</div><div class="val">'+nivelTexto(d.nivelR)+'</div></div><div class="box"><div class="label">Flujo libre mensual</div><div class="val '+(fin.flujoLibre<0?'danger':'good')+'">'+fmt(fin.flujoLibre)+'</div></div><div class="box"><div class="label">Capacidad segura de ataque</div><div class="val">'+fmt(d.capacidadSeguraAtaque)+'</div></div></div>'
    +'<div class="section"><h2>Deuda prioritaria</h2><div class="box"><strong>'+deudaNombre+'</strong><br>Monto: '+fmt(prio?prio.monto:0)+' · Pago mensual: '+fmt(prio?prio.pago:0)+' · Tasa estimada: '+(prio?(TASAS[prio.tipo]||62):0)+'% TNA</div></div>'
    +'<div class="section"><h2>Radiografía financiera</h2><div class="grid"><div class="box"><div class="label">Intereses estimados por mes</div><div class="val danger">'+fmt(Math.round(r.interesMensualTotal))+'</div></div><div class="box"><div class="label">Sueldo comprometido</div><div class="val warn">'+r.pctComprometido+'%</div></div></div><p class="small">Basado en tasas estimadas de mercado. Tu tasa real puede variar.</p></div>'
    +'<div class="section"><h2>Plan sugerido</h2><div class="box"><strong>'+d.plan.titulo+'</strong><p>'+d.plan.objetivo+'</p><ul>'+d.plan.prioridades.map(p=>'<li>'+p+'</li>').join('')+'</ul></div></div>'
    +'<div class="section"><h2>Horizontes</h2><div class="box"><strong>30 días:</strong> '+d.horizontes.d30+'</div><div class="box"><strong>90 días:</strong> '+d.horizontes.d90+'</div><div class="box"><strong>180 días:</strong> '+d.horizontes.d180+'</div></div>'
    +'<div class="cta"><h2>Informe Completo</h2><p>Para confirmar lo que realmente ve el sistema financiero, el Informe Completo cruza Clearing, Central de Riesgos BCU e IA sobre tus datos.</p></div>'
    +'</div></body></html>';
}

// =============================================================================
// MODAL PREMIUM
// =============================================================================
function abrirModalPremium(){
  track("informe_completo_opened",{plan:diag?.planId,score:diag?.scoreReset,nivel:diag?.nivelR,causa_principal:diag?.causaPrincipal});
  document.getElementById("modal-premium-content").innerHTML=renderModalPremium();
  abrirModal("modal-premium");
}
function renderModalPremium(){
  return '<div style="max-height:85vh;overflow-y:auto;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;">'
    +'<div>'
    +'<div class="premium-badge">Opcional · Informe Completo</div>'
    +'<div style="font-size:32px;font-weight:900;line-height:1.1;margin-top:6px;">Entende exactamente<br>que ve el banco sobre vos.</div>'
    +'</div>'
    +'<button onclick="cerrarModal(\'modal-premium\')" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:12px;width:44px;height:44px;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;flex-shrink:0;">×</button>'
    +'</div>'
    +'<div class="premium-text">Tu diagnostico actual esta basado en lo que vos declaraste. Informe Completo cruza tu historial real en el sistema financiero, Clearing, BCU y tus datos declarados con inteligencia artificial.</div>'

    // Lo que recibis
    +'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:22px;margin-bottom:18px;">'
    +'<div style="font-size:13px;color:#8390b5;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:16px;">Lo que vas a recibir</div>'
    +[["🔍","Tu historial real en el sistema financiero","Deudas, atrasos y consultas que el banco ve sobre vos"],
      ["🤖","Analisis con inteligencia artificial","La IA interpreta el informe y te dice que corregir primero"],
      ["📋","Plan de accion basado en datos reales","No en estimaciones — en lo que realmente figura"],
      ["✉️","Todo por email","Recibis el informe y el analisis en tu correo"],
      ["✓","Verificacion de errores en tu historial","Si hay algo mal registrado, te lo decimos — eso puede cambiarlo todo"],
    ].map(([ic,t,d])=>'<div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);">'
    +'<span style="font-size:22px;flex-shrink:0;">'+ic+'</span>'
    +'<div><div style="font-size:18px;font-weight:700;margin-bottom:3px;">'+t+'</div><div style="font-size:15px;color:#8390b5;line-height:1.5;">'+d+'</div></div>'
    +'</div>').join("")
    +'</div>'

    // Precios
    +'<div class="pricing-grid">'
    +'<div class="pricing-card" onclick="seleccionarPlan(\'one_time\')">'
    +'<div style="font-size:13px;color:#8390b5;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Una vez</div>'
    +'<div class="price-amount">990</div>'
    +'<div class="price-label">UYU · pago unico</div>'
    +'<div class="price-desc">Clearing + BCU + análisis IA. Sin compromiso.</div>'
    +'<button class="btn btn-secondary" style="width:100%;height:56px;font-size:17px;margin-top:14px;">Elegir este plan</button>'
    +'</div>'
    +'<div class="pricing-card featured" onclick="seleccionarPlan(\'trimestral\')">'
    +'<div class="pricing-top-badge">Recomendado</div>'
    +'<div style="font-size:13px;color:#40d7ff;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Trimestral</div>'
    +'<div class="price-amount">1.290</div>'
    +'<div class="savings-badge">Ahorras UYU 180</div>'
    +'<div class="price-label">UYU · pago unico</div>'
    +'<div class="price-desc">3 revisiones (día 0, 30 y 60) + análisis IA. Sin sorpresas.</div>'
    +'<button class="btn btn-primary" style="width:100%;height:56px;font-size:17px;margin-top:14px;">Elegir trimestral</button>'
    +'</div>'
    +'</div>'

    +'<div style="background:rgba(255,211,111,.08);border:1px solid rgba(255,211,111,.2);border-radius:14px;padding:14px 18px;margin-bottom:16px;">'
    +'<div style="font-size:14px;font-weight:800;color:#ffd36f;margin-bottom:4px;">Cual elegir?</div>'
    +'<div style="font-size:15px;color:#8390b5;line-height:1.6;">El <strong style="color:rgba(255,255,255,.9);">pago unico</strong> es para entender tu situacion ahora. El <strong style="color:rgba(255,255,255,.9);">trimestral</strong> actualiza tu informe en los dias 30 y 60, y te avisa cuando tu perfil esta listo para volver a pedir el credito.</div>'
    +'</div>'

    +'<div style="text-align:center;font-size:15px;color:#8390b5;">Si en 7 dias no te ayudo, te devolvemos el dinero. No promete aprobación. Te ayuda a entender qué ve el sistema financiero.</div>'
    +'</div>';
}
function seleccionarPlan(tipo){
  track("informe_completo_checkout_started",{tipo,plan:diag?.planId,score:diag?.scoreReset,nivel:diag?.nivelR});
  cerrarModal("modal-premium");
  alert("Redirigiendo al pago... (TODO: integrar pasarela de pago). El evento informe_completo_purchased queda reservado para cuando exista pago real.");
}

// =============================================================================
// FOOTER
// =============================================================================
function renderFooter(){
  return '<div class="footer"><strong>Credizona Mi Plan</strong>Herramienta de evaluacion financiera para volver a tener oportunidades.</div>';
}

// =============================================================================
// START
// =============================================================================
init();
