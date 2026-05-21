/**
 * SISTEMA DE BADGES - Credizona Mi Plan
 * Gamificacion basica con 6 badges desbloqueables
 */

const BadgeSystem = {
  // Definicion de badges
  badges: [
    {
      id: 'primer_paso',
      icon: '🎯',
      name: 'Primer Paso',
      description: 'Completaste tus datos personales',
      condition: 'personal_complete'
    },
    {
      id: 'claridad',
      icon: '📊',
      name: 'Claridad',
      description: 'Registraste todos tus gastos',
      condition: 'gastos_complete'
    },
    {
      id: 'valiente',
      icon: '💪',
      name: 'Valiente',
      description: 'Enfrentaste tu primera deuda',
      condition: 'primera_deuda'
    },
    {
      id: 'diagnosticado',
      icon: '⭐',
      name: 'Diagnosticado',
      description: 'Completaste tu diagnostico',
      condition: 'diagnostico_complete'
    },
    {
      id: 'comprometido',
      icon: '🏆',
      name: 'Comprometido',
      description: 'Usaste 3 o mas herramientas',
      condition: 'tools_3'
    },
    {
      id: 'constante',
      icon: '🔥',
      name: 'Constante',
      description: 'Volviste 3 dias seguidos',
      condition: 'streak_3'
    }
  ],
  
  // Estado de badges del usuario
  userBadges: [],
  
  // Inicializar sistema
  init() {
    this.loadBadges();
    this.checkStreak();
    this.renderHeaderBadges();
  },
  
  // Cargar badges guardados
  loadBadges() {
    try {
      const saved = localStorage.getItem('credizona_badges');
      this.userBadges = saved ? JSON.parse(saved) : [];
    } catch (e) {
      this.userBadges = [];
    }
  },
  
  // Guardar badges
  saveBadges() {
    try {
      localStorage.setItem('credizona_badges', JSON.stringify(this.userBadges));
    } catch (e) {
      console.warn('No se pudieron guardar los badges');
    }
  },
  
  // Verificar si un badge esta desbloqueado
  hasBadge(badgeId) {
    return this.userBadges.includes(badgeId);
  },
  
  // Desbloquear un badge
  unlock(badgeId) {
    if (this.hasBadge(badgeId)) return false;
    
    const badge = this.badges.find(b => b.id === badgeId);
    if (!badge) return false;
    
    this.userBadges.push(badgeId);
    this.saveBadges();
    this.renderHeaderBadges();
    this.celebrate(badge);
    
    // Notificar al sistema de progreso
    ProgressSystem.update();
    
    // Queue para WhatsApp si corresponde
    if (typeof WhatsAppQueue !== 'undefined') {
      WhatsAppQueue.trackEvent('badge_unlocked', { badgeId, badgeName: badge.name });
    }
    
    return true;
  },
  
  // Verificar condiciones y desbloquear automaticamente
  checkAndUnlock(condition) {
    const badge = this.badges.find(b => b.condition === condition);
    if (badge && !this.hasBadge(badge.id)) {
      this.unlock(badge.id);
    }
  },
  
  // Celebrar desbloqueo
  celebrate(badge) {
    const modal = document.getElementById('modal-badge');
    const icon = document.getElementById('badge-celebration-icon');
    const title = document.getElementById('badge-celebration-title');
    const text = document.getElementById('badge-celebration-text');
    
    if (modal && icon && title && text) {
      icon.textContent = badge.icon;
      title.textContent = 'Nuevo logro: ' + badge.name;
      text.textContent = badge.description;
      modal.classList.remove('hidden');
      
      // Auto-cerrar despues de 3 segundos
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 3000);
    }
  },
  
  // Renderizar badges en header
  renderHeaderBadges() {
    const container = document.getElementById('header-badges');
    if (!container) return;
    
    // Solo mostrar primeros 4 badges en header
    const displayBadges = this.badges.slice(0, 4);
    
    container.innerHTML = displayBadges.map(badge => {
      const unlocked = this.hasBadge(badge.id);
      return `
        <div class="header-badge ${unlocked ? 'unlocked' : ''}" title="${badge.name}">
          ${badge.icon}
        </div>
      `;
    }).join('');
  },
  
  // Renderizar seccion completa de badges
  renderBadgesSection() {
    return `
      <div class="badges-section">
        <div class="badges-title">Tus logros (${this.userBadges.length}/${this.badges.length})</div>
        <div class="badges-grid">
          ${this.badges.map(badge => {
            const unlocked = this.hasBadge(badge.id);
            return `
              <div class="badge-item ${unlocked ? 'unlocked' : ''}">
                ${badge.icon}
                <div class="badge-tooltip">${badge.name}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },
  
  // Verificar streak de dias
  checkStreak() {
    try {
      const lastVisit = localStorage.getItem('credizona_last_visit');
      const streak = parseInt(localStorage.getItem('credizona_streak') || '0');
      const today = new Date().toDateString();
      
      if (lastVisit !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastVisit === yesterday.toDateString()) {
          // Visita consecutiva
          const newStreak = streak + 1;
          localStorage.setItem('credizona_streak', newStreak.toString());
          
          if (newStreak >= 3) {
            this.checkAndUnlock('streak_3');
          }
        } else {
          // Resetear streak
          localStorage.setItem('credizona_streak', '1');
        }
        
        localStorage.setItem('credizona_last_visit', today);
      }
    } catch (e) {
      // Silently fail
    }
  },
  
  // Obtener conteo de badges
  getCount() {
    return {
      unlocked: this.userBadges.length,
      total: this.badges.length
    };
  },
  
  // Reset para testing
  reset() {
    this.userBadges = [];
    localStorage.removeItem('credizona_badges');
    localStorage.removeItem('credizona_streak');
    localStorage.removeItem('credizona_last_visit');
    this.renderHeaderBadges();
  }
};

