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
// NAVEGACION
// =============================================================================
function next() {
  var st = window.CZState;

  // Step 0: diagnostico inicial (solo seg 1) → ir a deudas
  if (st.step === 0 && SEGMENTO === 1) {
    st.step = 1;
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.DEBT_STARTED : "debt_started");
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
      track(typeof EVENTOS !== 'undefined' ? EVENTOS.FIRST_DEBT_ADDED : "first_debt_added", { acreedor: st.deudas[0].acreedor });
    }
    st.step = 2;
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.EXPENSES_STARTED : "expenses_started");
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
    enviarCRM(typeof EVENTOS !== 'undefined' ? EVENTOS.FINAL_DIAGNOSIS_GENERATED : "final_diagnosis_generated", st.diag);
    st.step = 3;
    st.tab  = "situacion";
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.PLAN_VIEWED : "plan_viewed", { plan: st.diag.planId, nivel: st.diag.nivelR });
    window.CredizonaUI.renderAll();
  }
}

function prev() {
  var st = window.CZState;
  if (st.step > 0 && st.step < 3) { st.step--; window.CredizonaUI.renderAll(); }
}

function saltarGastos() {
  var st = window.CZState;
  if (st.step !== 2) return;
  track(typeof EVENTOS !== 'undefined' ? EVENTOS.EXPENSES_COMPLETED : "expenses_completed", { saltado: true });
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
  enviarCRM(typeof EVENTOS !== 'undefined' ? EVENTOS.FINAL_DIAGNOSIS_GENERATED : "final_diagnosis_generated", st.diag);
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
  var modalNuevo = document.getElementById("modal-nuevo");
  if (modalNuevo) modalNuevo.classList.add("hidden");
  window.CredizonaUI.renderAll();
}

function switchTab(id) {
  window.CZState.tab = id;
  document.querySelectorAll(".tab-btn").forEach(function(b) {
    b.classList.toggle("active", b.getAttribute("data-tab") === id);
  });
  window.CredizonaUI.renderTab();
  window.guardarLocal();
}

// Exponer métodos globalmente
window.saltarGastos = saltarGastos;
window.next = next;
window.prev = prev;

// =============================================================================
// INIT
// =============================================================================
function init() {
  var viejos = ["cr_v3", "credizona_reset", "cz_reset"];
  vexport = viejos.forEach(function(k) { try { localStorage.removeItem(k); } catch(e) {} });

  var sesion = cargarLocal();
  if (sesion && sesion.deudas && sesion.deudas.length > 0) {
    var st      = window.CZState;
    st.gastos      = sesion.gastos      || {};
    st.deudas      = sesion.deudas      || [];
    st.snap       = sesion.snap       || null;
    st.saldoIni   = sesion.saldoIni   || 0;
    st.tab        = sesion.tab        || "situacion";
    st.plusEstado = sesion.plusEstado || "sin_pago";
    st.iaRes      = sesion.iaRes      || null;
    if (sesion.herr) st.herr = sesion.herr;

    st.diag = calcularMotor();
    st.step = 3;
  }

  window.CredizonaUI.renderAll();
  track(typeof EVENTOS !== 'undefined' ? EVENTOS.MI_PLAN_STARTED : "mi_plan_started", { segmento: SEGMENTO });

  if (window.CZState.step === 0) {
    track(typeof EVENTOS !== 'undefined' ? EVENTOS.MI_PLAN_LANDING_VIEW : "mi_plan_landing_view", { segmento: SEGMENTO });
  }
}

// =============================================================================
// EVENT LISTENERS ESTATICOS
// =============================================================================
document.addEventListener("DOMContentLoaded", function() {

  // Sticky CTA
  var stickyCta = document.getElementById("sticky-cta");
  if (stickyCta) {
    stickyCta.addEventListener("click", function() {
      if (window.CZState.step === 3) {
        window.CredizonaUI.abrirModalPremium();
      } else {
        next();
      }
    });
  }

  // Boton Nuevo (header)
  var btnNuevo = document.getElementById("btn-nuevo");
  if (btnNuevo) {
    btnNuevo.addEventListener("click", function() {
      var modalNuevo = document.getElementById("modal-nuevo");
      if (modalNuevo) modalNuevo.classList.remove("hidden");
    });
  }

  // Delegación de clics en modales mediante ID o clases de acción
  document.body.addEventListener("click", function(e) {
    if (e.target.id === "btn-cancelar-reset" || e.target.id === "btn-cancelar-nuevo") {
      var modalNuevo = document.getElementById("modal-nuevo");
      if (modalNuevo) modalNuevo.classList.add("hidden");
    }
    if (e.target.id === "btn-confirmar-reset" || e.target.id === "btn-confirmar-nuevo") {
      resetear();
    }
  });

  // Delegacion de eventos en main-content
  var mainContent = document.getElementById("main-content");
  if (mainContent) {
    mainContent.addEventListener("click", function(e) {
      // Tabs
      var tabBtn = e.target.closest(".tab-btn");
      if (tabBtn) {
        var id     = tabBtn.getAttribute("data-tab");
        var locked = tabBtn.classList.contains("locked");
        if (locked) { window.CredizonaUI.abrirModalPremium(); return; }
        if (id) switchTab(id);
        return;
      }

      // Botones de navegación internos
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
        track(typeof EVENTOS !== 'undefined' ? EVENTOS.DEBT_ADDED : "debt_added");
        return;
      }

      // Ver evaluacion inicial en step 0
      if (e.target.id === "btn-ver-evaluacion") {
        window.CredizonaUI.mostrarEvaluacion();
        return;
      }
      if (e.target.id === "btn-analisis-profundo" || e.target.id === "btn-ver-plan-personalizado") {
        st.step = 1;
        window.CredizonaUI.renderAll();
        return;
      }

      // Informe completo (Reset Plus) desde cualquier boton con data-abrir-informe o id similar
      if (e.target.closest("[data-abrir-informe]") || e.target.id === "btn-conocer-plus" || e.target.id === "btn-conocer-plus-ia" || e.target.id === "btn-conocer-plus-tab") {
        track(typeof EVENTOS !== 'undefined' ? EVENTOS.COMPLETE_REPORT_INTEREST : "complete_report_interest");
        window.CredizonaUI.abrirModalPremium();
        return;
      }

      // Entender que me frena
      if (e.target.id === "btn-entender-bloqueo") {
        track(typeof EVENTOS !== 'undefined' ? EVENTOS.UNDERSTAND_BLOCKER_CLICKED : "understand_blocker_clicked");
        window.CZState.step = 1;
        window.CredizonaUI.renderAll();
        return;
      }
    });
  }

  // Inicialización
  init();
});
