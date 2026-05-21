/**
 * SISTEMA DE UPSELL - Credizona Mi Plan
 * Triggers contextuales para Reset Plus
 */

const UpsellSystem = {
  // Configuracion de triggers
  triggers: {
    post_diagnostico: {
      id: 'post_diagnostico',
      title: 'Desbloquea tu informe completo',
      text: 'Tu diagnostico basico esta listo. Con Reset Plus obtenes analisis con IA y recomendaciones personalizadas.',
      priority: 'high'
    },
    deuda_cara: {
      id: 'deuda_cara',
      title: 'Detectamos deuda cara',
      text: 'Tenes deudas con intereses altos. Reset Plus te ayuda a crear un plan para pagarlas mas rapido.',
      priority: 'high'
    },
    tools_3: {
      id: 'tools_3',
      title: 'Vas muy bien!',
      text: 'Ya usaste varias herramientas. Con Reset Plus aceleras tu recuperacion financiera.',
      priority: 'medium'
    },
    score_bajo: {
      id: 'score_bajo',
      title: 'Tu situacion necesita atencion',
      text: 'Tu score indica que necesitas un plan mas completo. Un asesor puede ayudarte.',
      priority: 'high'
    },
    abandono: {
      id: 'abandono',
      title: 'No te vayas todavia',
      text: 'Completa tu diagnostico y descubre como mejorar tu situacion financiera.',
      priority: 'low'
    }
  },
  
  // Estado
  shown: {},
  dismissed: {},
  
  // Inicializar
  init() {
    this.loadState();
  },
  
  // Cargar estado
  loadState() {
    try {
      const dismissed = localStorage.getItem('credizona_upsell_dismissed');
      this.dismissed = dismissed ? JSON.parse(dismissed) : {};
    } catch (e) {
      this.dismissed = {};
    }
  },
  
  // Guardar estado
  saveState() {
    try {
      localStorage.setItem('credizona_upsell_dismissed', JSON.stringify(this.dismissed));
    } catch (e) {
      // Silently fail
    }
  },
  
  // Verificar si debe mostrar trigger
  shouldShow(triggerId) {
    // No mostrar si ya fue dismisseado en esta sesion
    if (this.dismissed[triggerId]) return false;
    
    // No mostrar si ya se mostro en esta sesion
    if (this.shown[triggerId]) return false;
    
    return true;
  },
  
  // Mostrar banner de upsell
  showBanner(triggerId, options = {}) {
    if (!this.shouldShow(triggerId)) return;
    
    const trigger = this.triggers[triggerId];
    if (!trigger) return;
    
    this.shown[triggerId] = true;
    
    // Track para WhatsApp queue
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('upsell_shown', { triggerId });
    }
    
    const containerId = options.containerId || 'upsell-banner-container';
    let container = document.getElementById(containerId);
    
    // Si no existe el container, buscar donde insertar
    if (!container && options.insertAfter) {
      const insertAfterEl = document.querySelector(options.insertAfter);
      if (insertAfterEl) {
        container = document.createElement('div');
        container.id = containerId;
        insertAfterEl.parentNode.insertBefore(container, insertAfterEl.nextSibling);
      }
    }
    
    if (!container) return;
    
    container.innerHTML = this.renderBanner(trigger, triggerId);
  },
  
  // Renderizar banner
  renderBanner(trigger, triggerId) {
    return `
      <div class="upsell-banner fade" id="upsell-banner-${triggerId}">
        <div class="upsell-banner-header">
          <span class="upsell-banner-icon">💡</span>
          <span class="upsell-banner-title">${trigger.title}</span>
        </div>
        <p class="upsell-banner-text">${trigger.text}</p>
        <div class="upsell-banner-actions">
          <button class="btn btn-primary" onclick="UpsellSystem.convert('${triggerId}')">
            Quiero Reset Plus
          </button>
          <button class="upsell-dismiss" onclick="UpsellSystem.dismiss('${triggerId}')">
            Seguir con plan gratuito
          </button>
        </div>
      </div>
    `;
  },
  
  // Renderizar card premium completa (para modal o seccion)
  renderPremiumCard(context = {}) {
    const hasReferralDiscount = context.referralDiscount || false;
    const originalPrice = 990;
    const discountedPrice = hasReferralDiscount ? Math.round(originalPrice * 0.9) : originalPrice;
    
    return `
      <div class="premium-card">
        <div class="premium-badge">Reset Plus</div>
        <h3 class="premium-title">Tu plan personalizado completo</h3>
        <p class="premium-text">Accede a herramientas avanzadas para mejorar tu situacion financiera mas rapido.</p>
        
        <ul class="premium-benefits">
          <li>Informe de clearing detallado</li>
          <li>Analisis con inteligencia artificial</li>
          <li>Plan de accion personalizado en PDF</li>
          <li>Simulador de pagos de deuda</li>
          <li>Asesoramiento por WhatsApp</li>
        </ul>
        
        ${hasReferralDiscount ? `
          <div class="savings-badge">10% de descuento por referido</div>
        ` : ''}
        
        <div style="margin-bottom:16px;">
          ${hasReferralDiscount ? `
            <span style="text-decoration:line-through;color:var(--color-text-secondary);font-size:14px;">$${originalPrice}</span>
          ` : ''}
          <span style="font-size:28px;font-weight:900;color:var(--color-primary);">$${discountedPrice}</span>
          <span style="color:var(--color-text-secondary);font-size:14px;">pago unico</span>
        </div>
        
        <button class="btn btn-primary" onclick="UpsellSystem.purchase()">
          Obtener Reset Plus
        </button>
        
        <p style="margin-top:12px;font-size:13px;color:var(--color-text-secondary);text-align:center;">
          Pago seguro. Satisfaccion garantizada.
        </p>
      </div>
    `;
  },
  
  // Conversion - usuario quiere comprar
  convert(triggerId) {
    // Track conversion
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('upsell_convert_click', { triggerId });
    }
    
    // Mostrar modal de compra
    this.showPurchaseModal();
  },
  
  // Dismiss - usuario no quiere
  dismiss(triggerId) {
    this.dismissed[triggerId] = true;
    this.saveState();
    
    // Track dismiss
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('upsell_dismissed', { triggerId });
      
      // Si dismiss post_diagnostico, agendar follow-up
      if (triggerId === 'post_diagnostico') {
        WhatsAppQueue.scheduleFollowUp('completed_no_purchase');
      }
    }
    
    // Ocultar banner
    const banner = document.getElementById(`upsell-banner-${triggerId}`);
    if (banner) {
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 300);
    }
  },
  
  // Mostrar modal de compra
  showPurchaseModal() {
    const modal = document.getElementById('modal-premium');
    const content = document.getElementById('modal-premium-content');
    
    if (modal && content) {
      const hasReferralDiscount = typeof ReferralSystem !== 'undefined' && 
                                   ReferralSystem.wasReferred();
      
      content.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;margin-bottom:12px;">🚀</div>
          <h2 style="font-size:24px;font-weight:800;margin-bottom:8px;">Mejora tu plan</h2>
          <p style="color:var(--color-text-secondary);">Elige la opcion que mejor se adapte a vos</p>
        </div>
        
        <div class="pricing-grid">
          <div class="pricing-card" onclick="UpsellSystem.selectPlan('basic')">
            <div class="price-amount">$590</div>
            <div class="price-label">Informe basico</div>
            <div class="price-desc">Clearing + recomendaciones</div>
          </div>
          
          <div class="pricing-card featured" onclick="UpsellSystem.selectPlan('plus')">
            <div class="pricing-top-badge">Recomendado</div>
            <div class="price-amount">${hasReferralDiscount ? '$891' : '$990'}</div>
            <div class="price-label">Reset Plus</div>
            <div class="price-desc">Todo incluido + asesor</div>
          </div>
        </div>
        
        ${hasReferralDiscount ? `
          <div style="text-align:center;margin-bottom:16px;">
            <span class="savings-badge">Descuento de referido aplicado</span>
          </div>
        ` : ''}
        
        <button class="btn btn-secondary" onclick="cerrarModal('modal-premium')">
          Seguir con plan gratuito
        </button>
      `;
      
      modal.classList.remove('hidden');
    }
  },
  
  // Seleccionar plan
  selectPlan(plan) {
    // Track
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('plan_selected', { plan });
    }
    
    // Redirigir a checkout o mostrar formulario de pago
    // Aqui iria la integracion con tu sistema de pagos
    alert('Redirigiendo a checkout para: ' + plan);
    
    // Por ahora, simular compra exitosa
    // this.completePurchase(plan);
  },
  
  // Completar compra
  completePurchase(plan) {
    try {
      localStorage.setItem('credizona_premium', JSON.stringify({
        plan,
        purchasedAt: new Date().toISOString()
      }));
    } catch (e) {
      // Silently fail
    }
    
    // Track
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('purchase_complete', { plan });
    }
    
    // Cerrar modal y mostrar contenido premium
    cerrarModal('modal-premium');
  },
  
  // Verificar si usuario es premium
  isPremium() {
    try {
      return !!localStorage.getItem('credizona_premium');
    } catch (e) {
      return false;
    }
  },
  
  // Trigger: Despues del diagnostico
  triggerPostDiagnostico() {
    if (this.isPremium()) return;
    
    setTimeout(() => {
      this.showBanner('post_diagnostico', {
        insertAfter: '.score-display'
      });
    }, 1500);
  },
  
  // Trigger: Deuda cara detectada
  triggerDeudaCara() {
    if (this.isPremium()) return;
    this.showBanner('deuda_cara', {
      insertAfter: '.debt-card:last-child'
    });
  },
  
  // Trigger: 3+ herramientas usadas
  triggerTools3() {
    if (this.isPremium()) return;
    this.showBanner('tools_3', {
      insertAfter: '.tool-card:nth-child(3)'
    });
  },
  
  // Trigger: Score bajo
  triggerScoreBajo(score) {
    if (this.isPremium()) return;
    if (score >= 40) return;
    
    this.showBanner('score_bajo', {
      insertAfter: '.score-display'
    });
  },
  
  // Reset para testing
  reset() {
    this.shown = {};
    this.dismissed = {};
    localStorage.removeItem('credizona_upsell_dismissed');
    localStorage.removeItem('credizona_premium');
  }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  UpsellSystem.init();
});
