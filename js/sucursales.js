/* ============================================================
   SUCURSALES.JS — Gestión de sucursales (con CREATE)
   ============================================================ */
 
class SucursalesPage {
 
  constructor() {
    this.tbody        = document.getElementById('branches-tbody');
    this.emptyState   = document.getElementById('empty-state');
    this.tblLoading   = document.getElementById('tbl-loading');
    this.searchInput  = document.getElementById('search-input');
    this.filterStatus = document.getElementById('filter-status');
    this.paginationBar  = document.getElementById('pagination-bar');
    this.paginationInfo = document.getElementById('pagination-info');
    this.paginationBtns = document.getElementById('pagination-btns');
 
    // Modal Editar
    this.modalEdit       = document.getElementById('modal-sucursal');
    this.editForm        = document.getElementById('edit-form');
    this.editId          = document.getElementById('edit-id');
    this.editName        = document.getElementById('edit-name');
    this.editCity        = document.getElementById('edit-city');
    this.editAddress     = document.getElementById('edit-address');
    this.editStatus      = document.getElementById('edit-status');
    this.btnSave         = document.getElementById('btn-save');
    this.btnSaveText     = document.getElementById('btn-save-text');
    this.btnSaveSpinner  = document.getElementById('btn-save-spinner');
 
    // Modal Nueva Sucursal
    this.modalNew        = document.getElementById('modal-new-branch');
    this.newName         = document.getElementById('new-name');
    this.newCity         = document.getElementById('new-city');
    this.newAddress      = document.getElementById('new-address');
    this.btnNewSave      = document.getElementById('btn-new-save');
    this.btnNewSaveText  = document.getElementById('btn-new-save-text');
    this.btnNewSaveSpinner = document.getElementById('btn-new-save-spinner');
 
    this.allBranches  = [];
    this.filtered     = [];
    this.currentPage  = 0;
    this.pageSize     = 10;
    this.searchTimer  = null;
  }
 
