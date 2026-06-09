/* ============================================================
   GASTOS.JS — Gestión de gastos
   POST /api/v1/outgoings/register  ← OutgoingRequestDTO
   GET  /api/v1/outgoings           ← Page<OutgoingResponseDTO>
   ============================================================ */
 
const Gastos = (() => {
 
  const $ = (id) => document.getElementById(id);
 
  const TYPE_LABELS = {
    PERSONAL:    'Personal',
    MAINTENANCE: 'Mantenimiento',
    RENT:        'Arriendo',
    SERVICES:    'Servicios',
    EMPLOYEE:    'Empleados',
    OTHER:       'Otros'
  };
 
  /* ── Moneda ─────────────────────────────────────────────── */
  function formatMoney(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 2, minimumFractionDigits: 2
    }).format(v);
  }
 
  /* ── "2025-06-01T14:30:00" → "2025-06-01" ──────────────── */
  function normalizeFecha(iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 10);
  }
 
  /* ── "YYYY-MM-DDTHH:mm" (datetime-local) → "YYYY-MM-DDTHH:mm:ss" ── */
  /* La BD usa DATE (no TIMESTAMP); mandar la hora viola el constraint.
     Solo enviamos "YYYY-MM-DD". */
  /* Convierte "YYYY-MM-DD" (input type=date) a ISO 8601 UTC
     que el back deserializa como LocalDateTime sin problemas.
     Ej: "2026-05-29" → "2026-05-29T05:00:00.000Z" (hora local → UTC) */
  function dateToUTCIso(dateStr) {
    if (!dateStr) return null;
    // Construir con hora local medianoche para que toISOString() dé UTC correcto
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0).toISOString();
  }
 
  function toDateOnly(val) {
    if (!val) return '';
    return String(val).slice(0, 10);
  }
 
  /* ── Loading ────────────────────────────────────────────── */
  function setLoading(on) {
    $('gastos-loading').style.display    = on ? 'flex' : 'none';
    $('gastos-table-wrap').style.display = on ? 'none' : ($('gastos-table-wrap').dataset.vis || 'none');
  }
 
  function resetTable() {
    $('gastos-total').textContent        = '—';
    $('gastos-sum').textContent          = 'Total: $0';
    $('gastos-table-wrap').style.display = 'none';
    $('gastos-empty').style.display      = 'none';
    $('gastos-body').innerHTML           = '';
    $('gastos-table-wrap').dataset.vis   = 'none';
  }
 
  function toastErr(msg) {
    if (window.UI?.toast) UI.toast(msg, 'error');
    else alert(msg);
  }
 
  /* ── Render ─────────────────────────────────────────────── */
  function renderTable(list) {
    $('gastos-total').textContent = `${list.length} gasto(s)`;
 
    const suma = list.reduce((acc, g) => acc + Number(g.total ?? 0), 0);
    $('gastos-sum').textContent = `Total: ${formatMoney(suma)}`;
 
    if (!list.length) {
      $('gastos-empty').style.display      = 'block';
      $('gastos-table-wrap').style.display = 'none';
      return;
    }
 
    $('gastos-empty').style.display      = 'none';
    $('gastos-table-wrap').style.display = 'block';
    $('gastos-table-wrap').dataset.vis   = 'block';
 
    /* OutgoingResponseDTO: idOutgoing, idBranch, idUser, type, date, total, description */
    $('gastos-body').innerHTML = list.map(g => `
      <tr>
        <td>${g.idOutgoing ?? '—'}</td>
        <td>${normalizeFecha(g.date)}</td>
        <td>${TYPE_LABELS[(g.type || '').toUpperCase()] || g.type || '—'}</td>
        <td>${g.description || '—'}</td>
        <td class="text-right">${formatMoney(g.total ?? 0)}</td>
        <td>${g.idBranch ?? '—'}</td>
        <td>${g.idUser ?? '—'}</td>
      </tr>`).join('');
  }
 
  /* ── Sucursales ─────────────────────────────────────────── */
  async function loadSucursales() {
    const selForm   = $('gasto-idBranch');
    const selFilter = $('filtro-idBranch');
    if (!selForm || !selFilter) return;
 
    try {
      /* branches.list() → GET /api/v1/branches
         unwrapPayload ya desenvuelve ApiResponse → data (Page o array)
         unwrapList saca el array de content si es Page                  */
      const raw      = await API.branches.list({ size: 100 });
      const branches = API.unwrapList(raw);
 
      selForm.innerHTML   = '<option value="">Selecciona sucursal</option>';
      selFilter.innerHTML = '<option value="">Todas</option>';
 
      branches.forEach(b => {
        const id   = b.idBranch ?? b.id;
        const name = b.name || b.nombre || `Sucursal ${id}`;
        selForm.add(new Option(name, id));
        selFilter.add(new Option(name, id));
      });
 
      /* Pre-seleccionar la sucursal del usuario logueado */
      const branchId = Auth.getUser()?.branchId;
      if (branchId) {
        const opt = selForm.querySelector(`option[value="${branchId}"]`);
        if (opt) selForm.value = String(branchId);
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
      /* GET /api/v1/outgoings?size=500&sort=idOutgoing,desc
         Respuesta: ApiResponse<Page<OutgoingResponseDTO>>
         request() ya llama a unwrapPayload → devuelve el Page
         unwrapList saca Page.content                          */
      const raw  = await API.get('/outgoings?size=500&sort=idOutgoing,desc');
      let   list = API.unwrapList(raw);
 
      /* Filtros client-side (el endpoint no acepta params de filtro) */
      const tipo     = $('filtro-type').value;
      const desde    = $('filtro-dateFrom').value;   // datetime-local "YYYY-MM-DDTHH:mm"
      const hasta    = $('filtro-dateTo').value;
      const sucursal = $('filtro-idBranch').value;
 
      if (tipo)
        list = list.filter(g => (g.type || '').toUpperCase() === tipo);
      if (sucursal)
        list = list.filter(g => String(g.idBranch) === String(sucursal));
      if (desde)
        list = list.filter(g => g.date && toDateOnly(g.date) >= desde);
      if (hasta)
        list = list.filter(g => g.date && toDateOnly(g.date) <= hasta);
 
      renderTable(list);
    } catch (err) {
      console.warn('[Gastos] loadGastos:', err);
      toastErr(err.message || 'Error al cargar gastos.');
    } finally {
      setLoading(false);
    }
  }
 
  /* ── Formulario ─────────────────────────────────────────── */
  function bindForm() {
    const form = $('gastos-form');
    const btn  = $('btn-submit-gasto');
 
    /* Limpiar manual (el <button type="button"> no hace reset) */
    $('btn-clear-gasto').addEventListener('click', () => form.reset());
 
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
 
      const tipoEl  = $('gasto-tipo');
      const totalEl = $('gasto-total');
      const dateEl  = $('gasto-date');
      const descEl  = $('gasto-description');
      const sucEl   = $('gasto-idBranch');
 
      const isValid = Validaciones.validateForm([
        { type: 'select',   input: tipoEl,  label: 'Tipo de gasto' },
        { type: 'money',    input: totalEl, label: 'Monto' },
        { type: 'required', input: dateEl,  label: 'Fecha' },
        { type: 'select',   input: sucEl,   label: 'Sucursal' }
      ]);
      if (!isValid) { UI.toast('Revisa los campos requeridos.', 'warning'); return; }
 
      const user   = Auth.getUser();
      const idUser = user?.id ?? user?.idUser ?? user?.userId;
      if (!idUser) {
        toastErr('No se pudo identificar tu usuario. Vuelve a iniciar sesión.');
        return;
      }
 
      /* La BD tiene date DATE + chk_outgoing_date_not_future (date <= CURRENT_DATE).
         Hay que mandar SOLO "YYYY-MM-DD", nunca con hora. */
      const dateVal = dateEl.value; // "YYYY-MM-DD"
      const today   = toDateOnly(new Date().toISOString());
      if (dateVal > today) {
        UI.toast('La fecha no puede ser futura.', 'warning');
        return;
      }
 
      const payload = {
        idBranch:    Number(sucEl.value),
        idUser:      Number(idUser),
        type:        tipoEl.value,
        date:        dateToUTCIso(dateEl.value),
        total:       Number(totalEl.value),
        description: descEl.value.trim() || null
      };
 
      try {
        UI.setLoading(btn, true);
        await API.post('/outgoings/register', payload);
        UI.toast('Gasto registrado correctamente.', 'success');
        form.reset();
        await loadGastos();
      } catch (err) {
        toastErr(err.message || 'Error al registrar el gasto.');
      } finally {
        UI.setLoading(btn, false);
      }
    });
 
    /* Filtros */
    $('btn-reset-filtros').addEventListener('click', () => {
      $('filtro-type').value     = '';
      $('filtro-dateFrom').value = '';
      $('filtro-dateTo').value   = '';
      $('filtro-idBranch').value = '';
      loadGastos();
    });
 
    $('gastos-filtros').addEventListener('submit', (e) => {
      e.preventDefault();
      const desde = $('filtro-dateFrom').value;
      const hasta = $('filtro-dateTo').value;
      if (desde && hasta && desde > hasta) {
        UI.toast('La fecha "desde" no puede ser posterior a la fecha "hasta".', 'warning');
        return;
      }
      loadGastos();
    });
  }
 
  /* ── Init ───────────────────────────────────────────────── */
  async function init() {
    bindForm();
    resetTable();
    setLoading(true);
    await loadSucursales();
    await loadGastos();
  }
 
  return { init, loadGastos };
 
})();
 