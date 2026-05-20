// =============================================================================
// events.js — Tracking y nombres de eventos
// Depende de: config.js
// TODO IT: reemplazar console.log por llamada real a analytics/CRM
// =============================================================================

// Catalogo de eventos validos
var EVENTOS = {
  // Encuesta
  SURVEY_STARTED:              "survey_started",
  SURVEY_COMPLETED:            "survey_completed",
  SURVEY_ABANDONED:            "survey_abandoned",

  // Mi Plan — flujo
  MI_PLAN_LANDING_VIEW:        "mi_plan_landing_view",
  INITIAL_DIAGNOSIS_VIEWED:    "initial_diagnosis_viewed",
  UNDERSTAND_BLOCKER_CLICKED:  "understand_blocker_clicked",
  DEBT_STARTED:                "debt_started",
  FIRST_DEBT_ADDED:            "first_debt_added",
  DEBT_ADDED:                  "debt_added",
  DEBT_REMOVED:                "debt_removed",
  EXPENSES_STARTED:            "expenses_started",
  EXPENSES_COMPLETED:          "expenses_completed",
  FINAL_DIAGNOSIS_GENERATED:   "final_diagnosis_generated",
  PLAN_VIEWED:                 "plan_viewed",
  SIMULATOR_USED:              "simulator_used",
  PROGRESS_UPDATED:            "progress_updated",

  // Herramientas
  INGRESO_REAL_DECLARADO:      "ingreso_real_declarado",
  GASTO_CLASIFICADO:           "gasto_clasificado",
  DEUDA_GESTION:               "deuda_gestion",
  COMPROMISOS_ACTUALIZADOS:    "compromisos_actualizados",
  SEMAFORO_ACTUALIZADO:        "semaforo_actualizado",
  HABITO_MARCADO:              "habito_marcado",
  VENCIMIENTO_CARGADO:         "vencimiento_cargado",
  ATRASO_ACTUALIZADO:          "atraso_actualizado",

  // Informe Completo (antes "Reset Plus")
  COMPLETE_REPORT_INTEREST:           "complete_report_interest",
  COMPLETE_REPORT_CHECKOUT_STARTED:   "complete_report_checkout_started",
  COMPLETE_REPORT_PURCHASED:          "complete_report_purchased",
  COMPLETE_REPORT_CHECKOUT_ABANDONED: "complete_report_checkout_abandoned",

  // Informes
  REPORT_EMAIL_SENT:     "report_email_sent",
  REPORT_DOWNLOADED:     "report_downloaded",
  REPORT_PRINTED:        "report_printed",

  // Comercial
  DEBT_HELP_INTEREST:       "debt_help_interest",
  CONSOLIDATION_CANDIDATE:  "consolidation_candidate",
  REFINANCING_CANDIDATE:    "refinancing_candidate",

  // Session
  MI_PLAN_STARTED:          "mi_plan_started",
  PROFILE_UPDATED:          "profile_updated",
};

function track(evento, datos) {
  datos = datos || {};
  console.log("[MI PLAN]", evento, datos);
  // TODO IT: descomentar y conectar a analytics/CRM real
  // analytics.track(evento, datos);
}