  async init() {
    if (!Auth.isAuthenticated()) {
      window.location.href = 'login.html';
      return;
    }
 
    try {
      const user = await Auth.validateSession();
      if (!user) { window.location.href = 'login.html'; return; }
      this._renderTopbar(user);
      if (window.UserMenu) UserMenu.renderUserDropdown();
    } catch {
      Auth.clearSession();
      window.location.href = 'login.html';
      return;
    }
 
    // Eventos búsqueda y filtro
    this.searchInput.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this._applyFilters(), 300);
    });
    this.filterStatus.addEventListener('change', () => this._applyFilters());
 
    // Eventos modal editar
    document.getElementById('modal-close')?.addEventListener('click', () => this._closeModalEdit());
    document.getElementById('btn-cancel')?.addEventListener('click', () => this._closeModalEdit());
    this.modalEdit?.addEventListener('click', (e) => {
      if (e.target === this.modalEdit) this._closeModalEdit();
    });
    this.btnSave?.addEventListener('click', () => this._handleSaveEdit());
 
    // Eventos modal nueva
    document.getElementById('modal-new-close')?.addEventListener('click', () => this._closeModalNew());
    document.getElementById('btn-new-cancel')?.addEventListener('click', () => this._closeModalNew());
    this.modalNew?.addEventListener('click', (e) => {
      if (e.target === this.modalNew) this._closeModalNew();
    });
    this.btnNewSave?.addEventListener('click', () => this._handleSaveNew());
 
    // Botón nueva sucursal
    document.getElementById('btn-new-branch')?.addEventListener('click', () => this._openModalNew());
 
    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await Auth.logout?.().catch(() => {});
      Auth.clearSession();
      window.location.href = 'login.html';
    });
 
    // Hamburger
    document.getElementById('btn-hamburger')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
 
    await this._loadBranches();
  }
 
  _renderTopbar(user) {
    const name = user.name || user.email || 'Admin';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('topbar-name').textContent = name;
    document.getElementById('topbar-avatar').textContent = initials;
    const roleEl = document.getElementById('topbar-role');
    roleEl.textContent = user.role || 'ADMIN';
    roleEl.className = `topbar-user-role ${user.role === 'ADMIN' ? 'role-admin' : 'role-employee'}`;
  }
 
  async _loadBranches() {
    this.tblLoading.classList.remove('hidden');
    try {
      const raw = await API.branches.list({ size: 200 });
      this.allBranches = API.unwrapList(raw);
      this._applyFilters();
    } catch (err) {
      UI.toast(err.message || 'Error al cargar sucursales.', 'error');
      this._showEmpty();
    } finally {
      this.tblLoading.classList.add('hidden');
    }
  }
 
  _applyFilters() {
    const search = this.searchInput.value.trim().toLowerCase();
    const status = this.filterStatus.value;
 
    this.filtered = this.allBranches.filter(b => {
      const matchSearch = !search
        || (b.name   || '').toLowerCase().includes(search)
        || (b.city   || '').toLowerCase().includes(search)
        || (b.address|| '').toLowerCase().includes(search);
 
      const matchStatus = status === ''
        || String(b.isActive) === status;
 
      return matchSearch && matchStatus;
    });
 
    this.currentPage = 0;
    this._renderPage();
  }
 
  _renderPage() {
    const total = this.filtered.length;
    const totalPages = Math.ceil(total / this.pageSize);
    const start = this.currentPage * this.pageSize;
    const slice = this.filtered.slice(start, start + this.pageSize);
 
    if (!total) {
      this._showEmpty();
      this.paginationBar.style.display = 'none';
      return;
    }
 
    this.emptyState.style.display = 'none';
    this.tbody.innerHTML = slice.map(b => this._rowHtml(b)).join('');
 
    this.tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const branch = this.allBranches.find(b => b.id === id);
        if (branch) this._openModalEdit(branch);
      });
    });
 
    if (totalPages <= 1) {
      this.paginationBar.style.display = 'none';
    } else {
      this.paginationBar.style.display = 'flex';
      this.paginationInfo.textContent =
        `Mostrando ${start + 1}–${Math.min(start + this.pageSize, total)} de ${total}`;
      this._renderPagination(totalPages);
    }
  }
 
  _rowHtml(b) {
    const active = b.isActive !== false;
    return `
      <tr>
        <td><span class="badge badge-gray">#${b.id}</span></td>
        <td class="fw-500">${this._esc(b.name || '—')}</td>
        <td>${this._esc(b.city || '—')}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${this._esc(b.address || '')}">
          ${this._esc(b.address || '—')}
         </td>
        <td>
          <div class="status-cell">
            <span class="status-dot ${active ? 'active' : 'inactive'}"></span>
            <span class="badge ${active ? 'badge-green' : 'badge-gray'}">
              ${active ? 'Activa' : 'Inactiva'}
            </span>
          </div>
         </td>
        <td style="text-align:right">
          <div class="tbl-actions" style="justify-content:flex-end">
            <button class="btn btn-secondary btn-sm btn-edit" data-id="${b.id}" title="Editar">
              ✏️ Editar
            </button>
          </div>
         </td>
      </tr>
    `;
  }
 
  _renderPagination(totalPages) {
    const btns = [];
    const cur = this.currentPage;
 
    btns.push(`<button class="page-btn" ${cur === 0 ? 'disabled' : ''} data-page="${cur - 1}">‹</button>`);
 
    for (let i = 0; i < totalPages; i++) {
      if (totalPages > 7 && Math.abs(i - cur) > 2 && i !== 0 && i !== totalPages - 1) {
        if (i === 1 || i === totalPages - 2) btns.push(`<span style="padding:0 4px;color:var(--gray-text)">…</span>`);
        continue;
      }
      btns.push(`<button class="page-btn ${i === cur ? 'active' : ''}" data-page="${i}">${i + 1}</button>`);
    }
 
    btns.push(`<button class="page-btn" ${cur === totalPages - 1 ? 'disabled' : ''} data-page="${cur + 1}">›</button>`);
 
    this.paginationBtns.innerHTML = btns.join('');
    this.paginationBtns.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentPage = Number(btn.dataset.page);
        this._renderPage();
      });
    });
  }
 
  _showEmpty() {
    this.tbody.innerHTML = '';
    this.emptyState.style.display = 'block';
  }
 
  // ========== MODAL NUEVA SUCURSAL ==========
 
  _openModalNew() {
    // Limpiar formulario
    this.newName.value = '';
    this.newCity.value = '';
    this.newAddress.value = '';
 
    // Limpiar errores
    ['new-name', 'new-city', 'new-address'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('is-invalid', 'is-valid');
      }
      const err = document.getElementById(`${id}-error`);
      if (err) err.classList.remove('visible');
    });
 
    this.modalNew.classList.add('open');
    setTimeout(() => this.newName.focus(), 100);
  }
 
  _closeModalNew() {
    this.modalNew.classList.remove('open');
  }
 
  _validateModalNew() {
    let ok = true;
 
    const fields = [
      { el: this.newName,    errId: 'new-name-error',    label: 'El nombre' },
      { el: this.newCity,    errId: 'new-city-error',    label: 'La ciudad' },
      { el: this.newAddress, errId: 'new-address-error', label: 'La dirección' },
    ];
 
    fields.forEach(({ el, errId, label }) => {
      const errEl = document.getElementById(errId);
      if (!el.value.trim()) {
        el.classList.add('is-invalid');
        el.classList.remove('is-valid');
        if (errEl) {
          errEl.querySelector('span').textContent = `⚠ ${label} es obligatorio.`;
          errEl.classList.add('visible');
        }
        ok = false;
      } else {
        el.classList.remove('is-invalid');
        el.classList.add('is-valid');
        if (errEl) errEl.classList.remove('visible');
      }
    });
 
    return ok;
  }
 
  async _handleSaveNew() {
    if (!this._validateModalNew()) return;
 
    const payload = {
      name:     this.newName.value.trim(),
      city:     this.newCity.value.trim(),
      address:  this.newAddress.value.trim(),
      isActive: true
    };
 
    this.btnNewSaveText.textContent = 'Creando...';
    this.btnNewSaveSpinner.style.display = 'inline-block';
    this.btnNewSave.disabled = true;
 
    try {
      await API.branches.create(payload);
      this._closeModalNew();
      await this._loadBranches();
      UI.toast('Sucursal creada correctamente.', 'success');
    } catch (err) {
      UI.toast(err.message || 'Error al crear la sucursal.', 'error');
    } finally {
      this.btnNewSaveText.textContent = 'Crear sucursal';
      this.btnNewSaveSpinner.style.display = 'none';
      this.btnNewSave.disabled = false;
    }
  }
 
  // ========== MODAL EDITAR SUCURSAL ==========
 
  _openModalEdit(branch) {
    this.editId.value      = branch.id;
    this.editName.value    = branch.name    || '';
    this.editCity.value    = branch.city    || '';
    this.editAddress.value = branch.address || '';
    this.editStatus.value  = String(branch.isActive !== false);
 
    ['edit-name', 'edit-city', 'edit-address'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('is-invalid', 'is-valid');
      const err = document.getElementById(`${id}-error`);
      if (err) err.classList.remove('visible');
    });
 
    this.modalEdit.classList.add('open');
    setTimeout(() => this.editName.focus(), 100);
  }
 
  _closeModalEdit() {
    this.modalEdit.classList.remove('open');
  }
 
  _validateModalEdit() {
    let ok = true;
 
    const fields = [
      { el: this.editName,    errId: 'edit-name-error',    label: 'El nombre' },
      { el: this.editCity,    errId: 'edit-city-error',    label: 'La ciudad' },
      { el: this.editAddress, errId: 'edit-address-error', label: 'La dirección' },
    ];
 
    fields.forEach(({ el, errId, label }) => {
      const errEl = document.getElementById(errId);
      if (!el.value.trim()) {
        el.classList.add('is-invalid');
        el.classList.remove('is-valid');
        if (errEl) {
          errEl.querySelector('span').textContent = `⚠ ${label} es obligatorio.`;
          errEl.classList.add('visible');
        }
        ok = false;
      } else {
        el.classList.remove('is-invalid');
        el.classList.add('is-valid');
        if (errEl) errEl.classList.remove('visible');
      }
    });
 
    return ok;
  }
 
  async _handleSaveEdit() {
    if (!this._validateModalEdit()) return;
 
    const id = Number(this.editId.value);
    const payload = {
      name:     this.editName.value.trim(),
      city:     this.editCity.value.trim(),
      address:  this.editAddress.value.trim(),
      isActive: this.editStatus.value === 'true'
    };
 
    this.btnSaveText.textContent = 'Guardando...';
    this.btnSaveSpinner.style.display = 'inline-block';
    this.btnSave.disabled = true;
 
    try {
      await API.branches.update(id, payload);
 
      const idx = this.allBranches.findIndex(b => b.id === id);
      if (idx !== -1) {
        this.allBranches[idx] = { ...this.allBranches[idx], ...payload };
      }
 
      this._closeModalEdit();
      this._applyFilters();
      UI.toast('Sucursal actualizada correctamente.', 'success');
    } catch (err) {
      UI.toast(err.message || 'Error al actualizar la sucursal.', 'error');
    } finally {
      this.btnSaveText.textContent = 'Guardar cambios';
      this.btnSaveSpinner.style.display = 'none';
      this.btnSave.disabled = false;
    }
  }
 
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
 
document.addEventListener('DOMContentLoaded', () => {
  new SucursalesPage().init();
});