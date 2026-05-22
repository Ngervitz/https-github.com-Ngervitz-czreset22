// =============================================================================
// ui.js — Funciones de renderizado
// Depende de: config.js, creditors.js, algorithms.js, crm.js, events.js
// =============================================================================

// --- Accesores de estado ---
function _st()    { return window.CZState || {}; }
function _diag()  { return _st().diag; }
function _herr()  { return _st().herr || {}; }

// =============================================================================
// STICKY BAR
// =============================================================================
function updateSticky() {
  var st   = _st();
  var step = st.step || 0;
  var diag = _diag();
  var lbl  = document.getElementById("sticky-lbl");
  var stEl = document.getElementById("sticky-step");
  var cta  = document.getElementById("sticky-cta");
  if (!lbl || !stEl || !cta) return;

  if (step === 0 && SEGMENTO === 1) {
    lbl.textContent  = "Evaluacion inicial";
    stEl.textContent = "Ver mi evaluacion y continuar";
    cta.textContent  = "Ver evaluacion";
    cta.className    = "sticky-btn";
  } else if (step === 0 || step === 1) {
    lbl.textContent  = "Paso " + (SEGMENTO === 1 ? 2 : 1) + " de " + (SEGMENTO === 1 ? 3 : 2);
    stEl.textContent = "Completa tus gastos mensuales";
    cta.textContent  = "Continuar";
    cta.className    = "sticky-btn";
  } else if (step === 2) {
    lbl.textContent  = "Ultimo paso";
    stEl.textContent = "Genera tu diagnostico completo";
    cta.textContent  = "Ver mi plan";
    cta.className    = "sticky-btn";
  } else {
    lbl.textContent  = (diag && diag.plan && diag.plan.cta) || "Tu plan";
    stEl.textContent = "Profundiza el analisis con Reset Plus";
    cta.textContent  = "Reset Plus";
    cta.className    = "sticky-btn premium";
  }
}

// =============================================================================
// HEADER
// =============================================================================
function updateHeader() {
  var st   = _st();
  var step = st.step || 0;
  var snap = st.snap;
  var day  = document.getElementById("header-day");
  var btnN = document.getElementById("btn-nuevo");
  if (!day || !btnN) return;

  if (step === 3) {
    if (snap) {
      var d = Math.floor((Date.now() - new Date(snap.fecha_inicio).getTime()) / 86400000);
      if (d > 0) { day.textContent = "Dia " + d; day.classList.remove("hidden"); }
    }
    btnN.classList.remove("hidden");
  } else {
    day.classList.add("hidden");
    btnN.classList.add("hidden");
  }
}

// =============================================================================
// STEP PILLS
// =============================================================================
function renderStepPills(cur, total) {
  var labels = SEGMENTO === 1 ? ["Evaluacion", "Gastos", "Deudas"] : ["Gastos", "Deudas"];
  var t = total || labels.length;
  var html = '<div class="step-pills">';
  labels.slice(0, t).forEach(function(l, i) {
    var done   = i < cur;
    var active = i === cur;
    html += '<div class="pill">'
      + '<div class="pill-num' + (done ? " done" : active ? " active" : "") + '">'
      + (done ? "✓" : (i + 1)) + '</div>'
      + '<span class="pill-label' + (active ? " active" : "") + '">' + l + '</span>'
      + '</div>';
    if (i < labels.slice(0, t).length - 1) html += '<div class="pill-div"></div>';
  });
  return html + '</div>';
}

