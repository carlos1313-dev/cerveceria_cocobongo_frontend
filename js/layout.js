/* ============================================================
    LAYOUT.JS — Cervecería Cocobongo
    ============================================================ */

const Layout = (() => {

  /* ---- Menú: definición centralizada ---- */
  const NAV_ITEMS = [
    {
      section: 'Principal',
      roles: ['ADMIN', 'EMPLOYEE'],
      items: [
        { label: 'Dashboard',  icon: '▦',  href: 'dashboard.html',  roles: ['ADMIN', 'EMPLOYEE'] },
        { label: 'Ventas',     icon: '🛒', href: 'ventas.html',     roles: ['ADMIN', 'EMPLOYEE'] },
      ]
    },
    {
      section: 'Gestión',
      roles: ['ADMIN'],
      items: [
        { label: 'Inventario', icon: '📦', href: 'inventario.html', roles: ['ADMIN'], badgeId: 'badge-stock' },
        { label: 'Clientes',   icon: '👥', href: 'clientes.html',   roles: ['ADMIN'] },
        { label: 'Gastos',     icon: '💰', href: 'gastos.html',     roles: ['ADMIN'] },
        { label: 'Reportes',   icon: '📈', href: 'reportes.html',   roles: ['ADMIN'] },
      ]
    },
    {
      section: 'Administración',
      roles: ['ADMIN'],
      sep: true,
      items: [
        { label: 'Usuarios',   icon: '⚙',  href: 'usuarios.html',   roles: ['ADMIN'] },
        { label: 'Sucursales', icon: '🏪', href: 'sucursales.html', roles: ['ADMIN'] },
      ]
    }
  ];

  /* ---- Actualizar la info del usuario en la barra superior ---- */
  function renderNavbarUser() {
    const user = Auth.getUser();
    if (!user) return;
    
    const avatarEl = document.getElementById('navbar-avatar');
    const nameEl = document.getElementById('navbar-user-name');
    const roleEl = document.getElementById('navbar-user-role');
    
    if (avatarEl) {
      const name = user.name || user.nombre || 'Usuario';
      const initials = name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      avatarEl.textContent = initials || 'U';
    }
    
    if (nameEl) nameEl.textContent = user.name || user.nombre || 'Usuario';
    if (roleEl) roleEl.textContent = user.role === 'ADMIN' ? 'Administrador' : 'Empleado';
  }

  /* ---- Mostrar modal de perfil (solo lectura) ---- */
  function showProfileModal() {
    const user = Auth.getUser();
    if (!user) return;
    
    // Crear modal dinámicamente
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-profile';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 class="modal-title">Mi perfil</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('open')">✕</button>
        </div>
        <div class="modal-body">
          <div style="text-align:center;margin-bottom:24px">
            <div style="width:80px;height:80px;background:var(--navy);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;color:white;font-size:32px;font-weight:600">
              ${(user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nombre completo</label>
            <input class="form-control" type="text" value="${escapeHtml(user.name || '')}" readonly disabled>
          </div>
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input class="form-control" type="email" value="${escapeHtml(user.email || '')}" readonly disabled>
          </div>
          <div class="form-group">
            <label class="form-label">Rol</label>
            <input class="form-control" type="text" value="${user.role === 'ADMIN' ? 'Administrador' : 'Empleado'}" readonly disabled>
          </div>
          <div class="form-group">
            <label class="form-label">Sucursal</label>
            <input class="form-control" type="text" value="${escapeHtml(user.branchName || user.sucursal || 'No asignada')}" readonly disabled>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').classList.remove('open')">Cerrar</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
    
    // Cerrar y eliminar del DOM después
    const closeModal = () => {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
    };
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
  }

  /* ---- Mostrar modal de cambio de contraseña ---- */
  function showChangePasswordModal() {
    // Crear modal dinámicamente
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-change-password';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 class="modal-title">Cambiar contraseña</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <form id="change-password-form" novalidate>
            <div class="form-group">
              <label class="form-label">Contraseña actual <span class="required">*</span></label>
              <input class="form-control" type="password" id="current-password" placeholder="Ingresa tu contraseña actual"/>
              <p class="form-error" id="current-password-error"><span>⚠</span> <span class="err-text"></span></p>
            </div>
            <div class="form-group">
              <label class="form-label">Nueva contraseña <span class="required">*</span></label>
              <input class="form-control" type="password" id="new-password" placeholder="Mínimo 8 caracteres"/>
              <p class="form-error" id="new-password-error"><span>⚠</span> <span class="err-text"></span></p>
            </div>
            <div class="form-group">
              <label class="form-label">Confirmar nueva contraseña <span class="required">*</span></label>
              <input class="form-control" type="password" id="confirm-password" placeholder="Repite la nueva contraseña"/>
              <p class="form-error" id="confirm-password-error"><span>⚠</span> <span class="err-text"></span></p>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancel-change-password">Cancelar</button>
          <button class="btn btn-primary" id="save-change-password">Actualizar contraseña</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
    
    const closeModal = () => {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
    };
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    document.getElementById('cancel-change-password')?.addEventListener('click', closeModal);
    
    // Guardar contraseña
    document.getElementById('save-change-password')?.addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password')?.value || '';
      const newPassword = document.getElementById('new-password')?.value || '';
      const confirmPassword = document.getElementById('confirm-password')?.value || '';
      
      // Limpiar errores
      ['current-password', 'new-password', 'confirm-password'].forEach(id => {
        const input = document.getElementById(id);
        const error = document.getElementById(`${id}-error`);
        if (error) error.style.display = 'none';
        if (input) input.classList.remove('error');
      });
      
      let hasError = false;
      
      if (!currentPassword) {
        const error = document.getElementById('current-password-error');
        if (error) { error.style.display = 'flex'; error.querySelector('.err-text').textContent = 'La contraseña actual es requerida'; }
        hasError = true;
      }
      
      if (!newPassword) {
        const error = document.getElementById('new-password-error');
        if (error) { error.style.display = 'flex'; error.querySelector('.err-text').textContent = 'La nueva contraseña es requerida'; }
        hasError = true;
      } else if (newPassword.length < 8) {
        const error = document.getElementById('new-password-error');
        if (error) { error.style.display = 'flex'; error.querySelector('.err-text').textContent = 'La contraseña debe tener al menos 8 caracteres'; }
        hasError = true;
      }
      
      if (newPassword !== confirmPassword) {
        const error = document.getElementById('confirm-password-error');
        if (error) { error.style.display = 'flex'; error.querySelector('.err-text').textContent = 'Las contraseñas no coinciden'; }
        hasError = true;
      }
      
      if (hasError) return;
      
      const btn = document.getElementById('save-change-password');
      const originalText = btn.textContent;
      btn.textContent = 'Guardando...';
      btn.disabled = true;
      
      try {
        await API.auth.changePassword({
          currentPassword,
          newPassword
        });
        
        UI.toast('Contraseña actualizada correctamente', 'success');
        closeModal();
        
      } catch (err) {
        UI.toast(err.message || 'Error al cambiar la contraseña', 'error');
        if (err.message?.toLowerCase().includes('actual')) {
          const error = document.getElementById('current-password-error');
          if (error) { error.style.display = 'flex'; error.querySelector('.err-text').textContent = err.message; }
        }
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  /* ---- Crear el menú desplegable del usuario ---- */
  function createUserDropdown() {
    const user = Auth.getUser();
    if (!user) return;
    
    // Eliminar dropdown existente si hay
    const existing = document.getElementById('user-dropdown');
    if (existing) existing.remove();
    
    const dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.className = 'user-dropdown';
    dropdown.style.display = 'none';
    dropdown.innerHTML = `
      <div class="user-dropdown-header">
        <div class="user-dropdown-avatar">${document.getElementById('navbar-avatar')?.textContent || 'U'}</div>
        <div class="user-dropdown-info">
          <div class="user-dropdown-name">${escapeHtml(user.name || 'Usuario')}</div>
          <div class="user-dropdown-email">${escapeHtml(user.email || '')}</div>
        </div>
      </div>
      <div class="user-dropdown-divider"></div>
      <div class="user-dropdown-item" id="dropdown-profile">
        <span class="user-dropdown-icon">👤</span>
        <span>Mi perfil</span>
      </div>
      <div class="user-dropdown-item" id="dropdown-change-password">
        <span class="user-dropdown-icon">🔒</span>
        <span>Cambiar contraseña</span>
      </div>
      <div class="user-dropdown-divider"></div>
      <div class="user-dropdown-item" id="dropdown-logout">
        <span class="user-dropdown-icon">🚪</span>
        <span>Cerrar sesión</span>
      </div>
    `;
    
    document.body.appendChild(dropdown);
    
    // Eventos del dropdown
    document.getElementById('dropdown-profile')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      showProfileModal();
    });
    
    document.getElementById('dropdown-change-password')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      showChangePasswordModal();
    });
    
    document.getElementById('dropdown-logout')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      const logoutModal = document.getElementById('modal-logout');
      if (logoutModal) logoutModal.classList.add('open');
    });
    
    return dropdown;
  }

  /* ---- Inicializar el click del avatar ---- */
  function initUserMenu() {
    const userArea = document.getElementById('topbar-user-chip');
    const dropdown = document.getElementById('user-dropdown');
    
    if (!userArea || !dropdown) return;
    
    // Toggle dropdown al hacer click
    userArea.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!userArea.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  /* ---- Inject topbar ---- */
  function injectTopbar() {
    const topbar = document.createElement('nav');
    topbar.className = 'topbar';
    topbar.id = 'topbar';
    topbar.innerHTML = `
      <div class="topbar-left">
        <button class="btn-hamburger" id="sidebar-toggle" aria-label="Menú">☰</button>
        <div class="topbar-logo">CB</div>
        <div class="topbar-brand">
          <span class="topbar-brand-name">Cocobongo</span>
          <span class="topbar-brand-sub">Sistema de Gestión</span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-notif" id="notif-btn" title="Notificaciones" style="display:none">
          🔔<span class="notif-dot" id="notif-dot"></span>
        </div>
        <div class="topbar-user" id="topbar-user-chip">
          <div class="topbar-avatar" id="navbar-avatar">??</div>
          <div class="topbar-user-info">
            <div class="topbar-user-name" id="navbar-user-name">Cargando...</div>
            <span class="topbar-user-role" id="navbar-user-role">—</span>
          </div>
        </div>
        <button class="btn-logout" id="btn-logout">⏏ Salir</button>
      </div>
    `;
    document.body.prepend(topbar);
  }

  /* ---- Build sidebar HTML ---- */
  function buildSidebar(role) {
    const currentPage = window.location.pathname.split('/').pop();
    let html = '<nav>';

    NAV_ITEMS.forEach(group => {
      const groupVisible = group.roles.includes(role);
      if (!groupVisible) return;

      if (group.sep) html += '<div class="sidebar-sep"></div>';
      html += `<p class="sidebar-section-label">${group.section}</p>`;

      group.items.forEach(item => {
        if (!item.roles.includes(role)) return;
        const active = item.href === currentPage ? 'active' : '';
        const badge  = item.badgeId
          ? `<span class="s-badge" id="${item.badgeId}" style="display:none">!</span>`
          : '';
        html += `
          <a class="s-item ${active}" href="${item.href}" data-page="${item.href}">
            <span class="s-icon">${item.icon}</span>
            ${item.label}
            ${badge}
          </a>`;
      });
    });

    html += '</nav>';
    html += `
      <div class="sidebar-footer">
        <p>v1.0 — Bases de Datos 2026<br/><span>Sec. 020-83/85</span></p>
      </div>`;
    return html;
  }

  /* ---- Inject sidebar ---- */
  function injectSidebar(role) {
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = buildSidebar(role);
    document.body.insertBefore(sidebar, document.querySelector('.app-wrapper'));
  }

  /* ---- Logout modal ---- */
  function injectLogoutModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-logout';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 class="modal-title">Cerrar sesión</h2>
          <button class="modal-close" id="modal-logout-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-sub)">
            ¿Estás seguro de que deseas cerrar tu sesión?
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancel-logout">Cancelar</button>
          <button class="btn btn-danger" id="confirm-logout">Sí, cerrar sesión</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-logout').addEventListener('click', () => {
      modal.classList.add('open');
    });
    document.getElementById('modal-logout-close').addEventListener('click', () => modal.classList.remove('open'));
    document.getElementById('cancel-logout').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('confirm-logout').addEventListener('click', async () => {
      const btn = document.getElementById('confirm-logout');
      if (window.UI) UI.setLoading(btn, true);
      await Auth.logout();
    });
  }

  /* ---- Mobile hamburger ---- */
  function initMobileMenu() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));

    document.addEventListener('click', e => {
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  /* ---- Toast container ---- */
  function injectToastContainer() {
    if (!document.getElementById('toast-container')) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
  }

  /* ---- Main init ---- */
  async function init(options = {}) {
    const { allowedRoles = null } = options;

    const user = await Auth.guardPage({ allowedRoles });
    if (!user) return false;

    injectToastContainer();
    injectTopbar();
    injectSidebar(user.role);
    injectLogoutModal();
    initMobileMenu();

    renderNavbarUser();
    createUserDropdown();    // Crear el menú desplegable
    initUserMenu();          // Activar el click del avatar
    
    return true;
  }

  /* ---- Update sidebar badge ---- */
  function setBadge(badgeId, count) {
    const el = document.getElementById(badgeId);
    if (!el) return;
    if (count > 0) {
      el.textContent = count;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  /* ---- Helper escape HTML ---- */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { init, setBadge };

})();