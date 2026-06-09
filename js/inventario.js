/* ============================================================
   INVENTARIO.JS — Cervecería Cocobongo
   GET  /inventory              — lista por sucursal
   POST /inventory/entries      — entrada de stock
   POST /inventory/products/    — crear producto
   PUT  /inventory/products/{id}— editar producto
   GET  /inventory/products/{id}— obtener producto por id
   ============================================================ */
 
const Inventario = (() => {
 
  let productos        = [];
  let proveedores      = [];
  let sucursales       = [];
  let editingId        = null;
  let entradaProductoId = null;
 
  const $ = id => document.getElementById(id);
 
  /* ---- Nombre de sucursal por id ---- */
  function branchName(idBranch) {
    const b = sucursales.find(s => s.id_branch === idBranch);
    return b?.name || '—';
  }
 
  /* ---- InventoryResponseDTO → objeto normalizado ---- */
  function normalizeProduct(row) {
    if (!row) return row;
    const idBranch = row.idBranch ?? row.id_branch;
    return {
      id_product:    row.idProduct   ?? row.id_product ?? row.productId,
      name:          row.productName ?? row.name,
      description:   row.description,
      type:          row.productType ?? row.type,
      id_provider:   row.idProvider  ?? row.id_provider,
      provider_name: row.providerName ?? row.provider_name,
      cost:          row.cost,
      price:         row.price,
      id_branch:     idBranch,
      branch_name:   row.branchName  ?? row.branch_name ?? branchName(idBranch),
      stock:         row.stock       ?? row.currentStock ?? 0,
      min_stock:     row.minStock    ?? row.min_stock    ?? 0
    };
  }
 
  /* ---- Resuelve qué sucursal mostrar ---- */
  function resolveBranchId() {
    const fromFilter = $('filter-sucursal')?.value;
    if (fromFilter) return parseInt(fromFilter, 10);
    const userBranch = Auth.getUser()?.branchId;
    if (userBranch != null) return userBranch;
    if (sucursales.length) return sucursales[0].id_branch;
    return null;
  }
 
  /* ============================================================
     CARGA INICIAL
     ============================================================ */
  async function init() {
    await Promise.all([loadSucursales(), loadProveedores()]);
    await loadProductos();
    attachListeners();
  }
 
  async function loadProductos() {
    const idBranch = resolveBranchId();
    if (!idBranch) {
      renderTable([]);
      UI.toast('No hay sucursales cargadas. Verifica el backend.', 'warning');
      return;
    }
 
    const filterEl = $('filter-sucursal');
    if (filterEl && !filterEl.value) filterEl.value = String(idBranch);
 
    showTableSkeleton();
    try {
      const search = ($('search-input')?.value || '').trim();
      const data   = await API.inventory.list({ idBranch, search: search || undefined });
      productos    = API.unwrapList(data).map(normalizeProduct);
      renderTable(applyStockFilter(productos));
      updateStockBadge();
      updateMetricCards(productos);
    } catch (err) {
      UI.toast(err.message, 'error');
      renderTable([]);
    }
  }
 
  async function loadSucursales() {
    try {
      const data = await API.branches.list({ size: 200 });
      sucursales  = API.unwrapList(data).map(b => ({
        id_branch: b.id ?? b.idBranch ?? b.id_branch,
        name:      b.name
      }));
      ['filter-sucursal', 'form-sucursal', 'entrada-sucursal'].forEach(id => {
        populateSelect(id, sucursales, 'id_branch', 'name',
          id === 'filter-sucursal' ? 'Todas las sucursales' : 'Selecciona sucursal');
      });
    } catch (err) {
      UI.toast(err.message || 'No se pudieron cargar las sucursales.', 'error');
    }
  }
 
    async function loadProveedores() {
    try {
      const data = await API.providers.list();
      proveedores = API.unwrapList(data).filter(p => p.is_active !== false);
      
      const select = document.getElementById('form-proveedor');
      if (select) {
        select.innerHTML = '<option value="">Selecciona proveedor</option>' +
          proveedores.map(p => `<option value="${p.id_provider || p.idProvider || p.id}">${escapeHtml(p.name)}</option>`).join('');
      }
    } catch (err) {
      console.warn('Error loading providers:', err);
    }
  }
   /* ============================================================
     PROVIDERS FUNCTIONS
     ============================================================ */
  
  let editingProviderId = null;
  
  // Abrir modal de lista de proveedores
  async function openProveedores() {
    const modal = document.getElementById('modal-proveedores');
    if (!modal) return;
    
    modal.classList.add('open');
    await loadProvidersTable();
  }
  
  // Cargar tabla de proveedores
  async function loadProvidersTable() {
    const tbody = document.getElementById('providers-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton-line"></div></td></tr>';
    
    try {
      const data = await API.providers.list();
      const providers = API.unwrapList(data);
      
      if (!providers.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay proveedores registrados</td></tr>';
        return;
      }
      
      tbody.innerHTML = providers.map(p => `
        <tr>
          <td>${p.id_provider || p.idProvider || p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.telephone || '—')}</td>
          <td>${escapeHtml(p.email || '—')}</td>
          <td><span class="badge ${p.is_active !== false ? 'badge-green' : 'badge-red'}">${p.is_active !== false ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <div class="row-actions" style="opacity:1">
              <button class="btn btn-secondary btn-sm" onclick="Inventario.openEditProvider(${p.id_provider || p.idProvider || p.id})">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="Inventario.deleteProvider(${p.id_provider || p.idProvider || p.id}, '${escapeHtml(p.name)}')">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');
      
    } catch (err) {
      console.error('Error loading providers:', err);
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red">Error al cargar proveedores</td></tr>';
      UI.toast(err.message, 'error');
    }
  }
  
  // Abrir modal para crear proveedor
  function openCreateProvider() {
    editingProviderId = null;
    document.getElementById('proveedor-modal-title').textContent = 'Nuevo proveedor';
    document.getElementById('prov-name').value = '';
    document.getElementById('prov-telephone').value = '';
    document.getElementById('prov-email').value = '';
    document.getElementById('prov-address').value = '';
    
    // Limpiar errores
    ['prov-name', 'prov-telephone', 'prov-email'].forEach(id => {
      const input = document.getElementById(id);
      const error = document.getElementById(`${id}-error`);
      if (error) error.style.display = 'none';
      if (input) input.classList.remove('error');
    });
    
    document.getElementById('modal-proveedor-form').classList.add('open');
  }
  
  // Abrir modal para editar proveedor
  async function openEditProvider(id) {
    editingProviderId = id;
    document.getElementById('proveedor-modal-title').textContent = 'Editar proveedor';
    
    try {
      const provider = await API.providers.get(id);
      
      document.getElementById('prov-name').value = provider.name || '';
      document.getElementById('prov-telephone').value = provider.telephone || '';
      document.getElementById('prov-email').value = provider.email || '';
      document.getElementById('prov-address').value = provider.address || '';
      
      document.getElementById('modal-proveedor-form').classList.add('open');
      
    } catch (err) {
      UI.toast(err.message || 'Error al cargar proveedor', 'error');
    }
  }
  
  // Guardar proveedor (crear o editar)
  async function saveProvider() {
    const name = document.getElementById('prov-name')?.value.trim() || '';
    const telephone = document.getElementById('prov-telephone')?.value.trim() || null;
    const email = document.getElementById('prov-email')?.value.trim() || null;
    const address = document.getElementById('prov-address')?.value.trim() || null;
    
    // Validar nombre
    if (!name) {
      const error = document.getElementById('prov-name-error');
      if (error) {
        error.style.display = 'flex';
        error.querySelector('.err-text').textContent = 'El nombre es obligatorio';
      }
      return;
    }
    
    const btn = document.getElementById('btn-save-provider');
    const originalText = btn.textContent;
    UI.setLoading(btn, true);
    
    try {
      if (editingProviderId) {
        await API.providers.update(editingProviderId, { name, telephone, email, address });
        UI.toast('Proveedor actualizado correctamente', 'success');
      } else {
        await API.providers.create({ name, telephone, email, address });
        UI.toast('Proveedor creado correctamente', 'success');
      }
      
      closeProveedorFormModal();
      await loadProvidersTable();
      await loadProveedores(); // Recargar select en formulario de producto
      
    } catch (err) {
      UI.toast(err.message || 'Error al guardar proveedor', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }
  
  // Eliminar (desactivar) proveedor
  async function deleteProvider(id, name) {
    if (!confirm(`¿Desactivar el proveedor "${name}"?`)) return;
    
    try {
      await API.providers.remove(id);
      UI.toast('Proveedor desactivado correctamente', 'success');
      await loadProvidersTable();
      await loadProveedores();
    } catch (err) {
      UI.toast(err.message || 'Error al desactivar proveedor', 'error');
    }
  }
  
  // Función auxiliar para escapar HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ============================================================
     RENDER TABLA
     ============================================================ */
  function renderTable(data) {
    const tbody   = $('products-tbody');
    const empty   = $('empty-state');
    const countEl = $('count-label');
    if (!tbody) return;
 
    if (!data || data.length === 0) {
      tbody.innerHTML = '';
      if (empty)   empty.style.display   = 'flex';
      if (countEl) countEl.textContent   = '0 productos';
      return;
    }
 
    if (empty)   empty.style.display   = 'none';
    if (countEl) countEl.textContent   = `${data.length} producto${data.length !== 1 ? 's' : ''}`;
 
    tbody.innerHTML = data.map(buildRow).join('');
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      tr.style.animationDelay = `${i * 25}ms`;
      tr.classList.add('row-fade-in');
    });
  }
 
  function buildRow(p) {
    const stock    = p.stock     ?? 0;
    const minStock = p.min_stock ?? 0;
    const isEmpty  = stock === 0;
    const isLow    = !isEmpty && stock <= minStock;
 
    const statusBadge = isEmpty
      ? `<span class="badge badge-red">Sin stock</span>`
      : isLow
        ? `<span class="badge badge-amber">Stock bajo ⚠</span>`
        : `<span class="badge badge-green">✓ OK</span>`;
 
    const stockCls = isEmpty ? 'num-red' : isLow ? 'num-amber' : 'num-green';
 
    const tipoBadge = {
      RESALE: `<span class="badge badge-blue">Reventa</span>`,
      SUPPLY: `<span class="badge badge-gray">Insumo</span>`,
      MADE:   `<span class="badge badge-navy">Elaborado</span>`
    }[p.type] || `<span class="badge badge-gray">${esc(p.type || '—')}</span>`;
 
    return `
      <tr data-id="${p.id_product}">
        <td><span class="badge badge-gray">#${p.id_product}</span></td>
        <td>
          <p class="fw-500" style="color:var(--text-main);margin-bottom:2px">${esc(p.name || '—')}</p>
          ${p.description ? `<p style="font-size:11px;color:var(--gray-text)">${esc(p.description)}</p>` : ''}
        </td>
        <td>${tipoBadge}</td>
        <td style="color:var(--text-sub)">${esc(p.provider_name || '—')}</td>
        <td class="text-right mono" style="color:var(--gray-text)">${p.cost  != null ? '$' + fmt(p.cost)  : '—'}</td>
        <td class="text-right mono fw-500" style="color:var(--navy)">${p.price != null ? '$' + fmt(p.price) : '—'}</td>
        <td>
          <div class="stock-display">
            <span class="stock-num ${stockCls}">${stock}</span>
            <span class="stock-min-label">mín. ${minStock}</span>
            ${isLow || isEmpty ? `
              <div class="stock-bar-wrap">
                <div class="stock-bar-fill" style="width:${isEmpty ? 0 : Math.min((stock / Math.max(minStock,1))*100,100)}%;
                     background:${isEmpty ? 'var(--red)' : 'var(--amber)'}"></div>
              </div>` : ''}
          </div>
        </td>
        <td style="color:var(--text-sub)">${esc(p.branch_name || '—')}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-secondary btn-sm"
                    onclick="Inventario.openEntrada(${p.id_product})">+ Stock</button>
            <button class="btn btn-secondary btn-sm"
                    onclick="Inventario.openEdit(${p.id_product})">Editar</button>
          </div>
        </td>
      </tr>`;
  }
 
  function showTableSkeleton() {
    const tbody = $('products-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(6).fill(0).map(() =>
      `<tr>${Array(10).fill(0).map(() =>
        `<td><div class="skeleton-line"></div></td>`).join('')}</tr>`
    ).join('');
  }
 
  function updateStockBadge() {
    const low = productos.filter(p => (p.stock ?? 0) <= (p.min_stock ?? 0)).length;
    const el  = $('badge-stock');
    if (el) { el.textContent = low; el.style.display = low > 0 ? 'inline-block' : 'none'; }
 
    const alertEl = $('stock-global-alert');
    if (alertEl) {
      alertEl.style.display = low > 0 ? 'flex' : 'none';
      const countNode = alertEl.querySelector('#stock-alert-count');
      if (countNode) countNode.textContent = `${low} producto${low !== 1 ? 's' : ''}`;
    }
  }
 
  function updateMetricCards(data) {
    setText('metric-total', data.length);
    setText('metric-low',   data.filter(p => (p.stock??0) <= (p.min_stock??0) && (p.stock??0) > 0).length);
    setText('metric-empty', data.filter(p => (p.stock??0) === 0).length);
  }
 
  function applyStockFilter(data) {
    const f = $('filter-stock')?.value || '';
    if (!f) return data;
    return data.filter(p => {
      const s = p.stock ?? 0, ms = p.min_stock ?? 0;
      return (f === 'ok'    && s > ms)        ||
             (f === 'low'   && s <= ms && s > 0) ||
             (f === 'empty' && s === 0);
    });
  }
 
  /* ============================================================
     MODAL CREAR PRODUCTO — POST /inventory/products/
     ============================================================ */
  function openCreate() {
    editingId = null;
    resetForm('product-form');
    $('modal-product-title').textContent = 'Nuevo producto';
    $('btn-save-product').textContent    = 'Guardar producto';
    clearAllErrors('product-form');
    $('form-type')?.dispatchEvent(new Event('change'));
    openModal('modal-product');
    setTimeout(() => $('form-name')?.focus(), 150);
  }
 
  /* ============================================================
     MODAL EDITAR PRODUCTO — GET /inventory/products/{id}
                           — PUT /inventory/products/{id}
     ============================================================ */
  async function openEdit(id) {
    editingId = id;
    $('modal-product-title').textContent = 'Editar producto';
    $('btn-save-product').textContent    = 'Guardar cambios';
 
    // Primero intentar desde la lista local
    let p = productos.find(x => x.id_product === id);
 
    // Si no tiene todos los datos, buscar en el back
    if (!p || p.cost == null) {
      try {
        UI.setLoading($('btn-save-product'), true);
        const raw = await API.get(`/inventory/products/${id}`);
        const prod = raw?.data ?? raw;
        p = {
          id_product:  prod.idProduct,
          name:        prod.name,
          description: prod.description,
          type:        prod.type,
          id_provider: prod.providerId,
          cost:        prod.cost,
          price:       prod.price
        };
      } catch (err) {
        UI.toast(err.message || 'No se pudo cargar el producto.', 'error');
        return;
      } finally {
        UI.setLoading($('btn-save-product'), false);
      }
    }
 
    setVal('form-name',        p.name        || '');
    setVal('form-description', p.description || '');
    setVal('form-type',        p.type        || 'RESALE');
    setVal('form-proveedor',   p.id_provider || '');
    setVal('form-cost',        p.cost        ?? '');
    setVal('form-price',       p.price       ?? '');
 
    clearAllErrors('product-form');
    $('form-type')?.dispatchEvent(new Event('change'));
    openModal('modal-product');
  }
 
  /* ============================================================
     GUARDAR PRODUCTO (crear o editar)
     ============================================================ */
 async function saveProduct() {
  // Validar campos obligatorios
  const nameEl = $('form-name');
  const costEl = $('form-cost');
  const priceEl = $('form-price');
  const sucursalEl = $('form-sucursal');

  let ok = true;

  if (!nameEl?.value.trim()) {
    showFieldError('form-name-error', 'El nombre es obligatorio');
    nameEl?.classList.add('is-invalid');
    ok = false;
  } else {
    clearFieldError('form-name-error');
    nameEl?.classList.remove('is-invalid');
  }

  if (costEl?.value === '' || costEl?.value < 0) {
    showFieldError('form-cost-error', 'El costo es obligatorio');
    costEl?.classList.add('is-invalid');
    ok = false;
  } else {
    clearFieldError('form-cost-error');
    costEl?.classList.remove('is-invalid');
  }

  if (priceEl?.value === '' || priceEl?.value < 0) {
    showFieldError('form-price-error', 'El precio es obligatorio');
    priceEl?.classList.add('is-invalid');
    ok = false;
  } else {
    clearFieldError('form-price-error');
    priceEl?.classList.remove('is-invalid');
  }

  if (!sucursalEl?.value) {
    showFieldError('form-sucursal-error', 'Selecciona una sucursal');
    sucursalEl?.classList.add('is-invalid');
    ok = false;
  } else {
    clearFieldError('form-sucursal-error');
    sucursalEl?.classList.remove('is-invalid');
  }

  if (!ok) return;

  const btn = $('btn-save-product');
  UI.setLoading(btn, true);

  const providerId = getVal('form-proveedor');
  const branchId = parseInt(getVal('form-sucursal'), 10);
  const minStock = parseInt(getVal('form-min-stock')) || 0;

  // Payload CORRECTO - ahora con branchId como Integer
  const payload = {
    name: getVal('form-name').trim(),
    description: getVal('form-description').trim() || null,
    type: getVal('form-type') || 'RESALE',
    providerId: providerId ? parseInt(providerId, 10) : null,
    cost: parseFloat(getVal('form-cost')) || 0,
    price: parseFloat(getVal('form-price')) || 0,
    isActive: true,
    branchId: branchId,           // ← AHORA SOLO EL ID
    initialStock: 0,              // Stock inicial en 0
    minStock: minStock
  };

  console.log('Payload enviado:', payload); // Para debug

  try {
    if (editingId) {
      await API.put(`/inventory/products/${editingId}`, payload);
      UI.toast('Producto actualizado correctamente.', 'success');
    } else {
      await API.post('/inventory/products', payload);
      UI.toast('Producto creado correctamente.', 'success');
    }
    closeModal('modal-product');
    await loadProductos();
  } catch (err) {
    console.error('Error:', err);
    UI.toast(err.message || 'Error al guardar el producto.', 'error');
  } finally {
    UI.setLoading(btn, false);
  }
}
 
  /* ============================================================
     MODAL ENTRADA DE INVENTARIO — POST /inventory/entries
     Solo acepta reason: PURCHASE | ADJUSTMENT
     ============================================================ */
  function openEntrada(idProducto) {
    entradaProductoId = idProducto;
    const p = productos.find(x => x.id_product === idProducto);
    resetForm('entrada-form');
    clearAllErrors('entrada-form');
 
    if (p) {
      $('entrada-producto-nombre').textContent = p.name || `Producto #${idProducto}`;
      setText('entrada-stock-actual', p.stock ?? 0);
      setVal('entrada-sucursal', p.id_branch || resolveBranchId() || '');
    }
    $('entrada-razon').value = 'PURCHASE';
    openModal('modal-entrada');
    setTimeout(() => $('entrada-cantidad')?.focus(), 150);
  }
 
  async function saveEntrada() {
    const btn        = $('btn-save-entrada');
    const cantidadEl = $('entrada-cantidad');
    const sucursalEl = $('entrada-sucursal');
 
    let ok = true;
    if (!cantidadEl?.value || parseInt(cantidadEl.value) <= 0) {
      showFieldError('entrada-cantidad-error', 'Ingresa una cantidad válida mayor a 0');
      ok = false;
    } else clearFieldError('entrada-cantidad-error');
 
    if (!sucursalEl?.value) {
      showFieldError('entrada-sucursal-error', 'Selecciona una sucursal');
      ok = false;
    } else clearFieldError('entrada-sucursal-error');
 
    if (!ok) return;
 
    // Obtener el usuario actual
    const currentUser = Auth.getUser();
    if (!currentUser || !currentUser.id) {
      UI.toast('No se pudo identificar el usuario actual', 'error');
      return;
    }
 
    UI.setLoading(btn, true);
    try {
      // Enviar TODOS los campos requeridos
      const payload = {
        idProduct: entradaProductoId,
        idBranch:  parseInt(getVal('entrada-sucursal'), 10),
        quantity:  parseInt(getVal('entrada-cantidad'), 10),
        reason:    getVal('entrada-razon') || 'PURCHASE',
        type:      "IN",                    // ← IMPORTANTE: tipo de movimiento
      };
      
      console.log("Enviando payload:", payload);  // Para debug
      
      await API.inventory.registerEntry(payload);
      UI.toast('Entrada de inventario registrada correctamente.', 'success');
      closeModal('modal-entrada');
      await loadProductos();
    } catch (err) {
      console.error("Error:", err);
      UI.toast(err.message, 'error');
    } finally {
      UI.setLoading(btn, false);
    }
}
 
  /* ============================================================
     HELPERS
     ============================================================ */
  function attachListeners() {
    const debounce = (fn, ms) => {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    };
 
    $('search-input')?.addEventListener('input', debounce(() => loadProductos(), 350));
 
    ['filter-sucursal', 'filter-stock'].forEach(id => {
      $(id)?.addEventListener('change', () => {
        if (id === 'filter-sucursal') loadProductos();
        else renderTable(applyStockFilter(productos));
      });
    });
 
    $('btn-clear-filters')?.addEventListener('click', () => {
      $('search-input').value = '';
      $('filter-stock').value = '';
      const branch = resolveBranchId();
      if ($('filter-sucursal') && branch) $('filter-sucursal').value = String(branch);
      loadProductos();
    });
 
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });
 
    // Tipo producto → mostrar/ocultar proveedor
    $('form-type')?.addEventListener('change', e => {
      const isMade = e.target.value === 'MADE';
      const wrap   = $('proveedor-wrap');
      if (wrap) {
        wrap.classList.toggle('field-disabled', isMade);
        wrap.querySelector('select').disabled = isMade;
        if (isMade) wrap.querySelector('select').value = '';
        const nota = $('proveedor-nota');
        if (nota) nota.style.display = isMade ? 'block' : 'none';
      }
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
 
  function openModal(id)  { $(id)?.classList.add('open');    }
  function closeModal(id) { $(id)?.classList.remove('open'); }
  function resetForm(id)  { const f = $(id); if (f) f.reset(); }
 
  function clearAllErrors(formId) {
    const f = $(formId);
    if (!f) return;
    f.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
    f.querySelectorAll('.form-control').forEach(el => {
      el.classList.remove('is-invalid', 'is-valid');
    });
  }
 
  function setVal(id, val) { const el = $(id); if (el) el.value = val; }
  function getVal(id)      { return $(id)?.value || ''; }
  function setText(id, val){ const el = $(id); if (el) el.textContent = val; }
 
  function fmt(n) { return Number(n || 0).toLocaleString('es-CO'); }
 
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
  }
 
  function populateSelect(selectId, data, valKey, labelKey, defaultLabel) {
    const el = $(selectId);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = `<option value="">${defaultLabel}</option>` +
      data.map(d => `<option value="${d[valKey]}">${esc(d[labelKey])}</option>`).join('');
    if (prev) el.value = prev;
  }
 
    return {
    init,
    reload: loadProductos,
    openCreate,
    openEdit,
    saveProduct,
    openEntrada,
    saveEntrada,
    openProveedores,      // ← NUEVO
    openCreateProvider,   // ← NUEVO
    openEditProvider,     // ← NUEVO
    saveProvider,         // ← NUEVO
    deleteProvider        // ← NUEVO
  };
 
})();