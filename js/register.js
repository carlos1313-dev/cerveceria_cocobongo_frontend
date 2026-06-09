/* ============================================================
   REGISTER.JS — Registro inicial de administrador (RF-SEG-01)
   ============================================================ */

class RegisterPage {

  constructor() {
    this.form           = document.getElementById('register-form');
    this.nameInput      = document.getElementById('name');
    this.emailInput     = document.getElementById('email');
    this.branchSelect   = document.getElementById('branch-id');
    this.branchManual   = document.getElementById('branch-id-manual');
    this.branchManualWrap = document.getElementById('branch-manual-wrap');
    this.branchSelectWrap = document.getElementById('branch-select-wrap');
    this.branchNameHint = document.getElementById('branch-name-hint');
    this.passInput      = document.getElementById('password');
    this.confirmInput   = document.getElementById('password-confirm');
    this.btnSubmit      = document.getElementById('btn-submit');
    this.alertBox       = document.getElementById('register-alert');
    this.alertMsg       = document.getElementById('register-alert-msg');
    this.togglePass     = document.getElementById('toggle-pass');
    this.toggleConfirm  = document.getElementById('toggle-pass-confirm');
    this.branchesLoaded = false;
    this.useManualBranch = false;
  }

  async init() {
  if (Auth.isAuthenticated()) {
    try {
      const user = await Auth.validateSession();
      if (user) {
        Auth.redirectByRole(user.role);
        return;
      }
    } catch {
      Auth.clearSession();
    }
  }

  Validaciones.attachLiveValidation(this.nameInput, 'required', 'El nombre');
  Validaciones.attachLiveValidation(this.emailInput, 'email');
  Validaciones.attachLiveValidation(this.passInput, 'password');
  Validaciones.attachLiveValidation(this.confirmInput, 'password');

  this.togglePass?.addEventListener('click', () => this._toggleVisibility(this.passInput, this.togglePass));
  this.toggleConfirm?.addEventListener('click', () =>
    this._toggleVisibility(this.confirmInput, this.toggleConfirm));

  this.branchManual?.addEventListener('input', () => this._updateBranchHintFromManual());

  // ── Forzar modo manual siempre ──
  this.useManualBranch = true;
  this.branchSelectWrap.style.display = 'none';
  this.branchManualWrap.style.display = '';
  this.branchSelect.disabled = true;
  this.branchManual.disabled = false;

  this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  window.addEventListener('load', () => this.nameInput?.focus());
}

  async loadBranches() {
    let branches = [];

    try {
      const raw = await API.branches.listForRegister();
      branches = API.unwrapList(raw).filter(b => b.isActive !== false);
    } catch {
      try {
        const raw = await API.branches.list({ size: 100 });
        branches = API.unwrapList(raw).filter(b => b.isActive !== false);
      } catch { /* sin listado público — usar ID manual */ }
    }

    if (branches.length) {
      this.useManualBranch = false;
      this.branchSelectWrap.style.display = '';
      this.branchManualWrap.style.display = 'none';
      this.branchManual.disabled = true;
      this.branchSelect.disabled = false;

      this.branchSelect.innerHTML = '<option value="">Selecciona una sucursal</option>';
      branches.forEach(b => {
        const id = b.id ?? b.idBranch;
        const name = b.name || b.nombre || `Sucursal ${id}`;
        const opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = `${name} (ID: ${id})`;
        opt.dataset.name = name;
        this.branchSelect.appendChild(opt);
      });

      Validaciones.attachLiveValidation(this.branchSelect, 'select', 'una sucursal');
      this.branchesLoaded = true;
      return;
    }

    this.useManualBranch = true;
    this.branchSelectWrap.style.display = 'none';
    this.branchManualWrap.style.display = '';
    this.branchSelect.disabled = true;
    this.branchManual.disabled = false;

    if (this.branchNameHint) {
      this.branchNameHint.textContent =
        'Ingresa el id_branch de una sucursal existente en la tabla branch de la BD.';
    }
  }

  _updateBranchHintFromSelect() {
    const opt = this.branchSelect.selectedOptions[0];
    if (!opt?.value) {
      this.branchNameHint.textContent = '';
      return;
    }
    this.branchNameHint.textContent = `Sucursal: ${opt.dataset.name || opt.textContent}`;
  }

  _updateBranchHintFromManual() {
    const id = parseInt(this.branchManual.value, 10);
    if (!id || id <= 0) {
      this.branchNameHint.textContent = '';
      return;
    }
    this.branchNameHint.textContent = `ID de sucursal seleccionado: ${id}`;
  }

  _toggleVisibility(input, btn) {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? '🙈' : '👁';
  }

  showAlert(msg) {
    this.alertMsg.textContent = msg;
    this.alertBox.classList.add('visible');
    this.alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  hideAlert() {
    this.alertBox.classList.remove('visible');
  }

  validateBranch() {
    if (this.useManualBranch) {
      const val = parseInt(this.branchManual.value, 10);
      if (!val || val <= 0) {
        Validaciones.setError(this.branchManual, 'Debes ingresar un ID de sucursal válido.');
        return false;
      }
      Validaciones.setValid(this.branchManual);
      return true;
    }

    return Validaciones.validateSelect(this.branchSelect, 'una sucursal');
  }

  validate() {
    const okName = Validaciones.validateRequired(this.nameInput, 'El nombre');
    const okEmail = Validaciones.validateEmail(this.emailInput);
    const okPass = Validaciones.validatePassword(this.passInput);
    const okBranch = this.validateBranch();

    if (!okName || !okEmail || !okPass || !okBranch) return false;

    if (this.passInput.value !== this.confirmInput.value) {
      Validaciones.setError(this.confirmInput, 'Las contraseñas no coinciden.');
      return false;
    }

    Validaciones.setValid(this.confirmInput);
    return true;
  }

  _isConflict409(err) {
    if (err?.status === 409) return true;
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('administrador activo')
      || msg.includes('registro está deshabilitado')
      || msg.includes('ya está registrado');
  }

  _isBackendConnectionError(err) {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('sin conexión con el servidor')
      || msg.includes('failed to fetch')
      || msg.includes('networkerror');
  }

  async handleSubmit(e) {
    e.preventDefault();
    this.hideAlert();

    if (!this.validate()) return;

    UI.setLoading(this.btnSubmit, true);

    try {
      const payload = RegisterRequest.fromForm(this.form);
      await Auth.register(payload.toJSON());

      UI.toast('Administrador registrado en el servidor. Ya puedes iniciar sesión.', 'success', 3500);

      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1200);

    } catch (err) {
      if (this._isConflict409(err)) {
        this.showAlert(err.message || 'El registro no está disponible.');
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        return;
      }

      if (this._isBackendConnectionError(err)) {
        const origin = API?.API_ORIGIN || window.CBC_API_ORIGIN || 'http://localhost:8082';
        this.showAlert(`No se pudo conectar con el backend (${origin}). Verifica que esté ejecutándose.`);
        return;
      }

      this.showAlert(err.message || 'No se pudo completar el registro.');
    } finally {
      UI.setLoading(this.btnSubmit, false);
    }
  }

}

document.addEventListener('DOMContentLoaded', () => {
  new RegisterPage().init();
});
