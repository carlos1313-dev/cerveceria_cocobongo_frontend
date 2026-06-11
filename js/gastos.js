/* ============================================================
   GASTOS.JS — Cocobongo
   POST /api/v1/outgoings/register  ← OutgoingRequestDTO
   GET  /api/v1/outgoings           ← Page<OutgoingResponseDTO>
 
   Cambios multi-moneda:
   - Selector USD / VES en el formulario
   - Si currency = VES, se muestra el equivalente en USD en tiempo real
   - idUser removido del payload (lo toma el backend del JWT)
   - OutgoingResponseDTO ahora trae totalUsd, totalVes, exchangeRate
   ============================================================ */
 
const Gastos = (() => {
 
  const $ = id => document.getElementById(id);
 
  let currentRate = null;   // { rate } — tasa BCV vigente
 
  const TYPE_LABELS = {
    PERSONAL:    'Personal',
    MAINTENANCE: 'Mantenimiento',
    RENT:        'Arriendo',
    SERVICES:    'Servicios',
    EMPLOYEE:    'Empleados',
    OTHER:       'Otros'
  };
 
  // Moneda activa en la tabla (toggle de vista)
  let viewCurrency = 'USD';
 
  /* ── Formateadores ──────────────────────────────────────── */
  const fmtUSD = n => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtVES = n => 'Bs. ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
 
  function fmt(n, currency) {
    return currency === 'VES' ? fmtVES(n) : fmtUSD(n);
  }
 
  function normalizeFecha(iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 10);
  }
 
  function dateToUTCIso(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0).toISOString();
  }
 
  function toDateOnly(val) {
    if (!val) return '';
    return String(val).slice(0, 10);
  }
 
  /* ── Conversión ─────────────────────────────────────────── */
  function toVES(usd) {
    if (!currentRate || !currentRate.rate) return 0;
    return usd * currentRate.rate;
  }
 
  function toUSD(ves) {
    if (!currentRate || !currentRate.rate) return 0;
    return ves / currentRate.rate;
  }
 
  /* ── Loading ────────────────────────────────────────────── */
  function setLoading(on) {
    const loadEl = $('gastos-loading');
    const wrapEl = $('gastos-table-wrap');
    if (loadEl) loadEl.style.display = on ? 'flex' : 'none';
    if (wrapEl) wrapEl.style.display = on ? 'none' : (wrapEl.dataset.vis || 'none');
  }
 
  function resetTable() {
    $('gastos-total').textContent        = '—';
    $('gastos-sum').textContent          = 'Total: —';
    $('gastos-table-wrap').style.display = 'none';
    $('gastos-empty').style.display      = 'none';
    $('gastos-body').innerHTML           = '';
    $('gastos-table-wrap').dataset.vis   = 'none';
  }
 
  function toastErr(msg) {
    UI?.toast ? UI.toast(msg, 'error') : alert(msg);
  }
 
  /* ── Tasa BCV ───────────────────────────────────────────── */
  async function loadExchangeRate() {
    try {
      currentRate = await API.exchangeRate.getCurrent();
      renderRateInfo();
    } catch {
      currentRate = null;
      renderRateInfo();
    }
  }
 
  function renderRateInfo() {
    const el = $('gastos-rate-info');
    if (!el) return;
    if (!currentRate) {
      el.innerHTML = `<span style="color:var(--amber);font-size:12px">⚠ Sin tasa BCV configurada</span>`;
      return;
    }
    const r = Number(currentRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    el.innerHTML = `<span style="font-size:12px;color:var(--text-sub)">Tasa BCV: <strong style="color:var(--navy)">Bs. ${r}</strong></span>`;
  }
 
  /* ── Toggle de vista USD/VES ────────────────────────────── */
  function setViewCurrency(cur) {
    viewCurrency = cur;
    // Actualizar botones
    ['btn-view-usd', 'btn-view-ves'].forEach(id => {
      const btn = $(id);
      if (!btn) return;
      const isCur = (id === 'btn-view-usd' && cur === 'USD') || (id === 'btn-view-ves' && cur === 'VES');
      btn.classList.toggle('active', isCur);
    });
    // Re-renderizar con la lista guardada
    if (window._gastosListCache) renderTable(window._gastosListCache);
  }
 
  /* ── Render tabla ───────────────────────────────────────── */
  function renderTable(list) {
    window._gastosListCache = list;   // cache para toggle sin re-fetch
 
    $('gastos-total').textContent = `${list.length} gasto${list.length !== 1 ? 's' : ''}`;
 
    // Calcular suma en la moneda activa
    const suma = list.reduce((acc, g) => {
      const usd = Number(g.totalUsd ?? g.total ?? 0);
      const val = viewCurrency === 'VES'
        ? (g.totalVes != null ? Number(g.totalVes) : toVES(usd))
        : usd;
      return acc + val;
    }, 0);
    $('gastos-sum').textContent = `Total: ${fmt(suma, viewCurrency)}`;
 
    if (!list.length) {
      $('gastos-empty').style.display      = 'block';
      $('gastos-table-wrap').style.display = 'none';
      return;
    }
 
    $('gastos-empty').style.display      = 'none';
    $('gastos-table-wrap').style.display = 'block';
    $('gastos-table-wrap').dataset.vis   = 'block';
 
    $('gastos-body').innerHTML = list.map(g => {
      const totalUsd = Number(g.totalUsd ?? g.total ?? 0);
      const totalVes = g.totalVes != null ? Number(g.totalVes) : toVES(totalUsd);
      const displayTotal = viewCurrency === 'VES' ? fmtVES(totalVes) : fmtUSD(totalUsd);
      const subTotal     = viewCurrency === 'VES' ? fmtUSD(totalUsd) : (currentRate ? fmtVES(totalVes) : '—');
 
      const currencyBadge = (g.currency || 'USD') === 'VES'
        ? `<span class="badge badge-amber" style="font-size:10px">VES</span>`
        : `<span class="badge badge-blue"  style="font-size:10px">USD</span>`;
 
      return `
        <tr>
          <td>${g.idOutgoing ?? '—'}</td>
          <td style="color:var(--text-sub)">${normalizeFecha(g.date)}</td>
          <td>${TYPE_LABELS[(g.type || '').toUpperCase()] || g.type || '—'}</td>
          <td style="color:var(--text-sub);font-size:12px">${g.description || '—'}</td>
          <td style="text-align:right">
            <div style="font-weight:600">${displayTotal}</div>
            <div style="font-size:10px;color:var(--gray-text)">${subTotal}</div>
          </td>
          <td>${currencyBadge}</td>
          <td style="color:var(--text-sub)">${g.idBranch ?? '—'}</td>
        </tr>`;
    }).join('');
  }
 
  /* ── Sucursales ─────────────────────────────────────────── */
  async function loadSucursales() {
    const selForm   = $('gasto-idBranch');
    const selFilter = $('filtro-idBranch');
    if (!selForm && !selFilter) return;
 
    try {
      const raw      = await API.branches.list({ size: 100 });
      const branches = API.unwrapList(raw);
 
      if (selForm) {
        selForm.innerHTML = '<option value="">Selecciona sucursal</option>';
        branches.forEach(b => {
          const id   = b.idBranch ?? b.id;
          const name = b.name || `Sucursal ${id}`;
          selForm.add(new Option(name, id));
        });
        const branchId = Auth.getUser()?.branchId;
        if (branchId) {
          const opt = selForm.querySelector(`option[value="${branchId}"]`);
          if (opt) selForm.value = String(branchId);
        }
      }
 
      if (selFilter) {
        selFilter.innerHTML = '<option value="">Todas</option>';
        branches.forEach(b => {
          const id   = b.idBranch ?? b.id;
          const name = b.name || `Sucursal ${id}`;
          selFilter.add(new Option(name, id));
        });
      }
    } catch (err) {
      toastErr(err.message || 'No se pudieron cargar las sucursales.');
    }
  }
 
  /* ── Cargar gastos ──────────────────────────────────────── */
  async function loadGastos() {
    resetTable();
    setLoading(true);
 
    try {
      const raw  = await API.get('/outgoings?size=500&sort=idOutgoing,desc');
      let   list = API.unwrapList(raw);
 
      // Filtros client-side
      const tipo     = $('filtro-type')?.value;
      const desde    = $('filtro-dateFrom')?.value;
      const hasta    = $('filtro-dateTo')?.value;
      const sucursal = $('filtro-idBranch')?.value;
      const moneda   = $('filtro-currency')?.value;
 
      if (tipo)     list = list.filter(g => (g.type || '').toUpperCase() === tipo);
      if (sucursal) list = list.filter(g => String(g.idBranch) === String(sucursal));
      if (moneda)   list = list.filter(g => (g.currency || 'USD') === moneda);
      if (desde)    list = list.filter(g => g.date && toDateOnly(g.date) >= desde);
      if (hasta)    list = list.filter(g => g.date && toDateOnly(g.date) <= hasta);
 
      renderTable(list);
    } catch (err) {
      console.warn('[Gastos] loadGastos:', err);
      toastErr(err.message || 'Error al cargar gastos.');
    } finally {
      setLoading(false);
    }
  }
 
  /* ── Preview equivalente en tiempo real ─────────────────── */
  function updateAmountPreview() {
    const preview  = $('gasto-amount-preview');
    if (!preview) return;
 
    const amount   = parseFloat($('gasto-total')?.value) || 0;
    const currency = $('gasto-currency')?.value || 'USD';
 
    if (!currentRate || amount <= 0) {
      preview.style.display = 'none';
      return;
    }
 
    if (currency === 'VES') {
      const usd = toUSD(amount);
      preview.textContent  = `≈ ${fmtUSD(usd)}`;
      preview.style.display = '';
    } else {
      const ves = toVES(amount);
      preview.textContent  = `≈ ${fmtVES(ves)}`;
      preview.style.display = '';
    }
  }
 
  /* ── Formulario ─────────────────────────────────────────── */
  function bindForm() {
    const form = $('gastos-form');
    const btn  = $('btn-submit-gasto');
 
    $('btn-clear-gasto')?.addEventListener('click', () => {
      form.reset();
      $('gasto-amount-preview').style.display = 'none';
    });
 
    // Preview equivalente en tiempo real
    $('gasto-total')?.addEventListener('input', updateAmountPreview);
    $('gasto-currency')?.addEventListener('change', updateAmountPreview);
 
    form?.addEventListener('submit', async e => {
      e.preventDefault();
 
      const tipoEl     = $('gasto-tipo');
      const totalEl    = $('gasto-total');
      const dateEl     = $('gasto-date');
      const descEl     = $('gasto-description');
      const sucEl      = $('gasto-idBranch');
      const currencyEl = $('gasto-currency');
 
      const isValid = Validaciones.validateForm([
        { type: 'select',   input: tipoEl,  label: 'Tipo de gasto' },
        { type: 'money',    input: totalEl, label: 'Monto' },
        { type: 'required', input: dateEl,  label: 'Fecha' },
        { type: 'select',   input: sucEl,   label: 'Sucursal' }
      ]);
      if (!isValid) { UI.toast('Revisa los campos requeridos.', 'warning'); return; }
 
      const dateVal = dateEl.value;
      const today   = toDateOnly(new Date().toISOString());
      if (dateVal > today) { UI.toast('La fecha no puede ser futura.', 'warning'); return; }
 
      const currency = currencyEl?.value || 'USD';
 
      // Si el gasto es en VES y no hay tasa, alertar
      if (currency === 'VES' && !currentRate) {
        UI.toast('Configura la tasa BCV antes de registrar gastos en bolívares.', 'warning');
        return;
      }
 
      // idUser removido — el backend lo toma del JWT
      const payload = {
        idBranch:    Number(sucEl.value),
        type:        tipoEl.value,
        date:        dateToUTCIso(dateEl.value),
        total:       Number(totalEl.value),
        description: descEl.value.trim() || null,
        currency                                   // 'USD' | 'VES'
      };
 
      try {
        UI.setLoading(btn, true);
        await API.gastos.create(payload);
        UI.toast('Gasto registrado correctamente.', 'success');
        form.reset();
        $('gasto-amount-preview').style.display = 'none';
        await loadGastos();
      } catch (err) {
        toastErr(err.message || 'Error al registrar el gasto.');
      } finally {
        UI.setLoading(btn, false);
      }
    });
 
    // Filtros
    $('btn-reset-filtros')?.addEventListener('click', () => {
      $('filtro-type').value       = '';
      $('filtro-dateFrom').value   = '';
      $('filtro-dateTo').value     = '';
      $('filtro-idBranch').value   = '';
      $('filtro-currency').value   = '';
      loadGastos();
    });
 
    $('gastos-filtros')?.addEventListener('submit', e => {
      e.preventDefault();
      const desde = $('filtro-dateFrom')?.value;
      const hasta = $('filtro-dateTo')?.value;
      if (desde && hasta && desde > hasta) {
        UI.toast('La fecha "desde" no puede ser posterior a la fecha "hasta".', 'warning');
        return;
      }
      loadGastos();
    });
 
    // Toggle vista moneda
    $('btn-view-usd')?.addEventListener('click', () => setViewCurrency('USD'));
    $('btn-view-ves')?.addEventListener('click', () => setViewCurrency('VES'));
  }
 
  /* ── Init ───────────────────────────────────────────────── */
  async function init() {
    bindForm();
    resetTable();
    setLoading(true);
    await Promise.all([loadSucursales(), loadExchangeRate()]);
    await loadGastos();
  }
 
  return { init, loadGastos, setViewCurrency };
 
})();