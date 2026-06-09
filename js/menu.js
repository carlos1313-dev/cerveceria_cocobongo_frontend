    /* ============================================================
    USER-MENU.JS — Menú de usuario y cambio de contraseña
    ============================================================ */

    const UserMenu = (() => {

    function getUserInfo() {
        const user = Auth.getUser();
        if (!user) return null;
        
        return {
        name: user.name || user.nombre || 'Usuario',
        email: user.email || 'sin-email@registrado.com',
        role: user.role === 'ADMIN' ? 'Administrador' : 'Empleado',
        branch: user.branchName || user.sucursal || 'No asignada'
        };
    }

    function renderUserDropdown() {
        const user = getUserInfo();
        if (!user) return;

        // Actualizar avatar y nombre en la barra superior
        const avatarEl = document.getElementById('navbar-avatar') || document.querySelector('.topbar-avatar');
        const nameEl = document.getElementById('navbar-user-name') || document.querySelector('.topbar-user-name');
        const roleEl = document.getElementById('navbar-user-role') || document.querySelector('.topbar-user-role');

        if (avatarEl) {
        const initials = user.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
        avatarEl.textContent = initials;
        }

        if (nameEl) nameEl.textContent = user.name;
        if (roleEl) roleEl.textContent = user.role;

        // Verificar si ya existe el dropdown, si no, crearlo
        let dropdown = document.getElementById('user-dropdown');
        if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'user-dropdown';
        dropdown.className = 'user-dropdown';
        dropdown.style.display = 'none';
        
        dropdown.innerHTML = `
            <div class="user-dropdown-header">
            <div class="user-dropdown-avatar">${avatarEl?.textContent || 'U'}</div>
            <div class="user-dropdown-info">
                <div class="user-dropdown-name">${user.name}</div>
                <div class="user-dropdown-email">${user.email}</div>
            </div>
            </div>
            <div class="user-dropdown-divider"></div>
            <div class="user-dropdown-item" onclick="UserMenu.showProfile()">
            <span class="user-dropdown-icon">👤</span>
            <span>Mi perfil</span>
            </div>
            <div class="user-dropdown-item" id="dropdown-change-password" 
                onclick="UserMenu.showChangePassword()">
                <span class="user-dropdown-icon">🔒</span>
                <span>Cambiar contraseña</span>
            </div>
            <div class="user-dropdown-divider"></div>
            <div class="user-dropdown-item" onclick="UserMenu.showLogout()">
            <span class="user-dropdown-icon">🚪</span>
            <span>Cerrar sesión</span>
            </div>
        `;
        
        document.body.appendChild(dropdown);
        }

        // Agregar event listener al avatar/área de usuario
        const userArea = document.getElementById('topbar-user-chip') || document.querySelector('.topbar-user');
        if (userArea && !userArea._dropdownBound) {
        userArea._dropdownBound = true;
        userArea.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });        
        // Cerrar dropdown al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!userArea.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            }
        });
        }
    }

    function showProfile() {
        const user = getUserInfo();
        if (!user) return;
        
        // Mostrar modal con información del usuario (solo lectura)
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
                ${user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Nombre completo</label>
                <input class="form-control" type="text" value="${escapeHtml(user.name)}" readonly disabled>
            </div>
            <div class="form-group">
                <label class="form-label">Correo electrónico</label>
                <input class="form-control" type="email" value="${escapeHtml(user.email)}" readonly disabled>
            </div>
            <div class="form-group">
                <label class="form-label">Rol</label>
                <input class="form-control" type="text" value="${escapeHtml(user.role)}" readonly disabled>
            </div>
            <div class="form-group">
                <label class="form-label">Sucursal</label>
                <input class="form-control" type="text" value="${escapeHtml(user.branch)}" readonly disabled>
            </div>
            </div>
            <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').classList.remove('open')">Cerrar</button>
            </div>
        </div>
        `;
        
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('open'), 10);
        
        modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
        });
        
        modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 300);
        });
    }

    function showChangePassword() {
        const modal = document.getElementById('modal-change-password');
        if (modal) {
        // Limpiar formulario
        const form = document.getElementById('change-password-form');
        if (form) form.reset();
        
        // Limpiar errores
        ['current-password', 'new-password', 'confirm-password'].forEach(id => {
            const input = document.getElementById(id);
            if (input) Validaciones.clearState(input);
        });
        
        modal.classList.add('open');
        document.getElementById('current-password')?.focus();
        }
    }

    function showLogout() {
        const modal = document.getElementById('modal-logout');
        if (modal) modal.classList.add('open');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    return {
        renderUserDropdown,
        showProfile,
        showChangePassword,
        showLogout,
        getUserInfo
    };

    })();

    window.UserMenu = UserMenu;

    // Funciones globales para los modales (para ser llamadas desde onclick)
    window.closeChangePasswordModal = () => {
    const modal = document.getElementById('modal-change-password');
    if (modal) modal.classList.remove('open');
    };

    window.submitChangePassword = async () => {
    const currentPassword = document.getElementById('current-password')?.value || '';
    const newPassword = document.getElementById('new-password')?.value || '';
    const confirmPassword = document.getElementById('confirm-password')?.value || '';
    
    // Validaciones
    let hasError = false;
    
    if (!currentPassword) {
        Validaciones.showError(document.getElementById('current-password'), 'La contraseña actual es requerida');
        hasError = true;
    }
    
    if (!newPassword) {
        Validaciones.showError(document.getElementById('new-password'), 'La nueva contraseña es requerida');
        hasError = true;
    } else if (newPassword.length < 8) {
        Validaciones.showError(document.getElementById('new-password'), 'La contraseña debe tener al menos 8 caracteres');
        hasError = true;
    }
    
    if (newPassword !== confirmPassword) {
        Validaciones.showError(document.getElementById('confirm-password'), 'Las contraseñas no coinciden');
        hasError = true;
    }
    
    if (hasError) return;
    
    const btn = document.getElementById('btn-change-password');
    UI.setLoading(btn, true);
    
    try {
        await API.auth.changePassword({
        currentPassword,
        newPassword
        });
        
        UI.toast('Contraseña actualizada correctamente', 'success');
        closeChangePasswordModal();
        
        // Limpiar formulario
        document.getElementById('change-password-form')?.reset();
        
    } catch (err) {
        UI.toast(err.message || 'Error al cambiar la contraseña', 'error');
        if (err.message?.toLowerCase().includes('actual')) {
        Validaciones.showError(document.getElementById('current-password'), err.message);
        }
    } finally {
        UI.setLoading(btn, false);
    }
    };