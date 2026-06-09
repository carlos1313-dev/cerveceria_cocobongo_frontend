/* ============================================================
   AUTH.JS — Cervecería Cocobongo
   Manejo de autenticación, sesión JWT y redirección por rol
   ============================================================ */

const Auth = (() => {

  const TOKEN_KEY    = 'cbc_jwt_token';
  const USER_KEY     = 'cbc_user';
  const SESSION_KEY  = 'cbc_session';

  /* ---- Token helpers ---- */

  function saveSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY)
      || sessionStorage.getItem('jwt_token');
  }

  function getUser() {
    const raw = sessionStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ---- JWT decode (sin librería) ---- */
  function decodeToken(token) {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  function isTokenExpired(token) {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
  }

  function normalizeUser(user) {
    if (!user) return null;
    const role = user.role || user.rol;
    return {
      ...user,
      role: role ? String(role).toUpperCase() : role,
      name: user.name || user.fullName || user.nombre,
      branchId: user.branchId ?? user.idBranch ?? user.id_branch
    };
  }

  /* ---- Construye usuario desde LoginResponse o MeResponse ---- */
  function userFromAuthPayload(data) {
    if (!data) return null;
    return normalizeUser({
      id:       data.id ?? data.idUser,
      email:    data.email,
      name:     data.name,
      role:     data.role,
      branchId: data.branchId,
      active:   data.active
    });
  }

  /* ---- Auth state (solo chequeo local rápido) ---- */
  function isAuthenticated() {
    const token = getToken();
    if (!token) return false;
    if (isTokenExpired(token)) {
      clearSession();
      return false;
    }
    return true;
  }

  function getRole() {
    const user = getUser();
    return user?.role || null;
  }

  /* ---- Validar sesión contra backend (GET /auth/me) ---- */
  async function validateSession() {
    const token = getToken();
    if (!token || isTokenExpired(token)) {
      clearSession();
      throw new Error('Sesión expirada o inexistente.');
    }

    const profile = await API.auth.me();
    if (!profile) {
      clearSession();
      throw new Error('Sesión inválida. El servidor no reconoce el token.');
    }

    saveSession(token, userFromAuthPayload(profile));
    return getUser();
  }

  /* ---- Proteger páginas: valida token en backend antes de renderizar ---- */
  async function guardPage(options = {}) {
    const {
      allowedRoles = null,
      redirectTo = 'login.html'
    } = options;

    try {
      const user = await validateSession();
      if (!user) {
        window.location.href = redirectTo;
        return null;
      }

      if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
        UI.toast('No tienes permisos para acceder a este módulo.', 'error');
        setTimeout(() => redirectByRole(user.role), 1500);
        return null;
      }

      return user;
    } catch {
      clearSession();
      window.location.href = redirectTo;
      return null;
    }
  }

  async function initProtectedPage(initFn, options = {}) {
    const user = await guardPage(options);
    if (!user) return null;
    if (typeof initFn === 'function') await initFn(user);
    return user;
  }

  /* ---- Redirigir según rol ---- */
  function redirectByRole(role) {
    const r = (role || '').toUpperCase();
    if (r === 'ADMIN') {
      window.location.href = 'dashboard.html';
    } else if (r === 'EMPLOYEE') {
      window.location.href = 'ventas.html';
    } else {
      window.location.href = 'login.html';
    }
  }

  /* ---- Proteger rutas (sync — usar guardPage en páginas protegidas) ---- */
  function requireAuth(allowedRoles) {
    if (!isAuthenticated()) {
      window.location.href = 'login.html';
      return false;
    }
    if (allowedRoles && allowedRoles.length) {
      const role = getRole();
      if (!allowedRoles.includes(role)) {
        UI.toast('No tienes permisos para acceder a este módulo.', 'error');
        setTimeout(() => { window.location.href = 'ventas.html'; }, 1500);
        return false;
      }
    }
    return true;
  }

  /* ---- API login — exige validación exitosa con /auth/me ---- */
  async function login(email, password) {
    const data = await API.auth.login({ email, password });

    const token = data?.token || data?.accessToken;
    if (!token) throw new Error('Respuesta del servidor inválida.');

    saveSession(token, userFromAuthPayload(data));

    const profile = await API.auth.me();
    if (!profile) {
      clearSession();
      throw new Error('No se pudo validar la sesión con el servidor.');
    }

    saveSession(token, userFromAuthPayload(profile));
    return { token, user: getUser() };
  }

  /* ---- API logout ---- */
  async function logout() {
    try {
      await API.auth.logout();
    } catch { /* silent fail */ }
    clearSession();
    window.location.href = 'login.html';
  }

  /* ---- API register (RF-SEG-01 — sin token, solo primer ADMIN) ---- */
  async function register({ name, email, password, branchId }) {
    await API.auth.register({ name, email, password, branchId });
  }

  async function recoverPassword(email) {
    await API.auth.forgotPassword({ email });
  }

  async function fetchMe() {
    return validateSession();
  }

  /* ---- Headers autenticados ---- */
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    };
  }

  return {
    login,
    register,
    logout,
    recoverPassword,
    fetchMe,
    validateSession,
    guardPage,
    initProtectedPage,
    isAuthenticated,
    getToken,
    getUser,
    getRole,
    clearSession,
    redirectByRole,
    requireAuth,
    authHeaders
  };

})();


/* ============================================================
   UI HELPERS (compartidos entre páginas)
   ============================================================ */
const UI = (() => {

  function getToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function toast(msg, type = 'info', duration = 4000) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const container = getToastContainer();

    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-msg">${msg}</span>
      <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;
    container.appendChild(t);

    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 350);
    }, duration);
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn._originalText = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> Procesando...`;
      btn.disabled = true;
      btn.style.opacity = '.8';
    } else {
      btn.innerHTML = btn._originalText || btn.innerHTML;
      btn.disabled = false;
      btn.style.opacity = '';
    }
  }

  function renderNavbarUser() {
    const user = Auth.getUser();
    if (!user) return;

    const nameEl  = document.getElementById('navbar-user-name');
    const roleEl  = document.getElementById('navbar-user-role');
    const avatarEl = document.getElementById('navbar-avatar');

    if (nameEl)   nameEl.textContent  = user.name || user.email;
    if (avatarEl) avatarEl.textContent = (user.name || 'U').substring(0, 2).toUpperCase();
    if (roleEl) {
      const role = (user.role || '').toUpperCase();
      roleEl.textContent = role === 'ADMIN' ? 'Admin' : 'Empleado';
      roleEl.className   = `topbar-user-role ${role === 'ADMIN' ? 'role-admin' : 'role-employee'}`;
    }
  }

  function markActiveSidebarItem() {
    const page = window.location.pathname.split('/').pop();
    document.querySelectorAll('.s-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  }

  function filterSidebarByRole() {
    const role = Auth.getRole();
    document.querySelectorAll('.s-item[data-roles]').forEach(el => {
      const allowed = el.dataset.roles.split(',').map(r => r.trim());
      const visible  = role && allowed.includes(role.toUpperCase());
      el.style.display = visible ? '' : 'none';
    });
    document.querySelectorAll('.s-section[data-roles]').forEach(el => {
      const allowed = el.dataset.roles.split(',').map(r => r.trim());
      el.style.display = role && allowed.includes(role.toUpperCase()) ? '' : 'none';
    });
  }

  return { toast, setLoading, renderNavbarUser, markActiveSidebarItem, filterSidebarByRole };

})();
