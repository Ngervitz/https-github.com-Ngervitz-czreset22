/**
 * COLA DE WHATSAPP - Credizona Mi Plan
 * Preparacion de datos para follow-up automatico
 * 
 * Este modulo recolecta datos y los prepara para que el backend
 * pueda enviar mensajes de WhatsApp en los momentos adecuados.
 */

const WhatsAppQueue = {
  // Configuracion de triggers
  triggerTypes: {
    abandoned_funnel: {
      id: 'abandoned_funnel',
      priority: 'high',
      delayHours: 2,
      template: 'ABANDONO_FUNNEL',
      message: 'Hola {nombre}! Vimos que empezaste tu diagnostico financiero pero no lo terminaste. Solo te faltan unos minutos para conocer tu situacion. Continua aqui: {link}'
    },
    completed_no_purchase: {
      id: 'completed_no_purchase',
      priority: 'medium',
      delayHours: 24,
      template: 'COMPLETO_SIN_COMPRA',
      message: 'Hola {nombre}! Ya tenes tu diagnostico listo. Con Reset Plus podes acceder a herramientas avanzadas para mejorar tu situacion mas rapido. 20% de descuento solo hoy: {link}'
    },
    high_score_inactive: {
      id: 'high_score_inactive',
      priority: 'low',
      delayHours: 72,
      template: 'SCORE_ALTO_INACTIVO',
      message: 'Hola {nombre}! Tu score de salud financiera es {score}. Estas muy cerca de mejorar tu situacion. Queres que te ayudemos? Responde este mensaje.'
    },
    debt_reminder: {
      id: 'debt_reminder',
      priority: 'medium',
      delayHours: 168, // 7 dias
      template: 'RECORDATORIO_DEUDA',
      message: 'Hola {nombre}! Recordatorio: tenes {deudaTotal} en deudas registradas. Revisa tu plan y mantente en control: {link}'
    }
  },
  
  // Cola de mensajes pendientes
  queue: [],
  
  // Eventos trackeados
  events: [],
  
  // Datos del usuario
  userData: {},
  
  // Inicializar
  init() {
    this.loadState();
    this.setupVisibilityTracking();
    this.setupExitIntent();
  },
  
  // Cargar estado
  loadState() {
    try {
      const queueData = localStorage.getItem('credizona_wa_queue');
      const eventsData = localStorage.getItem('credizona_wa_events');
      const userData = localStorage.getItem('credizona_wa_userdata');
      
      this.queue = queueData ? JSON.parse(queueData) : [];
      this.events = eventsData ? JSON.parse(eventsData) : [];
      this.userData = userData ? JSON.parse(userData) : {};
    } catch (e) {
      this.queue = [];
      this.events = [];
      this.userData = {};
    }
  },
  
  // Guardar estado
  saveState() {
    try {
      localStorage.setItem('credizona_wa_queue', JSON.stringify(this.queue.slice(-100)));
      localStorage.setItem('credizona_wa_events', JSON.stringify(this.events.slice(-200)));
      localStorage.setItem('credizona_wa_userdata', JSON.stringify(this.userData));
    } catch (e) {
      // Silently fail
    }
  },
  
  // Actualizar datos del usuario
  updateUserData(data) {
    this.userData = { ...this.userData, ...data, updatedAt: new Date().toISOString() };
    this.saveState();
  },
  
  // Trackear evento
  trackEvent(eventName, data = {}) {
    const event = {
      event: eventName,
      data,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId()
    };
    
    this.events.push(event);
    this.saveState();
    
    // Verificar triggers automaticos
    this.checkAutoTriggers(eventName, data);
  },
  
  // Obtener ID de sesion
  getSessionId() {
    let sessionId = sessionStorage.getItem('credizona_session');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('credizona_session', sessionId);
    }
    return sessionId;
  },
  
  // Programar follow-up
  scheduleFollowUp(triggerType, customData = {}) {
    const trigger = this.triggerTypes[triggerType];
    if (!trigger) return;
    
    // Verificar si ya hay uno programado del mismo tipo
    const existing = this.queue.find(q => q.triggerType === triggerType && q.status === 'pending');
    if (existing) return;
    
    const queueItem = {
      id: 'wa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      triggerType,
      priority: trigger.priority,
      template: trigger.template,
      scheduledFor: new Date(Date.now() + trigger.delayHours * 60 * 60 * 1000).toISOString(),
      userData: { ...this.userData, ...customData },
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    this.queue.push(queueItem);
    this.saveState();
    
    // Sincronizar con backend
    this.syncToBackend();
  },
  
  // Cancelar follow-up programado
  cancelFollowUp(triggerType) {
    this.queue = this.queue.map(item => {
      if (item.triggerType === triggerType && item.status === 'pending') {
        return { ...item, status: 'cancelled', cancelledAt: new Date().toISOString() };
      }
      return item;
    });
    this.saveState();
  },
  
  // Verificar triggers automaticos
  checkAutoTriggers(eventName, data) {
    switch (eventName) {
      case 'diagnostico_complete':
        // Si completa diagnostico pero no compra, programar follow-up
        if (!this.isPremium()) {
          this.scheduleFollowUp('completed_no_purchase');
        }
        // Cancelar abandono si estaba programado
        this.cancelFollowUp('abandoned_funnel');
        break;
        
      case 'purchase_complete':
        // Cancelar todos los follow-ups de venta
        this.cancelFollowUp('completed_no_purchase');
        this.cancelFollowUp('abandoned_funnel');
        break;
        
      case 'funnel_step_complete':
        // Actualizar progreso y cancelar abandono
        this.cancelFollowUp('abandoned_funnel');
        break;
    }
  },
  
  // Setup tracking de visibilidad (detectar abandono)
  setupVisibilityTracking() {
    let hiddenTime = null;
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenTime = Date.now();
      } else {
        // Usuario volvio
        if (hiddenTime && (Date.now() - hiddenTime > 60000)) {
          // Estuvo ausente mas de 1 minuto
          this.trackEvent('user_returned', { 
            absentMinutes: Math.round((Date.now() - hiddenTime) / 60000) 
          });
        }
        hiddenTime = null;
      }
    });
  },
  
  // Setup exit intent (detectar intencion de salir)
  setupExitIntent() {
    let exitIntentShown = false;
    
    document.addEventListener('mouseout', (e) => {
      if (exitIntentShown) return;
      
      // Detectar si el mouse sale por arriba (hacia la barra de navegacion)
      if (e.clientY < 10 && e.relatedTarget == null) {
        const funnelStep = this.userData.currentStep || 0;
        
        // Solo mostrar si esta en medio del funnel
        if (funnelStep > 0 && funnelStep < 4) {
          exitIntentShown = true;
          this.trackEvent('exit_intent_detected', { funnelStep });
          
          // Programar follow-up de abandono
          if (!this.isPremium()) {
            this.scheduleFollowUp('abandoned_funnel');
          }
        }
      }
    });
  },
  
  // Verificar si es premium
  isPremium() {
    try {
      return !!localStorage.getItem('credizona_premium');
    } catch (e) {
      return false;
    }
  },
  
  // Preparar payload para backend
  prepareBackendPayload() {
    return {
      queue: this.queue.filter(q => q.status === 'pending'),
      events: this.events.slice(-50), // Ultimos 50 eventos
      userData: this.userData,
      syncedAt: new Date().toISOString()
    };
  },
  
  // Sincronizar con backend
  syncToBackend() {
    const payload = this.prepareBackendPayload();
    
    // Guardar para que el backend pueda recuperar
    try {
      localStorage.setItem('credizona_wa_sync', JSON.stringify(payload));
    } catch (e) {
      // Silently fail
    }
    
    // Aqui iria la llamada real al backend
    // Ejemplo:
    // fetch('/api/whatsapp-queue', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload)
    // });
  },
  
  // Obtener resumen para debugging/admin
  getSummary() {
    return {
      pendingMessages: this.queue.filter(q => q.status === 'pending').length,
      totalEvents: this.events.length,
      lastEvent: this.events[this.events.length - 1],
      userData: this.userData
    };
  },
  
  // Obtener cola pendiente para envio manual
  getPendingQueue() {
    return this.queue
      .filter(q => q.status === 'pending')
      .map(q => {
        const trigger = this.triggerTypes[q.triggerType];
        return {
          ...q,
          phone: q.userData.telefono || q.userData.phone,
          message: this.interpolateMessage(trigger.message, q.userData)
        };
      });
  },
  
  // Interpolar variables en mensaje
  interpolateMessage(template, data) {
    return template
      .replace('{nombre}', data.nombre || 'amigo')
      .replace('{score}', data.score || '?')
      .replace('{deudaTotal}', this.formatMoney(data.deudaTotal || 0))
      .replace('{link}', window.location.origin + window.location.pathname);
  },
  
  // Formatear dinero
  formatMoney(amount) {
    return '$' + Math.round(amount).toLocaleString('es-UY');
  },
  
  // Marcar mensaje como enviado (llamar desde backend)
  markAsSent(queueId) {
    this.queue = this.queue.map(item => {
      if (item.id === queueId) {
        return { ...item, status: 'sent', sentAt: new Date().toISOString() };
      }
      return item;
    });
    this.saveState();
  },
  
  // Reset para testing
  reset() {
    this.queue = [];
    this.events = [];
    this.userData = {};
    localStorage.removeItem('credizona_wa_queue');
    localStorage.removeItem('credizona_wa_events');
    localStorage.removeItem('credizona_wa_userdata');
    localStorage.removeItem('credizona_wa_sync');
  }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  WhatsAppQueue.init();
});
