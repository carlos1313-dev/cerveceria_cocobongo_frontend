/* ============================================================
   USUARIOS.JS — Gestión de usuarios
   GET    /api/v1/users              — listar usuarios (paginado)
   POST   /api/v1/users              — crear empleado
   PUT    /api/v1/users/{id}         — actualizar usuario
   PATCH  /api/v1/users/{id}/deactivate
   PATCH  /api/v1/users/{id}/activate
   ============================================================ */
 
const Usuarios = (() => {
 
  let users      = [];
  let branches   = [];
  let editingId  = null;
  let targetId   = null; // para desactivar/activar
 
  const $ = id => document.getElementById(id);
 
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }
 
  function fmt(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }
 
  function initials(name) {
    return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
 
  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await loadBranches();
    await loadUsers();
    attachListeners();
  }
 
  /* ============================================================
     CARGAR SUCURSALES
     ============================================================ */
  async function loadBranches() {
    try {
      const data = await API.branches.list({ size: 200 });
      branches = API.unwrapList(data).map(b => ({
        id:   b.id ?? b.idBranch,
        name: b.name
      }));
 
      // Poblar selects
      ['filter-branch', 'form-branch'].forEach(selId => {
        const el = $(selId);
        if (!el) return;
        const isFilter = selId === 'filter-branch';
        const defaultOpt = isFilter ? 'Todas las sucursales' : 'Sin sucursal asignada';
        el.innerHTML = `<option value="">${defaultOpt}</option>` +
          branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
      });
    } catch (err) {
      UI.toast('No se pudieron cargar las sucursales.', 'error');
    }
  }
 
  /* ============================================================
     CARGAR USUARIOS
     ============================================================ */
  async function loadUsers() {
    showSkeleton();
    try {
      const role     = $('filter-role')?.value   || undefined;
      const branchId = $('filter-branch')?.value || undefined;
      const params   = { size: 200 };
      if (role)     params.role     = role;
      if (branchId) params.branchId = branchId;
 
      const data = await API.users.list(params);
      users = API.unwrapList(data);
 
      const search   = ($('search-input')?.value || '').trim().toLowerCase();
      const status   = $('filter-status')?.value || '';
      const filtered = applyFilters(users, search, status);
      renderTable(filtered);
    } catch (err) {
      UI.toast(err.message || 'Error al cargar usuarios.', 'error');
      renderTable([]);
    }
  }
 
  function applyFilters(data, search, status) {
    return data.filter(u => {
      const matchSearch = !search ||
        (u.name  || '').toLowerCase().includes(search) ||
        (u.email || '').toLowerCase().includes(search);
      const matchStatus = !status ||
        (status === 'active'   &&  u.active) ||
        (status === 'inactive' && !u.active);
      return matchSearch && matchStatus;
    });
  }
 
  /* ============================================================
     RENDER TABLA
     ============================================================ */
  function renderTable(data) {
    const tbody   = $('users-tbody');
    const empty   = $('empty-state');
    const countEl = $('count-label');
    if (!tbody) return;
 
    if (!data || data.length === 0) {
      tbody.innerHTML = '';
      if (empty)   empty.style.display   = 'flex';
      if (countEl) countEl.textContent   = '0 usuarios';
      return;
    }
 
    if (empty)   empty.style.display   = 'none';
    if (countEl) countEl.textContent   = `${data.length} usuario${data.length !== 1 ? 's' : ''}`;
 
    tbody.innerHTML = data.map(buildRow).join('');
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      tr.style.animationDelay = `${i * 25}ms`;
      tr.classList.add('row-fade-in');
    });
  }
 
  function buildRow(u) {
    const branchName = branches.find(b => b.id === u.branchId)?.name || '—';
    const roleBadge  = u.role === 'ADMIN'
      ? `<span class="badge badge-navy">Admin</span>`
      : `<span class="badge badge-blue">Empleado</span>`;
    const statusBadge = u.active
      ? `<span class="badge badge-green">✓ Activo</span>`
      : `<span class="badge badge-red">✕ Inactivo</span>`;
 
    const toggleBtn = u.active
      ? `<button class="btn btn-danger btn-sm" onclick="Usuarios.openDeactivate(${u.id}, '${esc(u.name)}')">Desactivar</button>`
      : `<button class="btn btn-success btn-sm" onclick="Usuarios.activate(${u.id})">Activar</button>`;
 
    return `
      <tr data-id="${u.id}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="user-avatar-cell">${esc(initials(u.name))}</div>
            <span style="font-weight:500;color:var(--text-main)">${esc(u.name || '—')}</span>
          </div>
        </td>
        <td style="color:var(--text-sub)">${esc(u.email || '—')}</td>
        <td>${roleBadge}</td>
        <td style="color:var(--text-sub)">${esc(branchName)}</td>
        <td>${statusBadge}</td>
        <td style="color:var(--gray-text);font-size:12px">${fmt(u.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-secondary btn-sm" onclick="Usuarios.openEdit(${u.id})">Editar</button>
            ${toggleBtn}
          </div>
        </td>
      </tr>`;
  }
 
  function showSkeleton() {
    const tbody = $('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() =>
      `<tr>${Array(7).fill(0).map(() =>
        `<td><div class="skeleton-line"></div></td>`).join('')}</tr>`
    ).join('');
  }
 
  /* ============================================================
     MODAL CREAR
     ============================================================ */
  function openCreate() {
    editingId = null;
    resetForm();
    $('modal-user-title').textContent  = 'Nuevo usuario';
    $('btn-save-user').textContent     = 'Guardar usuario';
    $('password-group').style.display  = '';  // mostrar contraseña al crear
    openModal('modal-user');
    setTimeout(() => $('form-name')?.focus(), 150);
  }
 
  /* ============================================================
     MODAL EDITAR
     ============================================================ */
  function openEdit(id) {
    editingId = id;
    const u = users.find(x => x.id === id);
    if (!u) return;
 
    $('modal-user-title').textContent  = 'Editar usuario';
    $('btn-save-user').textContent     = 'Guardar cambios';
    $('password-group').style.display  = 'none'; // ocultar contraseña al editar
 
    setVal('form-name',   u.name  || '');
    setVal('form-email',  u.email || '');
    setVal('form-branch', u.branchId || '');
 
    clearAllErrors();
    openModal('modal-user');
  }
 
  /* ============================================================
     GUARDAR (crear o editar)
     ============================================================ */
  async function saveUser() {
    let ok = true;
 
    const name  = $('form-name')?.value.trim()  || '';
    const email = $('form-email')?.value.trim() || '';
    const pass  = $('form-password')?.value     || '';
 
    if (!name) {
      showFieldError('form-name-error', 'El nombre es obligatorio');
      ok = false;
    } else clearFieldError('form-name-error');
 
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFieldError('form-email-error', 'Ingresa un correo válido');
      ok = false;
    } else clearFieldError('form-email-error');
 
    if (!editingId) {
      if (!pass || pass.length < 8) {
        showFieldError('form-password-error', 'La contraseña debe tener al menos 8 caracteres');
        ok = false;
      } else clearFieldError('form-password-error');
    }
 
    if (!ok) return;
 
    const btn = $('btn-save-user');
    UI.setLoading(btn, true);
 
    const branchId = $('form-branch')?.value ? parseInt($('form-branch').value, 10) : null;
 
    try {
      if (editingId) {
        // PUT /api/v1/users/{id} — UpdateUserRequest
        await API.users.update(editingId, { name, email, branchId });
        UI.toast('Usuario actualizado correctamente.', 'success');
      } else {
        // POST /api/v1/users — CreateUserRequest
        await API.users.create({ name, email, password: pass, branchId });
        UI.toast('Usuario creado correctamente.', 'success');
      }
      closeModal('modal-user');
      await loadUsers();
    } catch (err) {
      UI.toast(err.message || 'Error al guardar el usuario.', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }
 
  /* ============================================================
     DESACTIVAR / ACTIVAR
     ============================================================ */
  function openDeactivate(id, name) {
    targetId = id;
    $('deactivate-user-name').textContent = name;
    openModal('modal-deactivate');
  }
 
  async function confirmDeactivate() {
    if (!targetId) return;
    const btn = $('btn-confirm-deactivate');
    UI.setLoading(btn, true);
    try {
      await API.users.deactivate(targetId);
      UI.toast('Usuario desactivado.', 'success');
      closeModal('modal-deactivate');
      await loadUsers();
    } catch (err) {
      UI.toast(err.message || 'Error al desactivar el usuario.', 'error');
    } finally {
      UI.setLoading(btn, false);
      targetId = null;
    }
  }
 
  async function activate(id) {
    try {
      await API.users.activate(id);
      UI.toast('Usuario activado correctamente.', 'success');
      await loadUsers();
    } catch (err) {
      UI.toast(err.message || 'Error al activar el usuario.', 'error');
    }
  }
 
  /* ============================================================
     LISTENERS
     ============================================================ */
  function attachListeners() {
    const debounce = (fn, ms) => {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    };
 
    $('search-input')?.addEventListener('input', debounce(() => {
      const search = ($('search-input')?.value || '').trim().toLowerCase();
      const status = $('filter-status')?.value || '';
      renderTable(applyFilters(users, search, status));
    }, 300));
 
    ['filter-role', 'filter-branch'].forEach(id => {
      $(id)?.addEventListener('change', () => loadUsers());
    });
 
    $('filter-status')?.addEventListener('change', () => {
      const search = ($('search-input')?.value || '').trim().toLowerCase();
      const status = $('filter-status')?.value || '';
      renderTable(applyFilters(users, search, status));
    });
 
    $('btn-clear-filters')?.addEventListener('click', () => {
      $('search-input').value  = '';
      $('filter-role').value   = '';
      $('filter-branch').value = '';
      $('filter-status').value = '';
      loadUsers();
    });
 
    $('btn-confirm-deactivate')?.addEventListener('click', confirmDeactivate);
 
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });
  }
 
  /* ============================================================
     HELPERS
     ============================================================ */
  function openModal(id)  { $(id)?.classList.add('open');    }
  function closeModal(id) { $(id)?.classList.remove('open'); }
 
  function resetForm() {
    ['form-name', 'form-email', 'form-password'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    setVal('form-branch', '');
    clearAllErrors();
  }
 
  function clearAllErrors() {
    document.querySelectorAll('#user-form .form-error').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('#user-form .form-control').forEach(el => {
      el.classList.remove('is-invalid', 'is-valid');
    });
  }
 
  function showFieldError(errId, msg) {
    const el = $(errId);
    if (!el) return;
    const span = el.querySelector('.err-text');
    if (span) span.textContent = msg;
    el.classList.add('visible');
  }
 
  function clearFieldError(errId) {
    const el = $(errId);
    if (el) el.classList.remove('visible');
  }
 
  function setVal(id, val) { const el = $(id); if (el) el.value = val; }
 
  return {
    init,
    reload: loadUsers,
    openCreate,
    openEdit,
    saveUser,
    openDeactivate,
    activate
  };
 
})();
 