// =============================================================================
// STEP 0 — DIAGNOSTICO INICIAL (Segmento 1)
// =============================================================================
function renderDiagInicial() {
  var r = PRE.respuestas;
  var signals = [], good = [];

  if (r.p1 === "C" || r.p1 === "D") signals.push({ i: "⚠️", t: "Sin claridad financiera",       d: "No tenes claro cuanto entra y sale cada mes. Eso hace casi imposible priorizar correctamente." });
  if (r.p6 === "D")                  signals.push({ i: "⚠️", t: "Prestamos informales detectados", d: "Los prestamos informales son los que mas rapido destruyen el flujo mensual." });
  if (r.p5 === "D")                  signals.push({ i: "⚠️", t: "Estres financiero maximo",        d: "Tu nivel de estres financiero es maximo. Eso afecta directamente las decisiones que tomas." });
  if (r.p7 === "C" || r.p7 === "D") signals.push({ i: "⚠️", t: "Deudas sin plan de salida",      d: "No sabes cuanto tiempo te llevaria salir de tus deudas. Esa falta de claridad es una senal importante." });
  if (r.p8 === "A")                  good.push({ i: "✅", t: "Ya tomaste acciones recientes",     d: "Eso es una ventaja real. El sistema valora que ya estes haciendo algo al respecto." });
  if (r.p3 === "A" || r.p3 === "B") good.push({ i: "✅", t: "Responsabilidad financiera alta",   d: "Tu nivel de responsabilidad es bueno. Con un plan claro, eso se traduce en resultados." });
  if (signals.length === 0)          signals.push({ i: "⚠️", t: "Posible carga mensual alta",     d: "Puede haber demasiados pagos compitiendo con tus ingresos. Necesitamos tus datos para confirmarlo." });

  return '<div class="badge"><div class="dot"></div>Tu evaluacion inicial esta lista</div>'
    + '<h1>Ya analizamos tus respuestas.<br><span class="gradient">Ahora veamos el plan.</span></h1>'
    + '<div class="lead">Encontramos factores que podrian estar afectando hoy tu perfil financiero y tus posibilidades de aprobacion.</div>'
    + '<div class="sub">La idea no es pedirte otro formulario de cero. Primero te mostramos una lectura inicial. Despues, si queres mas precision, completas gastos y deudas.</div>'
    + '<div class="btn-wrap" style="margin-bottom:20px;">'
    + '<button class="btn btn-primary" id="btn-ver-evaluacion">Ver mi evaluacion inicial</button>'
    + '<button class="btn btn-secondary" id="btn-analisis-profundo">Completar analisis profundo</button>'
    + '</div>'
    + '<div class="disclaimer">No afecta futuras solicitudes. No es un score crediticio oficial.</div>'
    + '<div id="eval-card" class="hidden" style="margin-top:26px;">'
    + '<div class="card">'
    + '<div class="card-top"><div class="card-label">Evaluacion inicial</div>'
    + (signals.length > 0 ? '<div class="alert-badge">ATENCION</div>' : '<div class="alert-badge" style="border-color:rgba(52,255,175,.35);color:#34ffaf;">TODO BIEN</div>')
    + '</div>'
    + '<div class="card-title">Perfil con senales de presion financiera</div>'
    + signals.map(function(s) {
        return '<div class="signal"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + good.map(function(s) {
        return '<div class="signal" style="border-color:rgba(52,255,175,.2);background:rgba(52,255,175,.05);"><div class="signal-icon">' + s.i + '</div><div><div class="signal-title">' + s.t + '</div><div class="signal-text">' + s.d + '</div></div></div>';
      }).join("")
    + '<div class="good-news"><strong>La buena noticia:</strong> con algunos ajustes podes mejorar progresivamente tu situacion y aumentar tus posibilidades futuras de aprobacion.</div>'
    + '<div style="margin-top:26px;"><button class="btn btn-primary" id="btn-ver-plan-personalizado">Ver mi plan personalizado</button></div>'
    + '</div>'
    + '<div class="card">'
    + '<div class="section-title">Para darte un diagnostico mas preciso necesitamos 2 minutos mas.</div>'
    + '<div class="section-text">No necesitas montos exactos. Una estimacion alcanza para detectar que deuda te esta danando mas.</div>'
    + '<div class="steps">'
    + [["1","Gastos","Vemos cuanto margen mensual queda."],["2","Deudas","Identificamos acreedores y montos."],["3","Prioridad","Calculamos que deuda dana mas."],["4","Plan","Te mostramos que hacer primero."]]
      .map(function(x) { return '<div class="step"><div class="step-num">' + x[0] + '</div><div class="step-title">' + x[1] + '</div><div class="step-text">' + x[2] + '</div></div>'; }).join("")
    + '</div></div></div>';
}

