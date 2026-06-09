/* ============================================================
   REPORTES.JS — Cocobongo
   Alineado con ReportsController + OutgoingsController
   CORREGIDO: Envío de fechas en formato yyyy-MM-dd (sin hora)
   ============================================================
   Endpoints usados:
     GET /api/v1/reports/summary?from=&to=&branchId=
     GET /api/v1/reports/sales?from=&to=&branchId=&page=&size=
     GET /api/v1/reports/sales/by-branch?period=
     GET /api/v1/reports/period-summary?period=&branchId=
     GET /api/v1/outgoings/balance?inicio=&fin=&idBranch=
   ============================================================ */
 
const Reportes = (() => {
 
  const PAGE_SIZE = 20;
  let currentPage = 0;
  let totalPages  = 1;
  let barChart    = null;
  let lineChart   = null;
  let filters     = { from: '', to: '', branchId: '' };
 
  const $ = (id) => document.getElementById(id);
 
  const PAYMENT_LABELS = {
    CASH:     'Efectivo',
    CARD:     'Tarjeta',
    TRANSFER: 'Transferencia',
    CREDIT:   'Crédito'
  };
 
  const PERIOD_LABELS = {
    DAILY:   'Diario',
    WEEKLY:  'Semanal',
    MONTHLY: 'Mensual',
    YEARLY:  'Anual'
  };
 
  /* ── Formato moneda ─────────────────────────────────────── */
  function formatMoney(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(v);
  }
 
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch { return iso; }
  }
 
  /* ── Rango por defecto: últimos 30 días ─────────────────── */
  function defaultDateRange() {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10)
    };
  }
 
  function getFiltersFromForm() {
    return {
      from:     $('filter-from').value,
      to:       $('filter-to').value,
      branchId: $('filter-branch').value || undefined
    };
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
 
  /* ── Loading tarjetas ───────────────────────────────────── */
  function setSummaryLoading(on) {
    document.querySelectorAll('#report-summary-cards .card').forEach(c =>
      c.classList.toggle('card-loading', on)
    );
  }
 
  /* ── Render tarjetas de resumen
     SalesSummaryDTO: totalSales, grossIncome, estimatedProfit,
                      estimatedCost, topProducts               ── */
  function renderSummary(summary, balanceReport) {
    $('rep-tx-count').textContent = String(summary?.totalSales ?? '—');
    $('rep-income').textContent   = formatMoney(summary?.grossIncome   ?? 0);
    $('rep-cost').textContent     = formatMoney(summary?.estimatedCost ?? 0);
    $('rep-expenses').textContent = formatMoney(balanceReport?.gastos  ?? 0);
 
    const profit = Number(summary?.estimatedProfit ?? 0);
    const profitEl = $('rep-profit');
    profitEl.textContent = formatMoney(profit);
    profitEl.className   = 'card-metric-value ' + (profit >= 0 ? 'text-green' : 'text-red');
 
    renderTopProducts(summary?.topProducts ?? []);
    setSummaryLoading(false);
  }
 
  /* ── Top productos
     TopProductDTO: idProduct, productName, unitsSold,
                    totalRevenue, estimatedProfit           ── */
  function renderTopProducts(list) {
    const tbody = $('top-products-body');
    const wrap  = $('top-products-wrap');
    const empty = $('top-products-empty');
    if (!tbody) return;
 
    if (!list.length) {
      wrap.style.display  = 'none';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    wrap.style.display  = 'block';
 
    tbody.innerHTML = list.map((p, i) => `
      <tr>
        <td><span class="badge badge-gray">${i + 1}</span></td>
        <td>${p.productName || '—'}</td>
        <td class="text-right">${p.unitsSold ?? 0}</td>
        <td class="text-right">${formatMoney(p.totalRevenue ?? 0)}</td>
        <td class="text-right">${formatMoney(p.estimatedProfit ?? 0)}</td>
      </tr>`).join('');
  }
 
  /* ── Gráfica ingresos vs gastos (BalanceReport)
     BalanceReport: gastos, balance (= ingresos brutos)     ── */
  function renderBarChart(balanceReport) {
    const loader = $('bar-chart-loading');
    const canvas = $('income-expense-chart');
    if (!loader || !canvas) return;
    
    loader.style.display = 'none';
    canvas.style.display = 'block';
 
    if (barChart) barChart.destroy();
 
    const ingresos = Number(balanceReport?.balance ?? 0);
    const gastos   = Number(balanceReport?.gastos  ?? 0);
    const utilidad = ingresos - gastos;
 
    barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos', 'Utilidad neta'],
        datasets: [{
          label: 'Monto (COP)',
          data: [ingresos, gastos, utilidad],
          backgroundColor: [
            '#27AE60',
            '#E74C3C',
            utilidad >= 0 ? '#2C5F8A' : '#E74C3C'
          ],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => formatMoney(ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => {
                if (Math.abs(v) >= 1_000_000) return '$' + (v/1_000_000).toFixed(1) + 'M';
                if (Math.abs(v) >= 1_000)     return '$' + (v/1_000).toFixed(0) + 'K';
                return '$' + v;
              }
            }
          }
        }
      }
    });
  }
 
  /* ── Gráfica tendencia por período
     PeriodSummaryDTO: idBranch, branchName, saleDay,
                       totalSales, grossIncome, estimatedProfit ── */
  function renderLineChart(periodList) {
    const loader = $('line-chart-loading');
    const canvas = $('period-trend-chart');
    if (!loader || !canvas) return;
 
    loader.style.display = 'none';
    canvas.style.display = 'block';
 
    if (lineChart) lineChart.destroy();
    if (!periodList?.length) return;
 
    const labels  = periodList.map(p => p.saleDay || p.getSaleDay?.() || '');
    const ingresos = periodList.map(p => Number(p.grossIncome ?? 0));
    const profit   = periodList.map(p => Number(p.estimatedProfit ?? 0));
 
    lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ingresos',
            data: ingresos,
            borderColor: '#27AE60',
            backgroundColor: 'rgba(39,174,96,0.08)',
            tension: 0.3,
            fill: true,
            pointRadius: 3
          },
          {
            label: 'Utilidad estimada',
            data: profit,
            borderColor: '#2C5F8A',
            backgroundColor: 'rgba(44,95,138,0.06)',
            tension: 0.3,
            fill: false,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: ctx => formatMoney(ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => {
                if (Math.abs(v) >= 1_000_000) return '$' + (v/1_000_000).toFixed(1) + 'M';
                if (Math.abs(v) >= 1_000)     return '$' + (v/1_000).toFixed(0) + 'K';
                return '$' + v;
              }
            }
          }
        }
      }
    });
  }
 
  /* ── Gráfica por sucursal
     BranchSalesReportDTO: idBranch, branchName, city,
                           totalSales, grossIncome, estimatedProfit ── */
  function renderBranchChart(branchList) {
    const wrap   = $('branch-chart-wrap');
    const canvas = $('branch-sales-chart');
    if (!wrap || !canvas || !branchList?.length) return;
 
    wrap.style.display = 'block';
 
    if (window._branchChart) window._branchChart.destroy();
 
    window._branchChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: branchList.map(b => b.branchName || `Sucursal ${b.idBranch}`),
        datasets: [
          {
            label: 'Ingresos',
            data: branchList.map(b => Number(b.grossIncome ?? 0)),
            backgroundColor: '#27AE60',
            borderRadius: 6
          },
          {
            label: 'Utilidad estimada',
            data: branchList.map(b => Number(b.estimatedProfit ?? 0)),
            backgroundColor: '#2C5F8A',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: ctx => formatMoney(ctx.parsed.y) } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => {
                if (Math.abs(v) >= 1_000_000) return '$' + (v/1_000_000).toFixed(1) + 'M';
                if (Math.abs(v) >= 1_000)     return '$' + (v/1_000).toFixed(0) + 'K';
                return '$' + v;
              }
            }
          }
        }
      }
    });
  }
 
  /* ── Tabla de ventas
     SaleReportDTO: idSale, saleDate, branchName, registeredBy,
                    clientName, paymentType, status, total      ── */
  function renderSalesTable(pageData) {
    const loader     = $('sales-table-loading');
    const table      = $('sales-report-table');
    const empty      = $('sales-table-empty');
    const tbody      = $('sales-report-body');
    const pagination = $('sales-pagination');
 
    if (loader) loader.style.display = 'none';
 
    if (!pageData.items.length) {
      if (table) table.style.display      = 'none';
      if (pagination) pagination.style.display = 'none';
      if (empty) empty.style.display      = 'block';
      if ($('sales-page-info')) $('sales-page-info').textContent = '0 ventas';
      return;
    }
 
    if (empty) empty.style.display      = 'none';
    if (table) table.style.display      = 'table';
    if (pagination) pagination.style.display = 'flex';
 
    tbody.innerHTML = pageData.items.map(row => `
      <tr>
        <td><span class="badge badge-gray">#${row.idSale ?? '—'}</span></td>
        <td>${formatDate(row.saleDate)}</td>
        <td>${row.clientName || 'Consumidor final'}</td>
        <td>${row.branchName || '—'}</td>
        <td class="text-right fw-600">${formatMoney(row.total ?? 0)}</td>
        <td>
          <span class="badge badge-blue">
            ${PAYMENT_LABELS[row.paymentType] || row.paymentType || '—'}
          </span>
         </td>
        <td>${row.registeredBy || '—'}</td>
       </tr>`).join('');
 
    currentPage = pageData.number;
    totalPages  = Math.max(1, pageData.totalPages);
    if ($('sales-page-info')) $('sales-page-info').textContent =
      `${pageData.totalElements} venta(s) · Pág. ${currentPage + 1}/${totalPages}`;
    if ($('pagination-label')) $('pagination-label').textContent = `Página ${currentPage + 1} de ${totalPages}`;
    if ($('btn-prev-page')) $('btn-prev-page').disabled = currentPage <= 0;
    if ($('btn-next-page')) $('btn-next-page').disabled = currentPage >= totalPages - 1;
  }
 
  /* ── Cargar sucursales ──────────────────────────────────── */
  async function loadBranches() {
    const sel = $('filter-branch');
    if (!sel) return;
    
    try {
      const data = await API.branches.list({ size: 100 });
      const list = API.unwrapList(data);
      list.forEach(b => {
        const opt = new Option(
          b.name || `Sucursal ${b.idBranch ?? b.id}`,
          b.idBranch ?? b.id
        );
        sel.appendChild(opt);
      });
    } catch (err) {
      console.warn('[Reportes] sucursales:', err.message);
    }
  }
 
  /* ── Carga principal ────────────────────────────────────── */
  async function loadReportData(page = 0) {
    setSummaryLoading(true);
    if ($('sales-table-loading')) $('sales-table-loading').style.display  = 'flex';
    if ($('sales-report-table')) $('sales-report-table').style.display   = 'none';
    if ($('bar-chart-loading')) $('bar-chart-loading').style.display    = 'flex';
    if ($('income-expense-chart')) $('income-expense-chart').style.display = 'none';
    if ($('line-chart-loading')) $('line-chart-loading').style.display = 'flex';
    if ($('period-trend-chart')) $('period-trend-chart').style.display = 'none';
 
    /* Enviar LocalDateTime porque el backend recibe LocalDateTime. */
    const fromDate = filters.from ? `${filters.from}T00:00:00` : undefined;
    const toDate   = filters.to   ? `${filters.to}T23:59:59` : undefined;
 
    const branchId = filters.branchId ? Number(filters.branchId) : undefined;
 
    /* Período activo para gráficas de tendencia */
    const period = $('filter-period')?.value || 'MONTHLY';
 
    try {
      /* Peticiones en paralelo — siempre se hacen summary y ventas */
      const [summary, salesRaw, byBranch, periodSummary] = await Promise.all([
 
        /* GET /api/v1/reports/summary?from=2024-01-01&to=2024-01-31&branchId= */
        API.get(`/reports/summary${API.toQuery({ 
          from: fromDate, 
          to: toDate, 
          branchId 
        })}`),
 
        /* GET /api/v1/reports/sales?from=2024-01-01&to=2024-01-31&branchId=&page=&size= */
        API.get(`/reports/sales${API.toQuery({
          from: fromDate,
          to: toDate,
          branchId,
          page,
          size: PAGE_SIZE
        })}`),
 
        /* GET /api/v1/reports/sales/by-branch?period=MONTHLY */
        API.get(`/reports/sales/by-branch${API.toQuery({ period })}`).catch(() => []),
 
        /* GET /api/v1/reports/period-summary?period=MONTHLY&branchId= */
        API.get(`/reports/period-summary${API.toQuery({ period, branchId })}`).catch(() => [])
      ]);
 
      /* Balance solo si hay sucursal — idBranch es requerido en ese endpoint
         GET /api/v1/outgoings/balance?inicio=2024-01-01&fin=2024-01-31&idBranch= */
      let balanceReport = null;
      if (branchId) {
        try {
          balanceReport = await API.get(
            `/outgoings/balance${API.toQuery({ 
              inicio: fromDate, 
              fin: toDate, 
              idBranch: branchId 
            })}`
          );
        } catch (err) {
          console.warn('[Reportes] balance:', err.message);
        }
      }
 
      /* Desenvuelve ApiResponse si aplica */
      const summaryData  = summary?.data  ?? summary;
      const salesPage    = unwrapPage(salesRaw?.data ?? salesRaw);
      const byBranchList = Array.isArray(byBranch?.data ?? byBranch)
        ? (byBranch?.data ?? byBranch) : [];
      const periodList   = Array.isArray(periodSummary?.data ?? periodSummary)
        ? (periodSummary?.data ?? periodSummary) : [];
      const balanceData  = balanceReport?.data ?? balanceReport;
 
      renderSummary(summaryData, balanceData);
      renderSalesTable(salesPage);
      renderBarChart(balanceData);
      renderLineChart(periodList);
      renderBranchChart(byBranchList);
 
      /* Label de sucursal en la gráfica */
      const branchLabel = $('chart-branch-label');
      if (branchLabel) {
        branchLabel.textContent = branchId
          ? ($('filter-branch').options[$('filter-branch').selectedIndex]?.text || `Sucursal ${branchId}`)
          : 'Todas las sucursales';
      }
 
    } catch (err) {
      console.error('[Reportes]', err);
      UI.toast(err.message || 'Error al cargar reportes.', 'error');
      setSummaryLoading(false);
      if ($('sales-table-loading')) $('sales-table-loading').style.display = 'none';
      if ($('bar-chart-loading')) $('bar-chart-loading').style.display   = 'none';
    }
  }
 
  /* ── Eventos ────────────────────────────────────────────── */
  function bindEvents() {
    const filtersForm = $('filters-form');
    if (filtersForm) {
      filtersForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = getFiltersFromForm();
        if (f.from && f.to && f.from > f.to) {
          UI.toast('La fecha "desde" no puede ser posterior a "hasta".', 'warning');
          return;
        }
        filters = f;
        currentPage = 0;
        const btn = $('btn-apply-filters');
        UI.setLoading(btn, true);
        loadReportData(0).finally(() => UI.setLoading(btn, false));
      });
    }
 
    const btnPrev = $('btn-prev-page');
    const btnNext = $('btn-next-page');
    
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (currentPage > 0) loadReportData(currentPage - 1);
      });
    }
    
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (currentPage < totalPages - 1) loadReportData(currentPage + 1);
      });
    }
 
    /* Cambio de período para gráficas de tendencia */
    const periodSel = $('filter-period');
    if (periodSel) {
      periodSel.addEventListener('change', () => loadReportData(currentPage));
    }
  }
 
  /* ── Init ───────────────────────────────────────────────── */
  async function init() {
    const range = defaultDateRange();
    if ($('filter-from')) $('filter-from').value = range.from;
    if ($('filter-to')) $('filter-to').value = range.to;
    filters = { ...range, branchId: undefined };
    
    bindEvents();
    await loadBranches();
    await loadReportData(0);
  }
 
  return { init, loadReportData };
 
})();