/**
 * SISTEMA DE PROGRESO
 * Barra de progreso general con mensajes motivacionales
 */
const ProgressSystem = {
  // Componentes del progreso
  milestones: [
    { id: 'personal', weight: 15, label: 'Datos personales' },
    { id: 'gastos', weight: 20, label: 'Gastos registrados' },
    { id: 'deudas', weight: 20, label: 'Deudas registradas' },
    { id: 'diagnostico', weight: 25, label: 'Diagnostico completo' },
    { id: 'plan', weight: 20, label: 'Plan revisado' }
  ],
  
  // Mensajes motivacionales segun progreso
  messages: [
    { min: 0, max: 15, text: 'Comienza tu diagnostico' },
    { min: 16, max: 35, text: 'Vas muy bien, sigue asi' },
    { min: 36, max: 55, text: 'Ya casi llegas a la mitad' },
    { min: 56, max: 75, text: 'Excelente progreso' },
    { min: 76, max: 95, text: 'Solo falta un poco mas' },
    { min: 96, max: 100, text: 'Completaste tu diagnostico!' }
  ],
  
  // Estado completado
  completed: {},
  
  // Inicializar
  init() {
    this.loadProgress();
  },
  
  // Cargar progreso guardado
  loadProgress() {
    try {
      const saved = localStorage.getItem('credizona_progress');
      this.completed = saved ? JSON.parse(saved) : {};
    } catch (e) {
      this.completed = {};
    }
  },
  
  // Guardar progreso
  saveProgress() {
    try {
      localStorage.setItem('credizona_progress', JSON.stringify(this.completed));
    } catch (e) {
      // Silently fail
    }
  },
  
  // Marcar milestone como completado
  complete(milestoneId) {
    if (!this.completed[milestoneId]) {
      this.completed[milestoneId] = true;
      this.saveProgress();
      this.update();
    }
  },
  
  // Calcular porcentaje
  getPercent() {
    let total = 0;
    this.milestones.forEach(m => {
      if (this.completed[m.id]) {
        total += m.weight;
      }
    });
    return Math.min(100, total);
  },
  
  // Obtener mensaje actual
  getMessage() {
    const percent = this.getPercent();
    const msg = this.messages.find(m => percent >= m.min && percent <= m.max);
    return msg ? msg.text : this.messages[0].text;
  },
  
  // Actualizar UI
  update() {
    const percent = this.getPercent();
    const message = this.getMessage();
    
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressMessage = document.getElementById('progress-message');
    
    if (progressSection) {
      progressSection.style.display = percent > 0 ? 'block' : 'none';
    }
    
    if (progressBar) {
      progressBar.style.width = percent + '%';
    }
    
    if (progressPercent) {
      progressPercent.textContent = percent + '%';
    }
    
    if (progressMessage) {
      progressMessage.textContent = message;
    }
  },
  
  // Mostrar seccion
  show() {
    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.style.display = 'block';
    }
  },
  
  // Ocultar seccion
  hide() {
    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.style.display = 'none';
    }
  },
  
  // Reset
  reset() {
    this.completed = {};
    localStorage.removeItem('credizona_progress');
    this.update();
  }
};

// Inicializar cuando el DOM este listo
document.addEventListener('DOMContentLoaded', () => {
  BadgeSystem.init();
  ProgressSystem.init();
});
