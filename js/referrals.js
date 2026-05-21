/**
 * SISTEMA DE REFERIDOS - Credizona Mi Plan
 * Codigos unicos con incentivos
 */

const ReferralSystem = {
  // Configuracion de incentivos
  config: {
    referrerDiscount: 20, // 20% para quien refiere
    referredDiscount: 10, // 10% para el referido
    codePrefix: 'REF-',
    codeLength: 6
  },
  
  // Estado del usuario
  userCode: null,
  referredBy: null,
  referralCount: 0,
  
  // Inicializar
  init() {
    this.loadState();
    this.checkURLReferral();
  },
  
  // Cargar estado guardado
  loadState() {
    try {
      const saved = localStorage.getItem('credizona_referral');
      if (saved) {
        const data = JSON.parse(saved);
        this.userCode = data.userCode;
        this.referredBy = data.referredBy;
        this.referralCount = data.referralCount || 0;
      }
    } catch (e) {
      // Silently fail
    }
  },
  
  // Guardar estado
  saveState() {
    try {
      localStorage.setItem('credizona_referral', JSON.stringify({
        userCode: this.userCode,
        referredBy: this.referredBy,
        referralCount: this.referralCount
      }));
    } catch (e) {
      // Silently fail
    }
  },
  
  // Generar codigo unico
  generateCode() {
    if (this.userCode) return this.userCode;
    
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres confusos
    let code = this.config.codePrefix;
    
    for (let i = 0; i < this.config.codeLength; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    this.userCode = code;
    this.saveState();
    
    // Enviar al backend para registrar
    this.syncToBackend('code_generated', { code });
    
    return code;
  },
  
  // Obtener codigo del usuario
  getCode() {
    return this.userCode || this.generateCode();
  },
  
  // Verificar si vino por referido desde URL
  checkURLReferral() {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');
      
      if (refCode && !this.referredBy) {
        this.applyReferral(refCode);
        
        // Limpiar URL
        const url = new URL(window.location);
        url.searchParams.delete('ref');
        window.history.replaceState({}, '', url);
      }
    } catch (e) {
      // Silently fail
    }
  },
  
  // Aplicar codigo de referido
  applyReferral(code) {
    // Validar que no sea su propio codigo
    if (code === this.userCode) return false;
    
    // Ya tiene un referido asignado
    if (this.referredBy) return false;
    
    this.referredBy = code;
    this.saveState();
    
    // Notificar al backend
    this.syncToBackend('referral_applied', { 
      referrerCode: code,
      referredAt: new Date().toISOString()
    });
    
    // Track en WhatsApp queue
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('referral_applied', { referrerCode: code });
    }
    
    return true;
  },
  
  // Verificar si el usuario fue referido
  wasReferred() {
    return !!this.referredBy;
  },
  
  // Obtener descuento aplicable
  getDiscount() {
    if (this.wasReferred()) {
      return this.config.referredDiscount;
    }
    return 0;
  },
  
  // Obtener URL de referido
  getReferralURL() {
    const code = this.getCode();
    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?ref=${code}`;
  },
  
  // Generar mensaje para WhatsApp
  getWhatsAppMessage() {
    const url = this.getReferralURL();
    return encodeURIComponent(
      `Hola! Te recomiendo esta herramienta gratuita para mejorar tu situacion financiera. ` +
      `A mi me ayudo mucho a ordenar mis deudas. ` +
      `Usa mi link y tenes 10% de descuento: ${url}`
    );
  },
  
  // Compartir por WhatsApp
  shareWhatsApp() {
    const message = this.getWhatsAppMessage();
    const whatsappURL = `https://wa.me/?text=${message}`;
    
    // Track
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('referral_shared', { method: 'whatsapp' });
    }
    
    window.open(whatsappURL, '_blank');
  },
  
  // Copiar link al clipboard
  copyLink() {
    const url = this.getReferralURL();
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.showCopyFeedback();
      });
    } else {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.showCopyFeedback();
    }
    
    // Track
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('referral_shared', { method: 'copy' });
    }
  },
  
  // Feedback visual al copiar
  showCopyFeedback() {
    const btn = document.querySelector('.copy-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copiado!';
      btn.style.background = 'var(--color-primary-light)';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
    }
  },
  
  // Renderizar card de referidos
  renderReferralCard() {
    const code = this.getCode();
    
    return `
      <div class="referral-card">
        <div class="referral-icon">🎁</div>
        <h3 class="referral-title">Invita y gana</h3>
        <p class="referral-text">
          Comparte tu codigo con amigos y familiares. 
          Cuando se registren, ambos obtienen descuento.
        </p>
        
        <div class="referral-code-box">
          <span class="referral-code">${code}</span>
          <button class="copy-btn" onclick="ReferralSystem.copyLink()">Copiar link</button>
        </div>
        
        <div class="referral-benefits">
          <div class="referral-benefit">
            <strong>${this.config.referrerDiscount}%</strong>
            <span>Tu descuento</span>
          </div>
          <div class="referral-benefit">
            <strong>${this.config.referredDiscount}%</strong>
            <span>Para tu invitado</span>
          </div>
        </div>
        
        <button class="btn btn-whatsapp" onclick="ReferralSystem.shareWhatsApp()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Compartir por WhatsApp
        </button>
        
        ${this.referralCount > 0 ? `
          <div style="margin-top:16px;text-align:center;font-size:14px;color:var(--color-text-secondary);">
            Ya referiste a <strong style="color:var(--color-primary);">${this.referralCount}</strong> persona${this.referralCount > 1 ? 's' : ''}
          </div>
        ` : ''}
      </div>
    `;
  },
  
  // Renderizar badge si fue referido
  renderReferredBadge() {
    if (!this.wasReferred()) return '';
    
    return `
      <div class="savings-badge" style="margin-bottom:16px;">
        Tenes ${this.config.referredDiscount}% de descuento por referido
      </div>
    `;
  },
  
  // Sincronizar con backend
  syncToBackend(action, data) {
    // Preparar datos para enviar al backend
    const payload = {
      action,
      userCode: this.userCode,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    // Aqui iria la llamada al backend
    // Por ejemplo: fetch('/api/referrals', { method: 'POST', body: JSON.stringify(payload) })
    
    // Por ahora solo guardamos en localStorage para que el backend pueda recuperarlo
    try {
      const queue = JSON.parse(localStorage.getItem('credizona_referral_queue') || '[]');
      queue.push(payload);
      localStorage.setItem('credizona_referral_queue', JSON.stringify(queue.slice(-50))); // Max 50 items
    } catch (e) {
      // Silently fail
    }
  },
  
  // Incrementar contador de referidos (llamar desde backend callback)
  incrementReferralCount() {
    this.referralCount++;
    this.saveState();
  },
  
  // Reset para testing
  reset() {
    this.userCode = null;
    this.referredBy = null;
    this.referralCount = 0;
    localStorage.removeItem('credizona_referral');
    localStorage.removeItem('credizona_referral_queue');
  }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  ReferralSystem.init();
});
