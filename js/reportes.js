/* ============================================================
   REPORTES.JS — Cocobongo
   Integración completa con ReportsController (nuevos y existentes)
 
   Endpoints usados:
     GET /api/v1/reports/summary?from=&to=&branchId=
     GET /api/v1/reports/sales?from=&to=&branchId=&page=&size=
     GET /api/v1/reports/daily?from=&to=&branchId=          ← NUEVO (gráfica)
     GET /api/v1/reports/peak-day?from=&to=&branchId=       ← NUEVO
     GET /api/v1/reports/by-day-of-week?from=&to=&branchId= ← NUEVO
     GET /api/v1/reports/by-provider?from=&to=&branchId=    ← NUEVO
     GET /api/v1/reports/balance?from=&to=&branchId=        ← NUEVO (unificado)
   ============================================================ */
 
const Reportes = (() => {
 
  /* ── Estado ─────────────────────────────────────────────── */
  const PAGE_SIZE = 20;
  let currentPage = 0;
  let totalPages  = 1;
  let charts      = {};   // { bar, line, dow, provider }
  let filters     = { from: '', to: '', branchId: '' };
  let currentRate = null; // tasa BCV para toggle moneda
  let viewCurrency = 'USD';
 
  const $ = id => document.getElementById(id);
 
  /* ── Formatters ─────────────────────────────────────────── */
  const fmtUSD = n => {
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return '$' + v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
 
  const fmtVES = n => {
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return 'Bs. ' + v.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };
 
  function fmt(n) {
    if (!n && n !== 0) return '—';
    if (viewCurrency === 'VES' && currentRate?.rate) {
      return fmtVES(Number(n) * currentRate.rate);
    }
    return fmtUSD(n);
  }
 
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }
 
  /* ── Rango por defecto: último mes ──────────────────────── */
  function defaultDateRange() {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
 
  function getFiltersFromForm() {
    return {
      from:     $('filter-from')?.value   || '',
      to:       $('filter-to')?.value     || '',
      branchId: $('filter-branch')?.value || ''
    };
  }
 
  function buildQueryParams(extra = {}) {
    const from     = filters.from ? `${filters.from}T00:00:00` : undefined;
    const to       = filters.to   ? `${filters.to}T23:59:59`   : undefined;
    const branchId = filters.branchId ? Number(filters.branchId) : undefined;
    return { from, to, branchId, ...extra };
  }
 
  function unwrapPage(data) {
    if (!data) return { items: [], totalPages: 0, totalElements: 0, number: 0 };
    const items = data.content || data.items || (Array.isArray(data) ? data : []);
    return {
      items,
      totalPages:    data.totalPages    ?? 1,
      totalElements: data.totalElements ?? items.length,
      number:        data.number        ?? 0
    };
  }
 
  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  }
 
  /* ── Loading helpers ────────────────────────────────────── */
  function setSummaryLoading(on) {
    document.querySelectorAll('#report-summary-cards .card').forEach(c =>
      c.classList.toggle('card-loading', on)
    );
  }
 
  function showChartLoader(loaderId, canvasId, show) {
    const l = $(loaderId), c = $(canvasId);
    if (l) l.style.display = show ? 'flex' : 'none';
    if (c) c.style.display = show ? 'none' : 'block';
  }
 
  /* ── Toggle moneda ──────────────────────────────────────── */
  async function loadExchangeRate() {
    try { currentRate = await API.exchangeRate.getCurrent(); }
    catch { currentRate = null; }
  }
 
  function setViewCurrency(cur) {
    viewCurrency = cur;
    ['btn-view-usd', 'btn-view-ves'].forEach(id => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle('active',
        (id === 'btn-view-usd' && cur === 'USD') ||
        (id === 'btn-view-ves' && cur === 'VES'));
    });
    // Re-renderizar con datos en caché sin nueva llamada al backend
    if (window._reportCache) renderAll(window._reportCache);
  }
 
  /* ============================================================
     RENDER TARJETAS DE RESUMEN
  ============================================================ */
  function renderSummary(summary, balance) {
    setText('rep-tx-count', summary?.totalSales ?? '—');
    setText('rep-income',   fmt(summary?.grossIncome   ?? 0));
    setText('rep-profit-est', fmt(summary?.estimatedProfit ?? 0));
    setText('rep-cost',     fmt(summary?.estimatedCost    ?? 0));
 
    // Balance (nuevo endpoint unificado)
    setText('rep-expenses',   fmt(balance?.totalExpenses   ?? 0));
    setText('rep-net-profit', fmt(balance?.netProfit       ?? 0));
 
    const netEl = $('rep-net-profit');
    if (netEl) {
      const val = Number(balance?.netProfit ?? 0);
      netEl.className = 'card-metric-value ' + (val >= 0 ? 'text-green' : 'text-red');
    }
 
    const marginEl = $('rep-margin');
    if (marginEl && balance?.grossMarginPct != null) {
      marginEl.textContent = Number(balance.grossMarginPct).toFixed(1) + '%';
    }
 
    renderTopProducts(summary?.topProducts ?? []);
    setSummaryLoading(false);
  }
 
  /* ============================================================
     TOP PRODUCTOS
     TopProductDTO: idProduct, productName, unitsSold (o quantitySold),
                    totalRevenue (o grossIncome), estimatedProfit
  ============================================================ */
  function renderTopProducts(list) {
    const tbody = $('top-products-body');
    const wrap  = $('top-products-wrap');
    const empty = $('top-products-empty');
    if (!tbody) return;
 
    if (!list.length) {
      if (wrap)  wrap.style.display  = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (wrap)  wrap.style.display  = 'block';
 
    tbody.innerHTML = list.map((p, i) => `
      <tr>
        <td><span class="badge badge-gray">${i + 1}</span></td>
        <td>${p.productName || '—'}</td>
        <td class="text-right">${p.unitsSold ?? p.quantitySold ?? 0}</td>
        <td class="text-right fw-600">${fmt(p.totalRevenue ?? p.grossIncome ?? 0)}</td>
        <td class="text-right" style="color:var(--green)">${fmt(p.estimatedProfit ?? 0)}</td>
      </tr>`).join('');
  }
 
  /* ============================================================
     TABLA DE VENTAS
     SaleReportDTO: idSale, saleDate, branchName, registeredBy,
                    clientName, status, total
     (paymentType ya no existe — reemplazado por payments[])
  ============================================================ */
  function renderSalesTable(pageData) {
    showChartLoader('sales-table-loading', null, false);
    const table = $('sales-report-table');
    const empty = $('sales-table-empty');
    const tbody = $('sales-report-body');
    const pag   = $('sales-pagination');
 
    if (!pageData.items.length) {
      if (table) table.style.display = 'none';
      if (pag)   pag.style.display   = 'none';
      if (empty) empty.style.display = 'block';
      setText('sales-page-info', '0 ventas');
      return;
    }
 
    if (empty) empty.style.display = 'none';
    if (table) table.style.display = 'table';
    if (pag)   pag.style.display   = 'flex';
 
    const STATUS_BADGE = {
      COMPLETED: 'badge-green',
      PENDING:   'badge-amber',
      CANCELLED: 'badge-red'
    };
    const STATUS_LABEL = { COMPLETED: 'Completada', PENDING: 'Pendiente', CANCELLED: 'Cancelada' };
 
    tbody.innerHTML = pageData.items.map(row => {
      const status = row.status || 'COMPLETED';
      return `
        <tr>
          <td><span class="badge badge-gray">#${row.idSale ?? '—'}</span></td>
          <td style="color:var(--text-sub)">${formatDate(row.saleDate)}</td>
          <td>${row.clientName || 'Consumidor final'}</td>
          <td style="color:var(--text-sub)">${row.branchName || '—'}</td>
          <td class="text-right fw-600" style="color:var(--navy)">${fmt(row.total ?? 0)}</td>
          <td style="color:var(--text-sub);font-size:12px">${row.registeredBy || '—'}</td>
          <td><span class="badge ${STATUS_BADGE[status] || 'badge-gray'}">${STATUS_LABEL[status] || status}</span></td>
        </tr>`;
    }).join('');
 
    currentPage = pageData.number;
    totalPages  = Math.max(1, pageData.totalPages);
    setText('sales-page-info', `${pageData.totalElements} venta(s) · Pág. ${currentPage + 1}/${totalPages}`);
    setText('pagination-label', `Página ${currentPage + 1} de ${totalPages}`);
    const prev = $('btn-prev-page'), next = $('btn-next-page');
    if (prev) prev.disabled = currentPage <= 0;
    if (next) next.disabled = currentPage >= totalPages - 1;
  }
 
  /* ============================================================
     GRÁFICA: INGRESOS VS GASTOS vs UTILIDAD NETA (barras)
     NetBalanceDTO: grossIncome, estimatedProfit, totalExpenses, netProfit
  ============================================================ */
  function renderBalanceChart(balance) {
    showChartLoader('bar-chart-loading', 'income-expense-chart', false);
    destroyChart('bar');
 
    const canvas = $('income-expense-chart');
    if (!canvas || !balance) return;
 
    const ingresos  = Number(balance.grossIncome     ?? 0);
    const utilBruta = Number(balance.estimatedProfit ?? 0);
    const gastos    = Number(balance.totalExpenses   ?? 0);
    const utilNeta  = Number(balance.netProfit       ?? 0);
 
    const toDisplay = v => viewCurrency === 'VES' && currentRate?.rate
      ? v * currentRate.rate : v;
 
    charts.bar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Utilidad bruta', 'Gastos', 'Utilidad neta'],
        datasets: [{
          label: viewCurrency === 'VES' ? 'Monto (Bs.)' : 'Monto (USD)',
          data: [ingresos, utilBruta, gastos, utilNeta].map(toDisplay),
          backgroundColor: ['#27AE60', '#2C5F8A', '#E74C3C', utilNeta >= 0 ? '#1A7A4A' : '#E74C3C'],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => fmt(viewCurrency === 'VES' && currentRate?.rate ? ctx.parsed.y / currentRate.rate : ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => abbrev(v) },
            grid: { color: 'rgba(203,213,225,0.4)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
 
    // Desglose de gastos por tipo
    renderExpenseBreakdown(balance.expensesByType ?? []);
  }
 
  function renderExpenseBreakdown(list) {
    const wrap  = $('expense-breakdown-wrap');
    const tbody = $('expense-breakdown-body');
    if (!tbody || !wrap) return;
 
    if (!list.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
 
    const TYPE_LABELS = {
      PERSONAL: 'Personal', MAINTENANCE: 'Mantenimiento',
      RENT: 'Arriendo', SERVICES: 'Servicios',
      EMPLOYEE: 'Empleados', OTHER: 'Otros'
    };
 
    tbody.innerHTML = list.map(e => `
      <tr>
        <td>${TYPE_LABELS[e.type] || e.type}</td>
        <td class="text-right fw-600" style="color:var(--red)">${fmt(e.total ?? 0)}</td>
      </tr>`).join('');
  }
 
  /* ============================================================
     GRÁFICA: TENDENCIA DIARIA (línea) — DaySummaryDTO[]
     DaySummaryDTO: saleDay, totalSales, grossIncome, estimatedProfit
  ============================================================ */
  function renderDailyChart(dailyList) {
    showChartLoader('line-chart-loading', 'period-trend-chart', false);
    destroyChart('line');
 
    const canvas = $('period-trend-chart');
    if (!canvas || !dailyList?.length) return;
 
    const toDisplay = v => viewCurrency === 'VES' && currentRate?.rate ? v * currentRate.rate : v;
 
    const labels   = dailyList.map(d => d.saleDay || '');
    const ingresos = dailyList.map(d => toDisplay(Number(d.grossIncome      ?? 0)));
    const utilidad = dailyList.map(d => toDisplay(Number(d.estimatedProfit  ?? 0)));
 
    charts.line = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ingresos',
            data: ingresos,
            borderColor: '#27AE60',
            backgroundColor: 'rgba(39,174,96,0.08)',
            tension: 0.35, fill: true, pointRadius: 3, pointHoverRadius: 6
          },
          {
            label: 'Utilidad estimada',
            data: utilidad,
            borderColor: '#2C5F8A',
            backgroundColor: 'rgba(44,95,138,0.05)',
            tension: 0.35, fill: false, pointRadius: 3, pointHoverRadius: 6,
            borderDash: [4, 3]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(viewCurrency === 'VES' && currentRate?.rate ? ctx.parsed.y / currentRate.rate : ctx.parsed.y)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => abbrev(v) }, grid: { color: 'rgba(203,213,225,0.4)' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } }
        }
      }
    });
  }
 
  /* ============================================================
     GRÁFICA: DÍA DE LA SEMANA (barras horizontales)
     DayOfWeekSummaryDTO: dayOfWeek, dayName, totalSales, grossIncome
  ============================================================ */
  function renderDayOfWeekChart(dowList) {
    const wrap   = $('dow-chart-wrap');
    const canvas = $('dow-chart');
    destroyChart('dow');
    if (!wrap || !canvas || !dowList?.length) { if (wrap) wrap.style.display = 'none'; return; }
 
    wrap.style.display = 'block';
    const toDisplay = v => viewCurrency === 'VES' && currentRate?.rate ? v * currentRate.rate : v;
 
    charts.dow = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: dowList.map(d => d.dayName),
        datasets: [
          {
            label: 'Ingresos',
            data: dowList.map(d => toDisplay(Number(d.grossIncome ?? 0))),
            backgroundColor: dowList.map((_, i) => i === 0 ? '#1A5276' : 'rgba(44,95,138,0.55)'),
            borderRadius: 6
          },
          {
            label: 'Ventas (#)',
            data: dowList.map(d => Number(d.totalSales ?? 0)),
            type: 'line',
            borderColor: '#E67E22',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#E67E22',
            yAxisID: 'y2',
            tension: 0.3,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex === 0) return `Ingresos: ${fmt(viewCurrency === 'VES' && currentRate?.rate ? ctx.parsed.y / currentRate.rate : ctx.parsed.y)}`;
                return `Ventas: ${ctx.parsed.y}`;
              }
            }
          }
        },
        scales: {
          y:  { beginAtZero: true, ticks: { callback: v => abbrev(v) }, grid: { color: 'rgba(203,213,225,0.4)' } },
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { font: { size: 10 } } },
          x:  { grid: { display: false } }
        }
      }
    });
  }
 
  /* ============================================================
     GRÁFICA: PROVEEDORES (barras)
     ProviderSalesDTO: idProvider, providerName, productsSold,
                       grossIncome, estimatedProfit
  ============================================================ */
  function renderProviderChart(providerList) {
    const wrap   = $('provider-chart-wrap');
    const canvas = $('provider-chart');
    destroyChart('provider');
    if (!wrap || !canvas || !providerList?.length) { if (wrap) wrap.style.display = 'none'; return; }
 
    wrap.style.display = 'block';
    const toDisplay = v => viewCurrency === 'VES' && currentRate?.rate ? v * currentRate.rate : v;
 
    charts.provider = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: providerList.map(p => p.providerName || `Proveedor ${p.idProvider}`),
        datasets: [
          {
            label: 'Ingresos',
            data: providerList.map(p => toDisplay(Number(p.grossIncome ?? 0))),
            backgroundColor: '#27AE60',
            borderRadius: 6
          },
          {
            label: 'Utilidad est.',
            data: providerList.map(p => toDisplay(Number(p.estimatedProfit ?? 0))),
            backgroundColor: '#2C5F8A',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(viewCurrency === 'VES' && currentRate?.rate ? ctx.parsed.y / currentRate.rate : ctx.parsed.y)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => abbrev(v) }, grid: { color: 'rgba(203,213,225,0.4)' } },
          x: { grid: { display: false }, ticks: { maxRotation: 30, font: { size: 10 } } }
        }
      }
    });
  }
 
  /* ============================================================
     DÍA PICO
  ============================================================ */
  function renderPeakDay(peakDay) {
    const wrap = $('peak-day-wrap');
    if (!wrap) return;
 
    if (!peakDay) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
 
    setText('peak-day-date',   formatDate(peakDay.saleDay));
    setText('peak-day-sales',  peakDay.totalSales ?? '—');
    setText('peak-day-income', fmt(peakDay.grossIncome ?? 0));
    setText('peak-day-profit', fmt(peakDay.estimatedProfit ?? 0));
  }
 
  /* ── Abreviador de montos en ejes ───────────────────────── */
  function abbrev(v) {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
    return String(v);
  }
 
  /* ============================================================
     RENDER ALL — centralizado para que el toggle moneda
     pueda re-renderizar sin nuevas llamadas al backend
  ============================================================ */
  function renderAll(cache) {
    window._reportCache = cache;
    renderSummary(cache.summary, cache.balance);
    renderSalesTable(cache.salesPage);
    renderBalanceChart(cache.balance);
    renderDailyChart(cache.daily);
    renderDayOfWeekChart(cache.dow);
    renderProviderChart(cache.providers);
    renderPeakDay(cache.peakDay);
  }
 
  /* ============================================================
     CARGA PRINCIPAL
  ============================================================ */
  async function loadReportData(page = 0) {
    setSummaryLoading(true);
    showChartLoader('sales-table-loading', null, true);
    showChartLoader('bar-chart-loading',   'income-expense-chart', true);
    showChartLoader('line-chart-loading',  'period-trend-chart',   true);
 
    const params = buildQueryParams();
 
    try {
      // Todas las llamadas en paralelo — fallos individuales no rompen el resto
      const [summary, salesRaw, balance, daily, peakDay, dow, providers] =
        await Promise.all([
          API.get(`/reports/summary${API.toQuery(params)}`),
          API.get(`/reports/sales${API.toQuery({ ...params, page, size: PAGE_SIZE })}`),
          API.get(`/reports/balance${API.toQuery(params)}`).catch(() => null),
          API.get(`/reports/daily${API.toQuery(params)}`).catch(() => []),
          API.get(`/reports/peak-day${API.toQuery(params)}`).catch(() => null),
          API.get(`/reports/by-day-of-week${API.toQuery(params)}`).catch(() => []),
          API.get(`/reports/by-provider${API.toQuery(params)}`).catch(() => [])
        ]);
 
      const cache = {
        summary:   summary?.data    ?? summary,
        salesPage: unwrapPage(salesRaw?.data ?? salesRaw),
        balance:   balance?.data    ?? balance,
        daily:     Array.isArray(daily?.data    ?? daily)    ? (daily?.data    ?? daily)    : [],
        peakDay:   peakDay?.data    ?? peakDay,
        dow:       Array.isArray(dow?.data      ?? dow)      ? (dow?.data      ?? dow)      : [],
        providers: Array.isArray(providers?.data ?? providers) ? (providers?.data ?? providers) : []
      };
 
      // Actualizar label de tasa en header si está disponible
      if (currentRate) {
        const rateEl = $('rep-rate-display');
        if (rateEl) rateEl.textContent = `Tasa BCV: Bs. ${Number(currentRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
 
      renderAll(cache);
    } catch (err) {
      console.error('[Reportes]', err);
      UI.toast(err.message || 'Error al cargar reportes.', 'error');
      setSummaryLoading(false);
    }
  }
 
  /* ============================================================
     CARGAR SUCURSALES
  ============================================================ */
  async function loadBranches() {
    const sel = $('filter-branch');
    if (!sel) return;
    try {
      const data = await API.branches.list({ size: 100 });
      API.unwrapList(data).forEach(b => {
        sel.appendChild(new Option(b.name || `Sucursal ${b.idBranch ?? b.id}`, b.idBranch ?? b.id));
      });
    } catch (err) { console.warn('[Reportes] sucursales:', err.message); }
  }
 
  /* ============================================================
     EVENTOS
  ============================================================ */
  function bindEvents() {
    $('filters-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const f = getFiltersFromForm();
      if (f.from && f.to && f.from > f.to) {
        UI.toast('La fecha "desde" no puede ser posterior a "hasta".', 'warning'); return;
      }
      filters = f;
      currentPage = 0;
      const btn = $('btn-apply-filters');
      UI.setLoading(btn, true);
      loadReportData(0).finally(() => UI.setLoading(btn, false));
    });
 
    $('btn-prev-page')?.addEventListener('click', () => {
      if (currentPage > 0) loadReportData(currentPage - 1);
    });
    $('btn-next-page')?.addEventListener('click', () => {
      if (currentPage < totalPages - 1) loadReportData(currentPage + 1);
    });
 
    // Toggle USD/VES
    $('btn-view-usd')?.addEventListener('click', () => setViewCurrency('USD'));
    $('btn-view-ves')?.addEventListener('click', () => setViewCurrency('VES'));
  }
 
  /* ── Helpers ────────────────────────────────────────────── */
  function setText(id, val) { const el = $(id); if (el) el.textContent = val; }
 
  /* ============================================================
     INIT
  ============================================================ */
  async function init() {
    const range = defaultDateRange();
    if ($('filter-from')) $('filter-from').value = range.from;
    if ($('filter-to'))   $('filter-to').value   = range.to;
    filters = { ...range, branchId: '' };
 
    bindEvents();
    await Promise.all([loadBranches(), loadExchangeRate()]);
 
    // Mostrar tasa en el header si existe
    if (currentRate) {
      const rateEl = $('rep-rate-display');
      if (rateEl) rateEl.textContent = `Tasa BCV: Bs. ${Number(currentRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
 
    await loadReportData(0);
  }
 
  return { init, loadReportData, setViewCurrency };
 
})();