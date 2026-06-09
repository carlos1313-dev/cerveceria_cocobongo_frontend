/* ============================================================
   VENTAS.JS — Registro de ventas
   POST /api/v1/sales
   RegisterSaleRequest: { paymentType, clientId, items:[{productId, quantity}] }
   ============================================================ */
 
const Ventas = (() => {
 
  let catalog        = [];
  let branches       = [];
  let clients        = [];
  let selectedMethod = null;
  let selectedClient = null;
  let cart           = [];
 
  const $ = id => document.getElementById(id);
 
  function fmt(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }
 
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }
 
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
 
  /* ---- Normaliza producto desde InventoryResponseDTO ---- */
  function normalizeProduct(raw) {
    const id = raw.idProduct ?? raw.id ?? raw.productId;
    return {
      id,
      name:     raw.productName ?? raw.name ?? 'Producto',
      price:    Number(raw.price ?? 0),
      stock:    Number(raw.stock ?? 0),
      minStock: Number(raw.minStock ?? raw.min_stock ?? 0),
      type:     raw.productType ?? raw.type
    };
  }
 
  function normalizeClient(raw) {
    return {
      id:        raw.idClient ?? raw.id,
      name:      raw.name,
      telephone: raw.telephone,
      balance:   Number(raw.balance ?? 0)
    };
  }
 
  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await loadBranches();
    await loadCatalog();
    await loadClients();
    attachListeners();
    renderCart();
//    await loadHistorial(); 
  }
 
  function resolveBranchId() {
    const sel = $('sucursal-sel')?.value;
    if (sel) return parseInt(sel, 10);
    return Auth.getUser()?.branchId ?? branches[0]?.id ?? null;
  }
 
  /* ============================================================
     CARGAR DATOS
     ============================================================ */
  async function loadBranches() {
    try {
      const data = await API.branches.list({ size: 100 });
      branches = API.unwrapList(data).map(b => ({
        id:   b.id ?? b.idBranch,
        name: b.name
      }));
      const sel = $('sucursal-sel');
      if (!sel) return;
      sel.innerHTML = branches.map(b =>
        `<option value="${b.id}">${esc(b.name)}</option>`
      ).join('');
      const userBranch = Auth.getUser()?.branchId;
      if (userBranch) sel.value = String(userBranch);
    } catch (err) {
      UI.toast('No se pudieron cargar las sucursales.', 'error');
    }
  }
 
  async function loadCatalog() {
    const idBranch = resolveBranchId();
    if (!idBranch) {
      renderCatalogList([]);
      return;
    }
    try {
      const data = await API.inventory.list({ idBranch });
      catalog = API.unwrapList(data).map(normalizeProduct);
      renderCatalogList(catalog);
    } catch (err) {
      UI.toast('No se pudo cargar el catálogo.', 'error');
      catalog = [];
      renderCatalogList([]);
    }
  }
 
  function renderCatalogList(data) {
    const container = $('catalog-list');
    const countEl   = $('catalog-count');
    if (!container) return;
 
    const q = ($('product-search')?.value || '').trim().toLowerCase();
    const filtered = q
      ? data.filter(p => p.name.toLowerCase().includes(q))
      : data;
 
    if (countEl) countEl.textContent = `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;
 
    if (!filtered.length) {
      container.innerHTML = `<p style="font-size:13px;color:var(--gray-text);text-align:center;padding:20px">
        ${q ? 'Sin resultados para "' + esc(q) + '"' : 'No hay productos con stock en esta sucursal'}
      </p>`;
      return;
    }
 
    container.innerHTML = filtered.map(p => `
      <div class="catalog-item" data-id="${p.id}" style="
        display:flex;align-items:center;justify-content:space-between;
        padding:10px 12px;border-bottom:1px solid var(--gray-light);
        cursor:pointer;transition:background var(--dur-fast);border-radius:var(--radius-sm)
      " onmouseover="this.style.background='var(--blue-pale)'"
         onmouseout="this.style.background=''">
        <div>
          <div style="font-weight:500;font-size:13px">${esc(p.name)}</div>
          <div style="font-size:11px;color:var(--gray-text);margin-top:2px">
style="color:${p.stock <= p.minStock ? 'var(--red)' : 'var(--green)'};font-weight:500" 
       </div>
        <div style="text-align:right;flex-shrink:0;margin-left:12px">
          <div style="font-weight:600;color:var(--navy)">${fmt(p.price)}</div>
          <button class="btn btn-primary btn-sm" style="margin-top:4px;padding:4px 10px;font-size:11px">
            + Agregar
          </button>
        </div>
      </div>
    `).join('');
 
    container.querySelectorAll('.catalog-item').forEach(el => {
      el.addEventListener('click', () => addProduct(parseInt(el.dataset.id, 10)));
    });
  }
 
  async function loadClients(search = '') {
    try {
      const data = await API.clients.list({ search: search || undefined, size: 100 });
      clients = API.unwrapList(data).map(normalizeClient);
    } catch {
      clients = [];
    }
  }
 
  /* ============================================================
     LISTENERS
     ============================================================ */
  function attachListeners() {
    // Cambio de sucursal → recargar catálogo
    $('sucursal-sel')?.addEventListener('change', async () => {
      cart = [];
      renderCart();
      await loadCatalog();
    });
 
    // Buscador filtra localmente
    $('product-search')?.addEventListener('input', () => {
      renderCatalogList(catalog);
    });
 
    // Métodos de pago
    document.querySelectorAll('.pay-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.pay-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        selectedMethod = pill.dataset.method;
        $('payment-error').style.display = 'none';
        updateClientHint();
      });
    });
 
    // Buscador de cliente
    $('client-search')?.addEventListener('input', debounce(async () => {
      await loadClients($('client-search').value.trim());
      renderClientSuggestions();
    }, 250));
 
    // Cerrar sugerencias al click afuera
    document.addEventListener('click', e => {
      if (!e.target.closest('.product-search-wrap')) {
        $('client-suggestions')?.classList.remove('open');
      }
    });
 
    // Confirmar venta
    $('btn-confirmar')?.addEventListener('click', openConfirmModal);
    $('btn-do-confirm')?.addEventListener('click', submitSale);
  }
 
  function updateClientHint() {
    const hint = $('client-hint');
    if (hint) {
      hint.textContent = selectedMethod === 'CREDIT'
        ? 'Obligatorio para ventas a crédito.'
        : 'Opcional — asocia la venta a un cliente.';
    }
  }
 
  /* ============================================================
     SUGERENCIAS
     ============================================================ */
  function renderProductSuggestions() {
    const q   = ($('product-search')?.value || '').trim().toLowerCase();
    const box = $('product-suggestions');
    if (!box) return;
    if (!q) { box.classList.remove('open'); return; }
 
    const results = catalog
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 12);
 
    box.innerHTML = results.length
      ? results.map(p => `
          <div class="suggestion-item" data-id="${p.id}">
            <div>
              <div class="s-name">${esc(p.name)}</div>
              <div class="s-meta">Stock: ${p.stock}</div>
            </div>
            <span class="s-price">${fmt(p.price)}</span>
          </div>`).join('')
      : `<div class="suggestion-item"><span class="s-name" style="color:var(--gray-text)">Sin resultados</span></div>`;
 
    box.querySelectorAll('.suggestion-item[data-id]').forEach(el => {
      el.addEventListener('click', () => addProduct(parseInt(el.dataset.id, 10)));
    });
    box.classList.add('open');
  }
 
  function renderClientSuggestions() {
    const q   = ($('client-search')?.value || '').trim().toLowerCase();
    const box = $('client-suggestions');
    if (!box || selectedClient) return;
    if (!q) { box.classList.remove('open'); return; }
 
    const results = clients
      .filter(c => c.name.toLowerCase().includes(q) ||
                   (c.telephone && c.telephone.includes(q)))
      .slice(0, 8);
 
    box.innerHTML = results.length
      ? results.map(c => `
          <div class="suggestion-item" data-client-id="${c.id}">
            <div>
              <div class="s-name">${esc(c.name)}</div>
              <div class="s-meta">${esc(c.telephone || 'Sin teléfono')} · Saldo: ${fmt(c.balance)}</div>
            </div>
          </div>`).join('')
      : `<div class="suggestion-item"><span class="s-name" style="color:var(--gray-text)">Sin clientes</span></div>`;
 
    box.querySelectorAll('[data-client-id]').forEach(el => {
      el.addEventListener('click', () => selectClient(parseInt(el.dataset.clientId, 10)));
    });
    box.classList.add('open');
  }
 
  /* ============================================================
     CARRITO
     ============================================================ */
  function addProduct(id) {
    const product = catalog.find(p => p.id === id);
    if (!product) return;
    if (product.stock === 0) { UI.toast('Sin stock disponible.', 'error'); return; }
 
    const existing = cart.find(i => i.product.id === id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + 1, product.stock);
    } else {
      cart.push({ product, quantity: 1 });
    }
 
    renderCart();
    UI.toast(`${product.name} agregado.`, 'success', 1200);
  }
 
  function changeQty(idx, val) {
    const n = parseInt(val, 10);
    const max = cart[idx].product.stock;
    cart[idx].quantity = isNaN(n) || n < 1 ? 1 : Math.min(n, max);
    renderCart();
  }
 
  function removeItem(idx) {
    cart.splice(idx, 1);
    renderCart();
  }
 
  function clearCart() {
    cart = [];
    selectedMethod = null;
    selectedClient = null;
    document.querySelectorAll('.pay-pill').forEach(p => p.classList.remove('selected'));
    if ($('product-search')) $('product-search').value = '';
    clearClient();
    $('stock-error').style.display = 'none';
    renderCart();
  }
 
  function renderCart() {
    const empty = $('empty-cart');
    const table = $('items-table');
    const tbody = $('items-body');
    if (!tbody) return;
 
    if (cart.length === 0) {
      if (empty) empty.style.display = '';
      if (table) table.style.display = 'none';
      recalculate();
      return;
    }
 
    if (empty) empty.style.display = 'none';
    if (table) table.style.display = '';
 
    let hasStockIssue = false;
    tbody.innerHTML = cart.map((item, idx) => {
      const over = item.quantity > item.product.stock;
      if (over) hasStockIssue = true;
      return `
        <tr class="${over ? 'out-of-stock' : ''}">
          <td>
            <div style="font-weight:500">${esc(item.product.name)}</div>
            <div style="font-size:11px;margin-top:2px;color:${item.product.stock <= item.product.minStock ? 'var(--red)' : 'var(--green)'}">
              Stock: ${item.product.stock}
            </div>
          </td>
          <td style="text-align:center">
            <input class="qty-input ${over ? 'invalid' : ''}" type="number"
                   min="1" max="${item.product.stock}" value="${item.quantity}"
                   onchange="Ventas.changeQty(${idx}, this.value)"/>
          </td>
          <td style="text-align:right;color:var(--text-sub)">${fmt(item.product.price)}</td>
          <td style="text-align:right;font-weight:500">${fmt(item.product.price * item.quantity)}</td>
          <td style="text-align:center">
            <button type="button" class="remove-item" onclick="Ventas.removeItem(${idx})">✕</button>
          </td>
        </tr>`;
    }).join('');
 
    $('stock-error').style.display = hasStockIssue ? 'flex' : 'none';
    recalculate();
  }
 
  function recalculate() {
    const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const units = cart.reduce((s, i) => s + i.quantity, 0);
    if ($('total-display'))      $('total-display').textContent = fmt(total);
    if ($('total-items-label'))  $('total-items-label').textContent = `${units} producto${units !== 1 ? 's' : ''}`;
    if ($('items-count'))        $('items-count').textContent = `${cart.length} item${cart.length !== 1 ? 's' : ''}`;
  }
 
  /* ============================================================
     CLIENTE
     ============================================================ */
  function selectClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    selectedClient = c;
    if ($('client-search')) { $('client-search').value = ''; $('client-search').style.display = 'none'; }
    $('client-suggestions')?.classList.remove('open');
    $('client-selected').style.display = '';
    $('client-name-display').textContent = c.name;
    $('client-balance-display').textContent = `Saldo: ${fmt(c.balance)}`;
    $('client-error').style.display = 'none';
  }
 
  function clearClient() {
    selectedClient = null;
    const search = $('client-search');
    if (search) { search.value = ''; search.style.display = ''; }
    $('client-selected').style.display = 'none';
    $('client-suggestions')?.classList.remove('open');
  }
 
  /* ============================================================
     CONFIRMAR Y ENVIAR VENTA
     RegisterSaleRequest: { paymentType, clientId, items:[{productId, quantity}] }
     ============================================================ */
  function openConfirmModal() {
    if (cart.length === 0) { UI.toast('Agrega al menos un producto.', 'error'); return; }
    if (!selectedMethod)   { $('payment-error').style.display = 'flex'; return; }
    if (selectedMethod === 'CREDIT' && !selectedClient) {
      $('client-error').style.display = 'flex'; return;
    }
    if (cart.some(i => i.quantity > i.product.stock)) {
      UI.toast('Ajusta las cantidades: stock insuficiente.', 'error'); return;
    }
 
    const total  = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const labels = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito' };
 
    $('confirm-summary').innerHTML = `
      <p style="margin-bottom:10px"><strong>Resumen de la venta</strong></p>
      ${cart.map(i => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gray-light)">
          <span>${esc(i.product.name)} × ${i.quantity}</span>
          <span style="font-weight:500">${fmt(i.product.price * i.quantity)}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:12px 0 4px;font-size:15px">
        <strong>Total</strong>
        <strong style="color:var(--navy)">${fmt(total)}</strong>
      </div>
      <p style="color:var(--gray-text);font-size:12px;margin-top:4px">
        Método: <strong>${labels[selectedMethod]}</strong>
        ${selectedClient ? ` · Cliente: <strong>${esc(selectedClient.name)}</strong>` : ''}
      </p>`;
 
    $('modal-confirm').classList.add('open');
  }
 
  async function submitSale() {
    const btn = $('btn-do-confirm');
    UI.setLoading(btn, true);
    try {
      const payload = {
        paymentType: selectedMethod,
        clientId:    selectedClient?.id ?? null,
        items: cart.map(i => ({
          productId: i.product.id,
          quantity:  i.quantity,
          branchId:  resolveBranchId()  // ← AGREGAR esta línea

        }))
      };
      const response = await API.sales.create(payload);
      $('modal-confirm').classList.remove('open');
      const saleId = response?.idSale ?? '';
      UI.toast(`¡Venta${saleId ? ` #${saleId}` : ''} registrada exitosamente!`, 'success');
      clearCart();
      await loadCatalog();
    } catch (err) {
      UI.toast(err.message || 'Error al registrar la venta.', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
    
  }
  async function loadHistorial() {
  const tbody = $('historial-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-text);padding:20px">Cargando...</td></tr>`;

  try {
    const branchId = resolveBranchId();
    const data = await API.sales.list({ branchId, size: 50 });
    const sales = API.unwrapList(data);

    if (!sales.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-text);padding:20px">No hay ventas registradas.</td></tr>`;
      return;
    }

    const labels = { CASH: '💵 Efectivo', CARD: '💳 Tarjeta', TRANSFER: '📱 Transferencia', CREDIT: '📋 Crédito' };
    const statusLabels = { COMPLETED: '✓ Completada', PENDING: '⏳ Pendiente', CANCELLED: '✕ Cancelada' };

    tbody.innerHTML = sales.map(s => {
      const fecha = s.saleDate
        ? new Date(s.saleDate).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';
      const productos = (s.details || []).map(d => `${d.productName} ×${d.quantity}`).join(', ') || '—';
      const status = s.status || 'COMPLETED';

      return `
        <tr>
          <td><span class="badge badge-gray">#${s.idSale}</span></td>
          <td style="font-size:12px;color:var(--text-sub)">${fecha}</td>
          <td style="font-size:12px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(productos)}</td>
          <td style="font-size:12px">${labels[s.paymentType] || s.paymentType}</td>
          <td style="font-size:12px;color:var(--text-sub)">${esc(s.clientName || 'Consumidor final')}</td>
          <td style="text-align:right;font-weight:600;color:var(--navy)">${fmt(s.total)}</td>
          <td><span class="badge ${status === 'COMPLETED' ? 'badge-green' : status === 'PENDING' ? 'badge-amber' : 'badge-red'}">${statusLabels[status] || status}</span></td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:20px">${err.message}</td></tr>`;
  }
}
 
  return {
    init,
    addProduct,
    changeQty,
    removeItem,
    clearCart,
    clearClient,
    openConfirmModal,
    submitSale,
    loadHistorial   
  };
 
})();