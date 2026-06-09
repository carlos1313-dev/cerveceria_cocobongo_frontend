/* ============================================================
   CLIENTES.JS — Clientes, créditos y estado de cuenta (Sprint 3)
   CORREGIDO para backend con DTOs específicos
   ============================================================ */

const Clientes = (() => {

  let allClients = [];
  let selectedId = null;

  const $ = id => document.getElementById(id);

  function fmt(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch { return iso; }
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function normalizeClient(c) {
    return {
      id:        c.idClient ?? c.id,
      name:      c.name,
      telephone: c.telephone,
      email:     c.email,
      balance:   Number(c.balance ?? 0),
      active:    c.isActive ?? c.active ?? true,
      lastPurchase: c.lastPurchaseDate ?? c.lastPurchase
    };
  }

  function statusBadge(balance) {
    if (balance <= 0) return '<span class="badge badge-green">Al día</span>';
    if (balance > 100000) return '<span class="badge badge-red">Deuda alta</span>';
    return '<span class="badge badge-amber">Deuda activa</span>';
  }

  async function init() {
    await loadClients();
    attachListeners();
  }

  async function loadClients(search = '') {
    const tbody = $('clients-tbody');
    if (tbody) showSkeleton(tbody);
    try {
      const data = await API.clients.list();
      const clientList = data.data || data;
      allClients = (Array.isArray(clientList) ? clientList : []).map(normalizeClient);
      
      let filtered = filterWithBalance(allClients);
      if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(c => 
          c.name.toLowerCase().includes(searchLower) ||
          (c.telephone && c.telephone.includes(search)) ||
          (c.email && c.email.toLowerCase().includes(searchLower))
        );
      }
      renderTable(filtered);
      updateMetrics(allClients);
    } catch (err) {
      UI.toast(err.message, 'error');
      renderTable([]);
    }
  }

  function filterWithBalance(list) {
    const onlyDebt = $('filter-debt')?.checked;
    if (!onlyDebt) return list;
    return list.filter(c => c.balance > 0);
  }

  function updateMetrics(list) {
    const total = list.length;
    const withDebt = list.filter(c => c.balance > 0).length;
    const debtSum = list.reduce((s, c) => s + c.balance, 0);
    setText('metric-total-clients', total);
    setText('metric-with-debt', withDebt);
    setText('metric-total-debt', fmt(debtSum));
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function renderTable(data) {
    const tbody = $('clients-tbody');
    const empty = $('clients-empty');
    if (!tbody) return;

    if (!data.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = data.map(c => `
      <tr class="row-fade-in" data-id="${c.id}">
        <td>
          <p class="fw-500" style="color:var(--text-main)">${esc(c.name)}</p>
          ${c.email ? `<p style="font-size:11px;color:var(--gray-text)">${esc(c.email)}</p>` : ''}
        </td>
        <td style="color:var(--text-sub)">${esc(c.telephone || '—')}</td>
        <td class="text-right mono ${c.balance > 0 ? 'num-red' : 'num-green'}">${fmt(c.balance)}</td>
        <td style="color:var(--text-sub)">${fmtDate(c.lastPurchase)}</td>
        <td>${statusBadge(c.balance)}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Clientes.openStatement(${c.id})">
            Ver cuenta
          </button>
        </td>
      </tr>
    `).join('');
  }

  function showSkeleton(tbody) {
    tbody.innerHTML = Array(5).fill(0).map(() =>
      `<tr>${Array(6).fill(0).map(() => `<td><div class="skeleton-line"></div></td>`).join('')}</tr>`
    ).join('');
  }

  function attachListeners() {
    const debounced = debounce(() => {
      const searchTerm = $('search-clients')?.value?.trim();
      loadClients(searchTerm);
    }, 300);
    $('search-clients')?.addEventListener('input', debounced);
    $('filter-debt')?.addEventListener('change', () => {
      const searchTerm = $('search-clients')?.value?.trim();
      loadClients(searchTerm);
    });
    $('btn-new-client')?.addEventListener('click', openCreateModal);
    $('btn-save-client')?.addEventListener('click', saveClient);
    $('btn-save-payment')?.addEventListener('click', savePayment);

    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => {
        if (e.target === m) m.classList.remove('open');
      });
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function openCreateModal() {
    resetForm('client-form');
    clearAllErrors('client-form');
    $('modal-client-title').textContent = 'Nuevo cliente';
    $('modal-client').classList.add('open');
    $('form-client-name')?.focus();
  }

  async function saveClient() {
    const rules = [
      { type: 'required', input: $('form-client-name'), label: 'El nombre' }
    ];
    if (!Validaciones.validateForm(rules)) return;

    const btn = $('btn-save-client');
    const payload = {
      name:      $('form-client-name').value.trim(),
      telephone: $('form-client-phone').value.trim() || null,
      email:     $('form-client-email').value.trim() || null,
      isActive:  true
    };

    UI.setLoading(btn, true);
    try {
      await API.clients.create(payload);
      UI.toast('Cliente registrado correctamente.', 'success');
      $('modal-client').classList.remove('open');
      await loadClients($('search-clients')?.value?.trim());
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }

  async function openStatement(id) {
  selectedId = id;
  const client = allClients.find(c => c.id === id);
  if (!client) {
    UI.toast('Cliente no encontrado', 'error');
    return;
  }

  // Mostrar el panel - CAMBIADO a 'block'
  $('statement-panel').style.display = 'block';
  $('statement-client-name').textContent = client.name;
  
  // Mostrar skeleton mientras carga
  const tbody = $('statement-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="4"><div class="skeleton-line"></div></td></tr>`;

  try {
    const currentBalance = await API.clients.getAccountStatus(id);
    console.log('Saldo recibido:', currentBalance);
    
    $('statement-balance').textContent = fmt(currentBalance);
    $('statement-balance').style.color = currentBalance > 0 ? 'var(--red)' : 'var(--green)';
    
    if (tbody) {
      if (currentBalance > 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center;color:var(--gray-text);padding:20px">
              <strong>💰 Saldo pendiente: ${fmt(currentBalance)}</strong><br>
              <span style="font-size:12px;">Registre un abono para reducir la deuda</span>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center;color:var(--green);padding:20px">
              ✅ Cliente al día - No tiene deuda pendiente
            </td>
          </tr>
        `;
      }
    }
    
    const btnPayment = $('btn-register-payment');
    if (btnPayment) btnPayment.disabled = false;
    
  } catch (err) {
    console.error('Error al cargar estado:', err);
    UI.toast('Error al cargar estado de cuenta: ' + (err.message || 'Error desconocido'), 'error');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center;color:var(--red);padding:20px">
            ❌ Error al cargar el estado de cuenta<br>
            <span style="font-size:12px;">${err.message || 'Intente nuevamente'}</span>
          </td>
        </tr>
      `;
    }
  }

  $('statement-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

  async function openPaymentModal() {
    if (!selectedId) return;
    const client = allClients.find(c => c.id === selectedId);
    if (!client) {
      UI.toast('Cliente no encontrado', 'error');
      return;
    }
    
    $('payment-client-name').textContent = client.name;
    $('payment-balance').textContent = fmt(client.balance);
    $('form-payment-amount').value = '';
    $('form-payment-notes').value = '';
    clearAllErrors('payment-form');
    $('modal-payment').classList.add('open');
    $('form-payment-amount')?.focus();
  }

  async function savePayment() {
    if (!selectedId) {
      UI.toast('Error: No hay cliente seleccionado', 'error');
      return;
    }
    
    const amountEl = $('form-payment-amount');
    const amount = parseFloat(amountEl.value);
    
    if (!amountEl.value || isNaN(amount)) {
      UI.toast('Ingrese un monto válido', 'error');
      return;
    }
    
    if (amount <= 0) {
      UI.toast('El monto debe ser mayor a cero.', 'error');
      return;
    }

    const client = allClients.find(c => c.id === selectedId);
    if (amount > client.balance) {
      UI.toast(`El abono no puede superar el saldo pendiente (${fmt(client.balance)})`, 'error');
      return;
    }

    const btn = $('btn-save-payment');
    UI.setLoading(btn, true);
    try {
      const currentUser = Auth.getCurrentUser();
      if (!currentUser || !currentUser.id) {
        throw new Error('Usuario no autenticado');
      }
      
      const payload = {
        idClient: selectedId,
        idUser: currentUser.id,
        amount: amount,
        paymentDate: new Date().toISOString(),
        notes: $('form-payment-notes')?.value?.trim() || null
      };
      
      await API.clients.registerInstallment(selectedId, payload);
      UI.toast('Abono registrado correctamente.', 'success');
      $('modal-payment').classList.remove('open');
      
      await loadClients($('search-clients')?.value?.trim());
      await openStatement(selectedId);
      
    } catch (err) {
      console.error('Error al registrar abono:', err);
      UI.toast(err.message || 'Error al registrar el abono', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }

  function closeStatement() {
    $('statement-panel').style.display = 'none';
    selectedId = null;
  }

  function resetForm(id) {
    const f = $(id);
    if (f) f.reset();
  }

  function clearAllErrors(formId) {
    const f = $(formId);
    if (!f) return;
    f.querySelectorAll('.form-control').forEach(el => Validaciones.clearState(el));
  }

  return {
    init,
    openStatement,
    openPaymentModal,
    closeStatement
  };

})();