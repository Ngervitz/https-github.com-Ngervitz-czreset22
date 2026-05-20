// =============================================================================
// app.js — Inicializacion, estado global, navegacion y event listeners
// Depende de: todos los archivos anteriores
// =============================================================================

// =============================================================================
// ESTADO GLOBAL
// =============================================================================
window.CZState = {
  step:       0,
  gastos:     {},
  deudas:     [],
  diag:       null,
  snap:       null,
  saldoIni:   0,
  tab:        "situacion",   // tab inicial: Mi situacion
  plusEstado: "sin_pago",    // sin_pago | email_solicitado | pagado
  iaRes:      null,
  herr: {
    ingresos:     { formal: 0, extras: [], total: 0 },
    gastos_cls:   {},
    gestiones:    {},
    compromisos:  {},
    semaforo:     {},
    habitos:      {},
    atrasos:      {},
    vencimientos: {},
  },
};

// Pasos del flujo — Fase 1: deudas primero, gastos segundo (opcional)
// step 0: diagnostico inicial (seg 1) o directo a deudas
// step 1: deudas
// step 2: gastos (opcional)
// step 3: dashboard

// =============================================================================
// STORAGE
// =============================================================================
window.guardarLocal = function(extra) {
  extra = extra || {};
  try {
    var st = window.CZState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({
      step:       st.step,
      gastos:     st.gastos,
      deudas:     st.deudas,
      diag:       st.diag,
      snap:       st.snap,
      saldoIni:   st.saldoIni,
      tab:        st.tab,
      plusEstado: st.plusEstado,
      iaRes:      st.iaRes,
      herr:       st.herr,
      fecha:      new Date().toISOString(),
    }, extra)));
  } catch (e) {}
};

function cargarLocal() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// =============================================================================
// NAVEGACION — orden: diag (opt) → deudas → gastos (opt) → dashboard
// =============================================================================
function next() {
  var st = window.CZState;

  // Step 0: diagnostico inicial (solo seg 1) → ir a deudas
  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    track(EVENTOS.DEBT_STARTED);
    window.CredizonaUI.renderAll();
    return;
  }

  // Step 0 (seg 2/3) o step 1 (deudas): validar y avanzar a gastos
  if (st.step === 0 || st.step === 1) {
    if (st.deudas.length === 0) {
      alert("Agrega al menos una deuda para continuar.");
      return;
    }
    if (st.deudas.length === 1) {
      track(EVENTOS.FIRST_DEBT_ADDED, { acreedor: st.deudas[0].acreedor });
    }
    st.step = 2;
    track(EVENTOS.EXPENSES_STARTED);
    window.CredizonaUI.renderAll();
    return;
  }

  // Step 2 (gastos): generar diagnostico y pasar a dashboard
  if (st.step === 2) {
    st.diag     = calcularMotor();
    st.saldoIni = st.deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
    st.snap     = {
      fecha_inicio:  new Date().toISOString(),
      score_miplan:  st.diag.scoreReset,
      nivel:         st.diag.nivelR,
      plan_titulo:   st.diag.plan.titulo,
      saldo_inicial: st.saldoIni,
    };
    window.guardarLocal();
    enviarCRM(EVENTOS.FINAL_DIAGNOSIS_GENERATED, st.diag);
    st.step = 3;
    st.tab  = "situacion";
    track(EVENTOS.PLAN_VIEWED, { plan: st.diag.planId, nivel: st.diag.nivelR });
    window.CredizonaUI.renderAll();
  }
}

function prev() {
  var st = window.CZState;
  if (st.step > 0 && st.step < 3) { st.step--; window.CredizonaUI.renderAll(); }
}

function saltarGastos() {
  // El usuario puede saltar el paso de gastos
  var st = window.CZState;
  if (st.step !== 2) return;
  track(EVENTOS.EXPENSES_COMPLETED, { saltado: true });
  st.diag     = calcularMotor();
  st.saldoIni = st.deudas.reduce(function(s, d) { return s + (parseFloat(d.monto) || 0); }, 0);
  st.snap     = {
    fecha_inicio:  new Date().toISOString(),
    score_miplan:  st.diag.scoreReset,
    nivel:         st.diag.nivelR,
    plan_titulo:   st.diag.plan.titulo,
    saldo_inicial: st.saldoIni,
  };
  window.guardarLocal();
  enviarCRM(EVENTOS.FINAL_DIAGNOSIS_GENERATED, st.diag);
  st.step = 3;
  st.tab  = "situacion";
  window.CredizonaUI.renderAll();
}