function mostrarEvaluacion() {
  var el = document.getElementById("eval-card");
  if (el) { el.classList.remove("hidden"); setTimeout(function() { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }
  track("view_initial_diagnosis", { segmento: SEGMENTO });
}

// =============================================================================
// STEP 1 — GASTOS
// =============================================================================
function renderGastos() {
  var gastos = _st().gastos || {};
  var total  = Object.values(gastos).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
  var pct    = PRE.ingreso > 0 ? total / PRE.ingreso : 0;
  var pc     = pct > 0.9 ? "#ff4e72" : pct > 0.7 ? "#ffd36f" : "#34ffaf";

  var html = renderStepPills(SEGMENTO === 1 ? 1 : 0, SEGMENTO === 1 ? 3 : 2);

  if (SEGMENTO <= 2) {
    html += '<div class="card"><div class="card-label" style="margin-bottom:18px;">Datos de tu solicitud</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">'
      + [["Nombre", PRE.nombre], ["Email", PRE.email], ["Ingreso mensual", fmt(PRE.ingreso)], ["Situacion laboral", SITUACION_LABELS[PRE.laboral] || PRE.laboral]]
        .filter(function(x) { return x[1]; })
        .map(function(x) { return '<div><label>' + x[0] + '</label><div style="font-size:18px;font-weight:700;color:rgba(255,255,255,.9);">' + x[1] + '</div></div>'; }).join("")
      + '</div></div>';
  }

  html += '<div class="card">'
    + '<div class="section-title">Gastos mensuales</div>'
    + '<div class="section-text">No necesitas montos exactos. Una estimacion ya nos permite detectar patrones financieros importantes.</div>'
    + EXPENSE_CATS.map(function(c, i) {
        var val    = parseFloat(gastos[c.k]) || 0;
        var isOpen = val > 0 || i === 0;
        return '<div class="accordion-item">'
          + '<button class="accordion-trigger' + (isOpen ? " open" : "") + '" data-accordion>'
          + '<span>' + c.l + (val > 0 ? ' <span style="color:#40d7ff;font-size:17px;">' + fmt(val) + '</span>' : "") + '</span>'
          + '<span class="chevron">&#9660;</span></button>'
          + '<div class="accordion-body' + (isOpen ? " open" : "") + '">'
          + '<div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;pointer-events:none;">$</span>'
          + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (gastos[c.k] || "") + '" data-gasto="' + c.k + '"/>'
          + '</div></div></div>';
      }).join("")
    + (total > 0
        ? '<div style="margin-top:20px;background:rgba(64,215,255,.08);border:1px solid rgba(64,215,255,.2);border-radius:18px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-size:19px;font-weight:700;color:rgba(255,255,255,.8);">Total gastos</span>'
          + '<span id="total-gastos-val" style="font-size:36px;font-weight:900;color:' + pc + ';">' + fmt(total) + '</span>'
          + '</div>'
        : "")
    + '</div>';

  if (SEGMENTO === 1) {
    html += '<button class="nav-back" id="btn-back-diag">&#8592; Atras</button>';
  }
  return html;
}

// =============================================================================
// STEP 2 — DEUDAS
// =============================================================================
function renderDeudas() {
  var html = renderStepPills(SEGMENTO === 1 ? 2 : 1, SEGMENTO === 1 ? 3 : 2);
  var deudas = _st().deudas || [];

  html += '<div class="card">'
    + '<div class="section-title">Tus deudas</div>'
    + '<div class="section-text">El acreedor y el tipo de deuda son fundamentales para detectar que deuda te esta danando mas y por donde empezar.</div>'
    + '<div id="deudas-container">' + deudas.map(renderDeudaCard).join("") + '</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;margin-bottom:0;" id="btn-agregar-deuda">+ Agregar deuda</button>'
    + '<div class="metrics" id="metrics-live">' + renderMetricsLive() + '</div>'
    + '<div class="result" id="result-live"><h3 id="result-title">Todavia no analizamos tus deudas</h3>'
    + '<p id="result-text">Completa tus deudas para detectar que acreedor esta generando mas presion financiera.</p></div>'
    + '</div>'
    + '<button class="nav-back" id="btn-back-gastos">&#8592; Atras</button>';
  return html;
}

function renderDeudaCard(d, i) {
  var est         = getEstado(d.estado);
  var borderColor = est ? est.color : "rgba(61,220,255,.25)";
  var tasa        = d.tipo ? TASAS[d.tipo] : null;
  var insight     = d.tipo ? getMicroInsight(d.tipo) : null;

  return '<div class="debt-card" id="debt-card-' + i + '" style="border-left:3px solid ' + borderColor + ';">'
    + '<div class="debt-top"><div class="debt-name">Deuda #' + (i + 1) + (d.acreedor ? " — " + d.acreedor : "") + '</div>'
    + '<button class="remove-btn" data-remove-deuda="' + i + '">&#215;</button></div>'
    + '<div class="grid">'
    + '<div class="field"><label>Tipo de deuda</label>'
    + '<select data-deuda-field="tipo" data-deuda-idx="' + i + '">'
    + '<option value="">Selecciona...</option>'
    + DEBT_TYPES.map(function(t) { return '<option value="' + t.v + '"' + (d.tipo === t.v ? " selected" : "") + '>' + t.l + ' (~' + t.tasa + '% TNA)</option>'; }).join("")
    + '</select></div>'
    + '<div class="field"><label>Acreedor</label><input type="text" placeholder="Ej: BROU, OCA..." value="' + (d.acreedor || "") + '" data-deuda-field="acreedor" data-deuda-idx="' + i + '"/></div>'
    + '<div class="field"><label>Monto de la deuda</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (d.monto || "") + '" data-deuda-field="monto" data-deuda-idx="' + i + '"/></div></div>'
    + '<div class="field"><label>Pago mensual</label><div style="position:relative;"><span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);color:#8390b5;font-weight:700;font-size:18px;">$</span>'
    + '<input type="number" style="padding-left:36px;" placeholder="0" value="' + (d.pago || "") + '" data-deuda-field="pago" data-deuda-idx="' + i + '"/></div></div>'
    + '</div>'
    + '<div class="field" style="margin-top:12px;"><label>Estado de la deuda</label>'
    + '<select data-deuda-field="estado" data-deuda-idx="' + i + '">'
    + '<option value="">Selecciona el estado...</option>'
    + ESTADOS_DEUDA.map(function(e) { return '<option value="' + e.v + '"' + (d.estado === e.v ? " selected" : "") + '>' + e.l + '</option>'; }).join("")
    + '</select></div>'
    + (est
        ? '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 14px;border-radius:10px;background:' + est.color + '15;border:1px solid ' + est.color + '30;">'
          + '<div style="width:12px;height:12px;border-radius:50%;background:' + est.color + ';flex-shrink:0;"></div>'
          + '<span style="font-size:14px;font-weight:700;color:' + est.color + ';">' + est.impact + '</span></div>'
        : "")
    + (tasa ? '<div style="font-size:14px;color:#8390b5;margin-top:8px;">Tasa estimada: ~' + tasa + '% TNA · intereses aprox. ' + fmt(Math.round((parseFloat(d.monto) || 0) * tasa / 100 / 12)) + '/mes</div>' : "")
    + (insight ? '<div class="micro-insight micro-' + insight.cls + '">' + insight.txt + '</div>' : "")
    + '</div>';
}

function getMicroInsight(tipo) {
  var m = {
    tarjeta:    { cls: "warn",   txt: "⚠️ Las tarjetas de credito acumulan el interes mas rapido. Son prioridad." },
    informal:   { cls: "danger", txt: "⚠️ Los prestamos informales destruyen el flujo financiero muy rapido." },
    mora:       { cls: "danger", txt: "⚠️ Las deudas en mora tienen el impacto mas fuerte sobre tu perfil." },
    financiera: { cls: "warn",   txt: "⚠️ Las financieras tienen tasas altas. Considera refinanciar si es posible." },
  };
  return m[tipo] || null;
}

function renderMetricsLive() {
  var fin = calcularFinanciero();
  return '<div class="metric"><small>Deuda total</small><strong style="color:#ff4e72;">' + fmt(fin.totalDeuda) + '</strong></div>'
    + '<div class="metric"><small>Pago mensual</small><strong style="color:#ffd36f;">' + fmt(fin.totalPago) + '</strong></div>'
    + '<div class="metric"><small>Interes promedio</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';">' + fin.interesProm + '%</strong></div>'
    + '<div class="metric"><small>Nivel de riesgo</small><strong style="color:' + colorRiesgo(fin.nivelRiesgo) + ';">' + fin.nivelRiesgo + '</strong></div>';
}

function actualizarResultLive() {
  var fin   = calcularFinanciero();
  var prio  = deudaPrioritaria();
  var title = document.getElementById("result-title");
  var text  = document.getElementById("result-text");
  if (!title || !text) return;
  if (!prio) {
    title.textContent = "Todavia no analizamos tus deudas";
    text.textContent  = "Completa tus deudas para detectar que acreedor esta generando mas presion financiera.";
    return;
  }
  title.textContent = (prio.acreedor || prio.tipo || "Esta deuda") + " parece ser tu deuda mas sensible";
  if (fin.nivelRiesgo === "Critico") text.textContent = "Detectamos una combinacion de pagos altos y deuda cara. La prioridad es recuperar flujo y evitar seguir acumulando intereses.";
  else if (fin.nivelRiesgo === "Medio") text.textContent = "Tu situacion parece ordenable, pero ya hay presion financiera. La prioridad deberia ser reorganizar y atacar primero la deuda de " + (prio.acreedor || prio.tipo) + ".";
  else text.textContent = "No parece una situacion critica, pero hay oportunidades claras para mejorar tu perfil si priorizas correctamente.";
}

function actualizarMetrics() {
  var m = document.getElementById("metrics-live");
  if (m) m.innerHTML = renderMetricsLive();
  actualizarResultLive();
}

// =============================================================================
// DASHBOARD
// =============================================================================
function renderDashboard() {
  var st     = _st();
  var tab    = st.tab || "plan";
  var plus   = st.plusEstado || "sin_pago";
  var locked = function(id) { return (id === "ia" || id === "plus") && plus === "sin_pago"; };

  var TABS = [
    { id: "plan",   l: "Mi plan",     icon: "🎯" },
    { id: "deudas", l: "Mis deudas",  icon: "✏️" },
    { id: "ia",     l: "Asistente IA", icon: "🤖", lock: true },
    { id: "plus",   l: "Reset Plus",  icon: "⭐", lock: true },
  ];

  return '<div class="tabs">'
    + TABS.map(function(t) {
        var isLocked = t.lock && locked(t.id);
        return '<button class="tab-btn' + (tab === t.id ? " active" : "") + (isLocked ? " locked" : "") + '" data-tab="' + t.id + '">'
          + t.icon + " " + t.l + (isLocked ? " 🔒" : "") + '</button>';
      }).join("")
    + '</div><div id="tab-content"></div>';
}

function renderTab() {
  var el  = document.getElementById("tab-content");
  var tab = (_st().tab || "plan");
  if (!el) return;
  if (tab === "plan")   el.innerHTML = renderTabPlan();
  if (tab === "deudas") el.innerHTML = renderTabDeudas();
  if (tab === "ia")     el.innerHTML = renderTabIA();
  if (tab === "plus")   el.innerHTML = renderTabPlus();
  bindTabEvents();
}

// =============================================================================
// TAB: MI PLAN
// =============================================================================
function renderTabPlan() {
  var diag   = _diag();
  var st     = _st();
  var fin    = diag.fin;
  var pc     = diag.plan.color;
  var prio   = diag.prio;
  var prog   = st.saldoIni > 0 ? Math.max(0, (st.saldoIni - fin.totalDeuda) / st.saldoIni * 100) : 0;

  return '<div class="fade">'
    + '<div class="plan-card" style="border-color:' + pc + '33;">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;">'
    + '<div><div class="plan-badge" style="background:' + pc + '20;color:' + pc + ';">Plan #' + diag.planId + ' · ' + diag.plan.titulo + '</div>'
    + '<div class="plan-title-big">' + diag.plan.icon + ' ' + diag.plan.titulo + '</div>'
    + '<div class="plan-desc">' + diag.plan.problema + '</div></div>'
    + '<div style="text-align:right;flex-shrink:0;">'
    + '<div class="score-big" style="color:' + colorScore(diag.scoreReset) + ';">' + diag.scoreReset + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:4px;">de 30</div>'
    + '<div style="font-size:14px;font-weight:800;color:' + colorNivel(diag.nivelR) + ';margin-top:6px;">' + nivelTexto(diag.nivelR) + '</div>'
    + '</div></div>'
    + '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:18px;">'
    + '<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Objetivo</div>'
    + '<div style="font-size:19px;color:rgba(255,255,255,.9);line-height:1.6;">' + diag.plan.objetivo + '</div>'
    + '</div></div>'

    // Scores descompuestos
    + '<div class="plan-card">'
    + '<div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Como se calcula tu puntaje</div>'
    + '<div class="grid">'
    + '<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Situacion financiera</div>'
    + '<div style="font-size:52px;font-weight:900;color:' + colorScore(fin.scoreFinanciero) + ';line-height:1;letter-spacing:-2px;">' + fin.scoreFinanciero + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:6px;">gastos y deudas · max 30</div></div>'
    + '<div style="text-align:center;padding:18px;background:rgba(255,255,255,.04);border-radius:16px;">'
    + '<div style="font-size:14px;color:#8390b5;margin-bottom:8px;">Habitos financieros</div>'
    + '<div style="font-size:52px;font-weight:900;color:' + colorScore(diag.enc.score) + ';line-height:1;letter-spacing:-2px;">' + (TIENE_ENCUESTA ? diag.enc.score : "—") + '</div>'
    + '<div style="font-size:14px;color:#8390b5;margin-top:6px;">encuesta conductual · max 30</div></div>'
    + '</div>'
    + '<div style="margin-top:14px;font-size:15px;color:#8390b5;text-align:center;">Revision sugerida en <strong style="color:rgba(255,255,255,.8);">' + diag.plan.reevaluacion + '</strong></div>'
    + '</div>'

    // Radiografia
    + renderRadiografia()

    // Metricas
    + '<div class="metrics">'
    + [
        { l: "Plata que te sobra/mes",   v: fmt(fin.flujoLibre),           c: fin.flujoLibre < 0 ? "#ff4e72" : "#34ffaf", s: fin.flujoLibre < 0 ? "deficit" : "disponible" },
        { l: "Total de deudas",           v: fmt(fin.totalDeuda),           c: "#ffd36f",                                   s: (_st().deudas||[]).length + " deuda" + ((_st().deudas||[]).length !== 1 ? "s" : "") },
        { l: "De tu sueldo va a deudas",  v: Math.round(fin.ratio * 100) + "%", c: fin.ratio > 0.5 ? "#ff4e72" : fin.ratio > 0.35 ? "#ffd36f" : "#34ffaf", s: "meta: menos del 30%" },
        { l: "Pagas en cuotas por mes",   v: fmt(fin.totalPago),            c: "rgba(255,255,255,.7)",                      s: "suma de minimos" },
      ].map(function(m) { return '<div class="metric"><small>' + m.l + '</small><strong style="color:' + m.c + ';">' + m.v + '</strong><div style="font-size:14px;color:#8390b5;margin-top:6px;">' + m.s + '</div></div>'; }).join("")
    + '</div>'

    // Progreso
    + (st.saldoIni > 0
        ? '<div class="plan-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div><div style="font-size:20px;font-weight:800;">Tu progreso</div><div style="font-size:15px;color:#8390b5;margin-top:4px;">Dia ' + diag.diasRec + ' de recuperacion</div></div>'
          + '<div style="text-align:right;"><div style="font-size:52px;font-weight:900;color:' + (prog > 0 ? "#34ffaf" : "#8390b5") + ';line-height:1;letter-spacing:-2px;">' + Math.round(prog) + '%</div><div style="font-size:14px;color:#8390b5;">reducido</div></div></div>'
          + '<div class="progress-wrap"><div class="progress-bar" style="width:' + prog + '%;background:' + (prog > 50 ? "#34ffaf" : prog > 20 ? "#ffd36f" : "#ff4e72") + ';"></div></div>'
          + '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:15px;color:#8390b5;"><span>Inicio: ' + fmt(st.saldoIni) + '</span><span>Hoy: ' + fmt(fin.totalDeuda) + '</span></div></div>'
        : "")

    // Prioridades
    + '<div class="plan-card"><div style="font-size:14px;color:#8390b5;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Que hacer primero</div>'
    + diag.plan.prioridades.map(function(p, i) {
        return '<div class="prioridad-item"><div class="prioridad-num" style="background:' + pc + '20;color:' + pc + ';">' + (i + 1) + '</div><div class="prioridad-text">' + p + '</div></div>';
      }).join("")
    + '</div>'

    // Deuda prioritaria
    + (prio
        ? '<div class="priority-card">'
          + '<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;">⚠ Deuda prioritaria</div>'
          + '<div style="font-size:28px;font-weight:900;margin-bottom:14px;">' + (prio.acreedor || DEBT_TYPES.find(function(t) { return t.v === prio.tipo; })?.l || "Sin nombre") + '</div>'
          + '<div class="grid">'
          + [["Monto", fmt(parseFloat(prio.monto)||0), "#ff4e72"], ["Pago mensual", fmt(parseFloat(prio.pago)||0), "#ffd36f"], ["Tasa estimada", "~" + (TASAS[prio.tipo]||62) + "% TNA", "#ff4e72"], ["Interes/mes", fmt(Math.round((parseFloat(prio.monto)||0)*(TASAS[prio.tipo]||62)/100/12)), "#ffd36f"]]
            .map(function(x) { return '<div><small style="color:#8390b5;display:block;margin-bottom:6px;">' + x[0] + '</small><strong style="font-size:32px;color:' + x[2] + ';">' + x[1] + '</strong></div>'; }).join("")
          + '</div></div>'
        : "")

    + renderHerramientas()

    + '<div class="premium-card">'
    + '<div class="premium-badge">Opcional · siguiente nivel</div>'
    + '<div class="premium-title">Reset Plus</div>'
    + '<div class="premium-text">Si queres profundizar el analisis, accede a tu informe Clearing interpretado con inteligencia artificial y un plan basado en tus datos reales.</div>'
    + '<button class="btn btn-secondary" style="height:68px;font-size:20px;" id="btn-conocer-plus">Conocer Reset Plus</button>'
    + '</div></div>';
}

// =============================================================================
// RADIOGRAFIA FINANCIERA
// =============================================================================
function renderRadiografia() {
  var st = _st();
  if (!_diag() || !st.deudas || st.deudas.length === 0) return "";
  var r = calcularRadiografia();
  var DISC = '<div style="font-size:12px;color:#8390b5;margin-top:6px;">* Basado en tasas estimadas de mercado. Tu tasa real puede variar.</div>';

  return '<div style="margin-bottom:20px;">'
    + '<div style="font-size:11px;font-weight:800;color:#8390b5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;">Tu radiografia financiera</div>'

    // 1. Interes puro
    + '<div style="background:rgba(255,78,114,.07);border:1px solid rgba(255,78,114,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
    + '<div style="font-size:13px;font-weight:800;color:#ff4e72;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">💸 Lo que pagas sin reducir deuda</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
    + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo intereses por mes</div><div style="font-size:34px;font-weight:900;color:#ff4e72;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal)) + '</div></div>'
    + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Solo en un ano</div><div style="font-size:34px;font-weight:900;color:#ffd447;line-height:1;letter-spacing:-1px;">' + fmt(Math.round(r.interesMensualTotal * 12)) + '</div></div>'
    + '</div>' + DISC + '</div>'

    // 2. Meses por deuda
    + (st.deudas.some(function(_, i) { return r.mesesPorDeuda[i] !== null; })
        ? '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px;margin-bottom:12px;">'
          + '<div style="font-size:13px;font-weight:800;color:#ffd447;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">📅 Cuando cancelarias cada deuda</div>'
          + st.deudas.map(function(d, i) {
              var meses  = r.mesesPorDeuda[i];
              if (meses === null) return "";
              var nombre = d.acreedor || (DEBT_TYPES.find(function(t) { return t.v === d.tipo; }) || {}).l || "Deuda #" + (i + 1);
              var color  = meses >= 60 ? "#ff4e72" : meses >= 24 ? "#ffd447" : "#34ffaf";
              var txt    = meses >= 999 ? "Nunca con el pago actual" : meses + " meses";
              return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);"><div style="font-size:15px;font-weight:700;">' + nombre + '</div><div style="font-size:20px;font-weight:900;color:' + color + ';">' + txt + '</div></div>';
            }).join("")
          + DISC + '</div>'
        : "")

    // 3. Ahorro extra
    + (r.ahorroPagandoExtra
        ? '<div style="background:rgba(52,255,175,.07);border:1px solid rgba(52,255,175,.2);border-radius:18px;padding:20px;margin-bottom:12px;">'
          + '<div style="font-size:13px;font-weight:800;color:#34ffaf;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">⚡ Si pagas ' + fmt(r.ahorroPagandoExtra.extra) + ' extra por mes</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Te ahorras en intereses</div><div style="font-size:34px;font-weight:900;color:#34ffaf;line-height:1;">' + fmt(Math.round(r.ahorroPagandoExtra.ahorro)) + '</div></div>'
          + '<div><div style="font-size:12px;color:#8390b5;margin-bottom:5px;">Cancelas ' + r.ahorroPagandoExtra.mesesMenos + ' meses antes</div><div style="font-size:34px;font-weight:900;color:#34ffaf;line-height:1;">' + r.ahorroPagandoExtra.mesesCon + ' meses</div>'
          + '<div style="font-size:12px;color:#8390b5;margin-top:4px;">vs ' + r.ahorroPagandoExtra.mesesSin + ' sin el extra</div></div>'
          + '</div>'
          + '<div style="margin-top:12px;font-size:14px;color:#8390b5;">Aplicado a tu deuda prioritaria: <strong style="color:rgba(255,255,255,.8);">' + (r.prio ? (r.prio.acreedor || (DEBT_TYPES.find(function(t) { return t.v === r.prio.tipo; }) || {}).l || "deuda principal") : "deuda principal") + '</strong></div>'
          + DISC + '</div>'
        : "")

    // 4. % comprometido
    + '<div style="background:rgba(
