/* ============================================================
   VENTAS.JS — Cocobongo
   Registro de ventas con soporte multi-moneda (USD/VES) y
   pagos múltiples simultáneos.
 
   Flujo:
     1. Seleccionar sucursal → cargar catálogo
     2. Agregar productos al carrito
     3. (Opcional) Asociar cliente
     4. Panel de pagos: añadir filas de pago hasta cubrir el total
        — cada fila: método + moneda + monto
        — barra de progreso muestra cuánto falta por cubrir
     5. Confirmar → POST /api/v1/sales
   ============================================================ */
 
const Ventas = (() => {
 
  /* ── Estado ─────────────────────────────────────────────── */
  let catalog        = [];
  let branches       = [];
  let clients        = [];
  let cart           = [];
  let payments       = [];      // [{ id, method, currency, amount }]
  let selectedClient = null;
  let currentRate    = null;    // { rate: BigDecimal, registeredAt, registeredBy }
  let paymentIdSeq   = 0;
 
  const $ = id => document.getElementById(id);
 
  /* ── Formatters ─────────────────────────────────────────── */
  const fmtUSD = n => '$' + Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtVES = n => 'Bs. ' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
 
  function fmt(amount, currency) {
    return currency === 'VES' ? fmtVES(amount) : fmtUSD(amount);
  }
 
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
 
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
 
  /* ── Conversión ─────────────────────────────────────────── */
  function toVES(usd) {
    if (!currentRate) return 0;
    return usd * currentRate.rate;
  }
 
  function toUSD(ves) {
    if (!currentRate || currentRate.rate === 0) return 0;
    return ves / currentRate.rate;
  }
 
  /* ── Normalizar producto ────────────────────────────────── */
  function normalizeProduct(raw) {
    const id = raw.idProduct ?? raw.id ?? raw.productId;
    return {
        id,
        name:     raw.productName ?? raw.name ?? 'Producto',
        price:    Number(raw.price ?? 0),
        cost:     Number(raw.cost ?? 0),        // ← AÑADIR: costo del producto
        priceVes: raw.priceVes ? Number(raw.priceVes) : null,
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
 
  /* ── Precio VES efectivo del producto ───────────────────── */
  function getProductPriceVes(product) {
  if (product.priceVes && product.priceVes > 0) return product.priceVes;
  if (!currentRate) return 0;
  const raw = product.price * (currentRate.rate + 5);
  return Math.ceil(raw / 10) * 10;
}
 
  /* ============================================================
     INIT
  ============================================================ */
  async function init() {
    await loadExchangeRate();
    await loadBranches();
    await loadCatalog();
    await loadClients();
    initPaymentPanel();
    attachListeners();
    renderCart();
  }
 
  function resolveBranchId() {
    const sel = $('sucursal-sel')?.value;
    if (sel) return parseInt(sel, 10);
    return Auth.getUser()?.branchId ?? branches[0]?.id ?? null;
  }
 
  /* ============================================================
     TASA BCV
  ============================================================ */
  async function loadExchangeRate() {
    try {
      currentRate = await API.exchangeRate.getCurrent();
      renderRateBadge();
    } catch {
      currentRate = null;
      renderRateBadge();
    }
  }
 
  function renderRateBadge() {
    const el = $('rate-badge');
    if (!el) return;
    if (!currentRate) {
      el.innerHTML = `<span class="rate-warning">⚠ Sin tasa BCV</span>`;
      return;
    }
    const formatted = Number(currentRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    el.innerHTML = `
      <span class="rate-label">Tasa BCV</span>
      <span class="rate-value">Bs. ${formatted}</span>
      <button class="rate-edit-btn" onclick="Ventas.openRateModal()" title="Actualizar tasa">✏</button>
    `;
  }
 
  function openRateModal() {
    const modal = $('modal-rate');
    if (!modal) return;
    if (currentRate) $('rate-input').value = currentRate.rate;
    modal.classList.add('open');
    setTimeout(() => $('rate-input')?.focus(), 150);
  }
 
  async function saveRate() {
    const val = parseFloat($('rate-input')?.value);
    if (!val || val <= 0) { UI.toast('Ingresa una tasa válida mayor que cero.', 'error'); return; }
    const btn = $('btn-save-rate');
    UI.setLoading(btn, true);
    try {
      currentRate = await API.exchangeRate.update(val);
      renderRateBadge();
      $('modal-rate').classList.remove('open');
      UI.toast('Tasa BCV actualizada correctamente.', 'success');
      // Refrescar precios VES en el carrito
      renderCart();
      renderCatalogList(catalog);
      refreshPaymentAmounts();
    } catch (err) {
      UI.toast(err.message || 'Error al actualizar la tasa.', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }
 
  /* ============================================================
     CARGAR DATOS
  ============================================================ */
  async function loadBranches() {
    try {
      const data = await API.branches.list({ size: 100 });
      branches = API.unwrapList(data).map(b => ({ id: b.id ?? b.idBranch, name: b.name }));
      const sel = $('sucursal-sel');
      if (!sel) return;
      sel.innerHTML = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
      const userBranch = Auth.getUser()?.branchId;
      if (userBranch) sel.value = String(userBranch);
    } catch {
      UI.toast('No se pudieron cargar las sucursales.', 'error');
    }
  }
 
  async function loadCatalog() {
    const idBranch = resolveBranchId();
    if (!idBranch) { renderCatalogList([]); return; }
    try {
      const data = await API.inventory.list({ idBranch });
      catalog = API.unwrapList(data).map(normalizeProduct);
      renderCatalogList(catalog);
    } catch {
      UI.toast('No se pudo cargar el catálogo.', 'error');
      catalog = [];
      renderCatalogList([]);
    }
  }
 
  async function loadClients(search = '') {
    try {
      const data = await API.clients.list({ search: search || undefined, size: 100 });
      clients = API.unwrapList(data).map(normalizeClient);
    } catch { clients = []; }
  }
 
  /* ============================================================
     CATÁLOGO
  ============================================================ */
  function renderCatalogList(data) {
    const container = $('catalog-list');
    const countEl   = $('catalog-count');
    if (!container) return;

    const q        = ($('product-search')?.value || '').trim().toLowerCase();
    const filtered = q ? data.filter(p => p.name.toLowerCase().includes(q)) : data;

    if (countEl) countEl.textContent = `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
        container.innerHTML = `<p style="font-size:13px;color:var(--gray-text);text-align:center;padding:20px">
            ${q ? `Sin resultados para "${esc(q)}"` : 'No hay productos con stock en esta sucursal'}
        </p>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const reserved  = cart.find(i => i.product.id === p.id)?.quantity || 0;
        const available = p.stock - reserved;
        const priceVes  = getProductPriceVes(p);  // ← Ahora usa el costo correctamente
        const noStock   = available <= 0;

        return `
            <div class="catalog-item" data-product-id="${p.id}">
                <div class="catalog-item-info">
                    <div class="catalog-item-name">${esc(p.name)}</div>
                    <div class="catalog-item-prices">
                        <span class="price-usd">${fmtUSD(p.price)}</span>
                        ${currentRate ? `<span class="price-ves">${fmtVES(priceVes)}</span>` : ''}
                    </div>
                </div>
                <div class="catalog-item-right">
                    <span class="stock-chip ${available <= p.minStock ? 'stock-low' : 'stock-ok'}">
                        ${available <= 0 ? '✕ Agotado' : `${available} uds`}
                    </span>
                    <button class="btn btn-primary btn-sm add-product-btn" data-id="${p.id}"
                            ${noStock ? 'disabled' : ''}
                            style="margin-top:4px;padding:4px 12px;font-size:11px">
                        ${noStock ? 'Sin stock' : '+ Agregar'}
                    </button>
                </div>
            </div>`;
    }).join('');

    container.querySelectorAll('.add-product-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', e => { 
            e.stopPropagation(); 
            addProduct(parseInt(btn.dataset.id, 10)); 
        });
    });
}
 
  /* ============================================================
     CARRITO
  ============================================================ */
  function addProduct(id) {
    const product  = catalog.find(p => p.id === id);
    if (!product) return;
    const existing = cart.find(i => i.product.id === id);
    const currentQty = existing ? existing.quantity : 0;
 
    if (currentQty >= product.stock) {
      UI.toast(`Sin más unidades de ${product.name}.`, 'error'); return;
    }
 
    if (existing) existing.quantity++;
    else cart.push({ product, quantity: 1 });
 
    renderCart();
    renderCatalogList(catalog);
    syncDefaultPayment();
    UI.toast(`${product.name} agregado.`, 'success', 1200);
  }
 
  function changeQty(idx, val) {
    const n   = parseInt(val, 10);
    const max = cart[idx].product.stock;
    cart[idx].quantity = isNaN(n) || n < 1 ? 1 : Math.min(n, max);
    renderCart();
    renderCatalogList(catalog);
    syncDefaultPayment();
  }
 
  function removeItem(idx) {
    cart.splice(idx, 1);
    renderCart();
    renderCatalogList(catalog);
    syncDefaultPayment();
  }
 
  function clearCart() {
    cart        = [];
    payments    = [];
    selectedClient = null;
    if ($('product-search')) $('product-search').value = '';
    clearClient();
    $('stock-error').style.display = 'none';
    renderCart();
    renderCatalogList(catalog);
    renderPaymentPanel();
  }
 
  function cartTotal() {
    return cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
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
        const over    = item.quantity > item.product.stock;
        if (over) hasStockIssue = true;
        const priceVes  = getProductPriceVes(item.product);  // ← Precio VES correcto
        const totalVes  = priceVes * item.quantity;

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
                <td style="text-align:right">
                    <span style="color:var(--navy);font-weight:600">${fmtUSD(item.product.price)}</span>
                    ${currentRate ? `<br><span style="color:var(--gray-text);font-size:11px">${fmtVES(priceVes)}</span>` : ''}
                </td>
                <td style="text-align:right">
                    <span style="font-weight:500">${fmtUSD(item.product.price * item.quantity)}</span>
                    ${currentRate ? `<br><span style="color:var(--gray-text);font-size:11px">${fmtVES(totalVes)}</span>` : ''}
                </td>
                <td style="text-align:center">
                    <button type="button" class="remove-item" onclick="Ventas.removeItem(${idx})">✕</button>
                </td>
            </tr>`;
    }).join('');

    $('stock-error').style.display = hasStockIssue ? 'flex' : 'none';
    recalculate();
}
 
  function recalculate() {
    const total = cartTotal();
    const units = cart.reduce((s, i) => s + i.quantity, 0);
    if ($('total-display'))     $('total-display').textContent     = fmtUSD(total);
    if ($('total-ves-display')) {
      $('total-ves-display').textContent = currentRate ? fmtVES(toVES(total)) : '—';
    }
    if ($('total-items-label')) $('total-items-label').textContent = `${units} producto${units !== 1 ? 's' : ''}`;
    if ($('items-count'))       $('items-count').textContent       = `${cart.length} item${cart.length !== 1 ? 's' : ''}`;
  }
 
  /* ============================================================
     PANEL DE PAGOS MÚLTIPLES
  ============================================================ */
  const METHODS = [
    { value: 'CASH',      label: 'Efectivo',   icon: '💵' },
    { value: 'BCV',       label: 'BCV',        icon: '🏦' },
    { value: 'BINANCE',   label: 'Binance',    icon: '🔶' },
    { value: 'BANCRECER', label: 'Bancrecer',  icon: '💳' },
    { value: 'CREDIT',    label: 'Crédito',    icon: '📋' }
  ];
 
  function initPaymentPanel() {
    payments = [];
    renderPaymentPanel();
  }
 
  // Cuando cambia el carrito, sincroniza el primer pago por defecto
  function syncDefaultPayment() {
    const total = cartTotal();
    if (total === 0) { payments = []; renderPaymentPanel(); return; }
 
    if (payments.length === 0) {
      payments = [{ id: ++paymentIdSeq, method: 'CASH', currency: 'USD', amount: total }];
    } else {
      // Actualizar el primer pago si aún no fue tocado manualmente
      if (payments[0]._auto) {
        payments[0].amount = payments[0].currency === 'VES' ? toVES(total) : total;
      }
    }
    renderPaymentPanel();
  }
 
  function addPaymentRow() {
    const remaining = calcRemainingUSD();
    if (remaining <= 0) { UI.toast('El total ya está completamente cubierto.', 'info'); return; }
    payments.push({ id: ++paymentIdSeq, method: 'CASH', currency: 'USD', amount: Math.max(0, remaining) });
    renderPaymentPanel();
  }
 
  function removePaymentRow(id) {
    payments = payments.filter(p => p.id !== id);
    renderPaymentPanel();
  }
 
  function updatePaymentField(id, field, value) {
    const p = payments.find(x => x.id === id);
    if (!p) return;
    p._auto = false;   // marcado como editado manualmente
 
    if (field === 'currency' && p.currency !== value) {
      // Convertir monto al cambiar de moneda
      if (value === 'VES' && p.currency === 'USD') p.amount = toVES(p.amount);
      if (value === 'USD' && p.currency === 'VES') p.amount = parseFloat(toUSD(p.amount).toFixed(2));
      p.currency = value;
    } else if (field === 'method') {
      p.method = value;
      if (value === 'CREDIT') {
        // Crédito siempre en USD
        if (p.currency === 'VES') {
          p.amount   = parseFloat(toUSD(p.amount).toFixed(2));
          p.currency = 'USD';
        }
      }
    } else if (field === 'amount') {
      p.amount = parseFloat(value) || 0;
    }
 
    renderPaymentPanel();
  }
 
  function calcPaidUSD() {
    return payments.reduce((s, p) => {
      const amtUsd = p.currency === 'VES' ? toUSD(p.amount) : p.amount;
      return s + (parseFloat(amtUsd) || 0);
    }, 0);
  }
 
  function calcRemainingUSD() {
    return Math.max(0, cartTotal() - calcPaidUSD());
  }
 
  function refreshPaymentAmounts() {
    // Cuando cambia la tasa BCV, reconvertir los montos VES en pantalla
    renderPaymentPanel();
  }
 
  function renderPaymentPanel() {
    const container = $('payments-panel');
    if (!container) return;
 
    const total     = cartTotal();
    const paidUSD   = calcPaidUSD();
    const remaining = Math.max(0, total - paidUSD);
    const pct       = total > 0 ? Math.min(100, (paidUSD / total) * 100) : 0;
    const covered   = remaining < 0.01;
 
    // Barra de progreso
    const barColor  = covered ? 'var(--green)' : remaining > total * 0.5 ? 'var(--red)' : 'var(--amber)';
 
    const methodOptions = METHODS.map(m =>
      `<option value="${m.value}">${m.icon} ${m.label}</option>`
    ).join('');
 
    const rows = payments.map(p => {
      const isCredit  = p.method === 'CREDIT';
      const amountVes = p.currency === 'VES' ? p.amount : toVES(p.amount);
      const amountUsd = p.currency === 'USD' ? p.amount : toUSD(p.amount);
 
      return `
        <div class="payment-row" data-id="${p.id}">
          <div class="payment-row-fields">
 
            <select class="form-control payment-method-sel" onchange="Ventas.updatePaymentField(${p.id},'method',this.value)">
              ${METHODS.map(m => `<option value="${m.value}" ${p.method === m.value ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}
            </select>
 
            <div class="currency-toggle">
              <button class="cur-btn ${p.currency === 'USD' ? 'active' : ''}"
                      onclick="Ventas.updatePaymentField(${p.id},'currency','USD')"
                      ${isCredit ? 'disabled title="Crédito solo en USD"' : ''}>USD</button>
              <button class="cur-btn ${p.currency === 'VES' ? 'active' : ''}"
                      onclick="Ventas.updatePaymentField(${p.id},'currency','VES')"
                      ${isCredit || !currentRate ? 'disabled title="${!currentRate ? \'Configura la tasa BCV primero\' : \'Crédito solo en USD\'}"' : ''}>VES</button>
            </div>
 
            <div class="payment-amount-wrap">
              <span class="currency-prefix">${p.currency === 'VES' ? 'Bs.' : '$'}</span>
              <input type="number" class="form-control payment-amount-input"
                     step="${p.currency === 'VES' ? '10' : '0.01'}"
                     min="0" value="${p.currency === 'VES' ? Math.round(amountVes) : amountUsd.toFixed(2)}"
                     onchange="Ventas.updatePaymentField(${p.id},'amount',this.value)"/>
            </div>
 
            <div class="payment-equiv">
              ${currentRate && p.currency === 'VES' ? `≈ ${fmtUSD(amountUsd)}` :
                currentRate && p.currency === 'USD' ? `≈ ${fmtVES(amountVes)}` : ''}
            </div>
 
          </div>
 
          ${payments.length > 1
            ? `<button class="remove-payment-btn" onclick="Ventas.removePaymentRow(${p.id})" title="Eliminar pago">✕</button>`
            : '<div style="width:28px"></div>'}
        </div>`;
    }).join('');
 
    container.innerHTML = `
      <div class="payment-progress-wrap">
        <div class="payment-progress-bar-bg">
          <div class="payment-progress-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
        </div>
        <div class="payment-progress-labels">
          <span style="color:${barColor};font-weight:600">
            ${covered ? '✓ Total cubierto' : `Faltan ${fmtUSD(remaining)}`}
          </span>
          <span style="color:var(--gray-text);font-size:11px">${pct.toFixed(0)}% de ${fmtUSD(total)}</span>
        </div>
      </div>
 
      <div class="payment-rows">
        ${rows}
      </div>
 
      ${!covered ? `
        <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:10px;font-size:12px"
                onclick="Ventas.addPaymentRow()">
          + Agregar otro método de pago
        </button>` : ''}
    `;
 
    // Mostrar/ocultar sección de cliente según si hay crédito
    const hasCredit = payments.some(p => p.method === 'CREDIT');
    const clientCard = $('client-section');
    if (clientCard) clientCard.style.display = hasCredit || selectedClient ? '' : '';
    if ($('client-hint')) {
      $('client-hint').textContent = hasCredit
        ? 'Obligatorio para ventas a crédito.'
        : 'Opcional — asocia la venta a un cliente.';
    }
  }
 
  /* ============================================================
     CLIENTE
  ============================================================ */
  function renderClientSuggestions() {
    const q   = ($('client-search')?.value || '').trim().toLowerCase();
    const box = $('client-suggestions');
    if (!box || selectedClient) return;
    if (!q) { box.classList.remove('open'); return; }
 
    const results = clients
      .filter(c => c.name.toLowerCase().includes(q) || (c.telephone && c.telephone.includes(q)))
      .slice(0, 8);
 
    box.innerHTML = results.length
      ? results.map(c => `
          <div class="suggestion-item" data-client-id="${c.id}">
            <div>
              <div class="s-name">${esc(c.name)}</div>
              <div class="s-meta">${esc(c.telephone || 'Sin teléfono')} · Saldo: ${fmtUSD(c.balance)}</div>
            </div>
          </div>`).join('')
      : `<div class="suggestion-item"><span class="s-name" style="color:var(--gray-text)">Sin clientes</span></div>`;
 
    box.querySelectorAll('[data-client-id]').forEach(el => {
      el.addEventListener('click', () => selectClient(parseInt(el.dataset.clientId, 10)));
    });
    box.classList.add('open');
  }
 
  function selectClient(id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    selectedClient = c;
    if ($('client-search')) { $('client-search').value = ''; }
    $('client-suggestions')?.classList.remove('open');
    $('client-selected').style.display = '';
    $('client-name-display').textContent    = c.name;
    $('client-balance-display').textContent = `Saldo: ${fmtUSD(c.balance)}`;
    $('client-error').style.display = 'none';
  }
 
  function clearClient() {
    selectedClient = null;
    const search = $('client-search');
    if (search) { search.value = ''; }
    $('client-selected').style.display = 'none';
    $('client-suggestions')?.classList.remove('open');
  }
 
  /* ============================================================
     CONFIRMAR Y ENVIAR
  ============================================================ */
  function openConfirmModal() {
    if (cart.length === 0) { UI.toast('Agrega al menos un producto.', 'error'); return; }
    if (payments.length === 0) { UI.toast('Agrega al menos un método de pago.', 'error'); return; }
 
    const hasCredit = payments.some(p => p.method === 'CREDIT');
    if (hasCredit && !selectedClient) { $('client-error').style.display = 'flex'; return; }
 
    if (cart.some(i => i.quantity > i.product.stock)) {
      UI.toast('Ajusta las cantidades: stock insuficiente.', 'error'); return;
    }
 
    const remaining = calcRemainingUSD();
    const total     = cartTotal();
 
    // Resumen en el modal
    const methodLabels = { CASH: '💵 Efectivo', BCV: '🏦 BCV', BINANCE: '🔶 Binance', BANCRECER: '💳 Bancrecer', CREDIT: '📋 Crédito' };
 
    $('confirm-summary').innerHTML = `
      <p style="margin-bottom:10px;font-weight:600">Resumen de la venta</p>
 
      <div style="margin-bottom:12px">
        ${cart.map(i => {
          const priceVes = getProductPriceVes(i.product);
          return `
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-light);font-size:13px">
            <span>${esc(i.product.name)} × ${i.quantity}</span>
            <span style="text-align:right">
              <strong>${fmtUSD(i.product.price * i.quantity)}</strong>
              ${currentRate ? `<br><small style="color:var(--gray-text)">${fmtVES(priceVes * i.quantity)}</small>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
 
      <div style="display:flex;justify-content:space-between;padding:10px 0 6px;font-size:15px">
        <strong>Total</strong>
        <span style="text-align:right">
          <strong style="color:var(--navy)">${fmtUSD(total)}</strong>
          ${currentRate ? `<br><small style="color:var(--gray-text)">${fmtVES(toVES(total))}</small>` : ''}
        </span>
      </div>
 
      <div style="margin-top:10px;padding:10px;background:var(--gray-light);border-radius:var(--radius-sm)">
        <p style="font-size:11px;font-weight:600;color:var(--text-sub);margin-bottom:6px">PAGOS</p>
        ${payments.map(p => `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span>${methodLabels[p.method] || p.method}</span>
            <strong>${fmt(p.amount, p.currency)}</strong>
          </div>`).join('')}
        ${remaining > 0.01 ? `
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--gray-mid);color:var(--amber);font-size:12px;font-weight:600">
            ⚠ Faltan ${fmtUSD(remaining)} por cubrir — se registrará como saldo pendiente
          </div>` : ''}
      </div>
 
      ${selectedClient ? `
        <p style="font-size:12px;margin-top:8px;color:var(--text-sub)">
          Cliente: <strong>${esc(selectedClient.name)}</strong>
        </p>` : ''}
    `;
 
    $('modal-confirm').classList.add('open');
  }
 
  async function submitSale() {
    const btn = $('btn-do-confirm');
    UI.setLoading(btn, true);
    try {
      const branchId = resolveBranchId();
      const payload  = {
        clientId: selectedClient?.id ?? null,
        items: cart.map(i => ({
          productId: i.product.id,
          branchId,
          quantity:  i.quantity
        })),
        payments: payments.map(p => ({
          method:   p.method,
          currency: p.currency,
          amount:   parseFloat(p.amount) || 0
        }))
      };
 
      const response = await API.sales.create(payload);
      $('modal-confirm').classList.remove('open');
      const saleId = response?.idSale ?? '';
      UI.toast(`¡Venta${saleId ? ` #${saleId}` : ''} registrada!`, 'success');
      clearCart();
      await loadCatalog();
    } catch (err) {
      UI.toast(err.message || 'Error al registrar la venta.', 'error');
    } finally {
      UI.setLoading(btn, false);
    }
  }
 
  /* ============================================================
     LISTENERS
  ============================================================ */
  function attachListeners() {
    $('sucursal-sel')?.addEventListener('change', async () => {
      cart = []; payments = [];
      renderCart(); renderPaymentPanel();
      await loadCatalog();
    });
 
    $('product-search')?.addEventListener('input', () => renderCatalogList(catalog));
 
    $('client-search')?.addEventListener('input', debounce(async () => {
      await loadClients($('client-search').value.trim());
      renderClientSuggestions();
    }, 250));
 
    document.addEventListener('click', e => {
      if (!e.target.closest('.product-search-wrap')) {
        $('client-suggestions')?.classList.remove('open');
      }
    });
 
    $('btn-confirmar')?.addEventListener('click', openConfirmModal);
    $('btn-do-confirm')?.addEventListener('click', submitSale);
    $('btn-save-rate')?.addEventListener('click', saveRate);
 
    // Cerrar modal tasa con Esc
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $('modal-rate')?.classList.remove('open');
        $('modal-confirm')?.classList.remove('open');
      }
    });
  }
 
  /* ============================================================
     EXPORTS
  ============================================================ */
  return {
    init,
    addProduct,
    changeQty,
    removeItem,
    clearCart,
    clearClient,
    openConfirmModal,
    submitSale,
    openRateModal,
    saveRate,
    addPaymentRow,
    removePaymentRow,
    updatePaymentField
  };
 
})();