function resetear() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  window.CZState = {
    step: 0, gastos: {}, deudas: [], diag: null, snap: null,
    saldoIni: 0, tab: "situacion", plusEstado: "sin_pago", iaRes: null,
    herr: {
      ingresos:     { formal: 0, extras: [], total: 0 },
      gastos_cls:   {},
      gestiones:    {},
      compromisos:  {},
      semaforo:     {},
      habitos:      {},
      atrasos:      {},
      vencimientos: {},
    },
  };
  document.getElementById("modal-nuevo").classList.add("hidden");
  window.CredizonaUI.renderAll();
}

// =============================================================================
// TABS
// =============================================================================
function switchTab(id) {
  window.CZState.tab = id;
  document.querySelectorAll(".tab-btn").forEach(function(b) {
    b.classList.toggle("active", b.getAttribute("data-tab") === id);
  });
  window.CredizonaUI.renderTab();
  window.guardarLocal();
}

// Exponer saltarGastos para ui.js
window.saltarGastos = saltarGastos;

// =============================================================================
// INIT
// =============================================================================
function init() {
  var sesion = cargarLocal();
  if (sesion && sesion.diag) {
    var st      = window.CZState;
    st.step       = 3;
    st.gastos     = sesion.gastos     || {};
    st.deudas     = sesion.deudas     || [];
    st.diag       = sesion.diag;
    st.snap       = sesion.snap       || null;
    st.saldoIni   = sesion.saldoIni   || 0;
    st.tab        = sesion.tab        || "situacion";
    st.plusEstado = sesion.plusEstado || "sin_pago";
    st.iaRes      = sesion.iaRes      || null;
    if (sesion.herr) st.herr = sesion.herr;
  }

  window.CredizonaUI.renderAll();
  track(EVENTOS.MI_PLAN_STARTED, { segmento: SEGMENTO });

  if (window.CZState.step === 0) {
    track(EVENTOS.MI_PLAN_LANDING_VIEW, { segmento: SEGMENTO });
  }
}

// =============================================================================
// EVENT LISTENERS ESTATICOS
// =============================================================================
document.addEventListener("DOMContentLoaded", function() {

  // Sticky CTA
  document.getElementById("sticky-cta").addEventListener("click", function() {
    var step = window.CZState.step;
    if (step === 3) {
      window.CredizonaUI.abrirModalInformeCompleto();
    } else {
      next();
    }
  });

  // Boton Nuevo (header)
  document.getElementById("btn-nuevo").addEventListener("click", function() {
    document.getElementById("modal-nuevo").classList.remove("hidden");
  });

  // Modal Nuevo — Cancelar
  document.getElementById("btn-cancelar-nuevo").addEventListener("click", function() {
    document.getElementById("modal-nuevo").classList.add("hidden");
  });

  // Modal Nuevo — Confirmar
  document.getElementById("btn-confirmar-nuevo").addEventListener("click", resetear);

  // Delegacion de eventos en main-content
  document.getElementById("main-content").addEventListener("click", function(e) {

    // Tabs
    var tabBtn = e.target.closest(".tab-btn");
    if (tabBtn) {
      var id     = tabBtn.getAttribute("data-tab");
      var locked = tabBtn.classList.contains("locked");
      if (locked) { window.CredizonaUI.abrirModalInformeCompleto(); return; }
      if (id) switchTab(id);
      return;
    }

    // Back buttons
    if (e.target.id === "btn-back-diag")   { window.CZState.step = 0; window.CredizonaUI.renderAll(); return; }
    if (e.target.id === "btn-back-deudas") { prev(); return; }
    if (e.target.id === "btn-saltar-gastos") { saltarGastos(); return; }

    // Agregar deuda
    if (e.target.id === "btn-agregar-deuda") {
      var deudas = window.CZState.deudas;
      deudas.push({ tipo: "", acreedor: "", monto: "", pago: "", estado: "" });
      var cont = document.getElementById("deudas-container");
      if (cont) cont.innerHTML = deudas.map(window.CredizonaUI.renderDeudaCard).join("");
      window.CredizonaUI.actualizarMetrics();
      window.CredizonaUI.bindTabEvents();
      track(EVENTOS.DEBT_ADDED);
      return;
    }

    // Informe completo desde cualquier boton con data-abrir-informe
    if (e.target.closest("[data-abrir-informe]")) {
      track(EVENTOS.COMPLETE_REPORT_INTEREST);
      window.CredizonaUI.abrirModalInformeCompleto();
      return;
    }

    // Entender que me frena
    if (e.target.id === "btn-entender-bloqueo") {
      track(EVENTOS.UNDERSTAND_BLOCKER_CLICKED);
      window.CZState.step = 1;
      window.CredizonaUI.renderAll();
      return;
    }
  });

  init();
});
