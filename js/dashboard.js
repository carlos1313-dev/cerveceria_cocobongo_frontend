/* ============================================================
   DASHBOARD.JS — Cocobongo
   RF-REP-01, RF-REP-02, RF-INV-06
   ============================================================ */

const Dashboard = (() => {

  let lineChart = null;

  const $ = (id) => document.getElementById(id);

  function formatMoney(n) {
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(v);
  }

  function setCardLoading(loading) {
    document.querySelectorAll('#metric-cards .card').forEach(c => {
      c.classList.toggle('card-loading', loading);
    });
  }

  function showSectionLoading(loadingId, contentIds, show) {
    const loader = $(loadingId);
    if (loader) loader.style.display = show ? 'flex' : 'none';
    (contentIds || []).forEach(id => {
      const el = $(id);
      if (el) el.style.display = show ? 'none' : '';
    });
  }

  function renderDate() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const str = now.toLocaleDateString('es-CO', opts);
    $('dashboard-date').textContent =
      'Resumen del negocio — ' + str.charAt(0).toUpperCase() + str.slice(1);

    const month = now.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
    const badge = $('chart-period-badge');
    if (badge) badge.textContent = month;
  }

  function renderCards(dayData, monthData, balances, outgoingsBalance) {
    const dayTotal = dayData.daySalesTotal ?? dayData.totalSales ?? dayData.total ?? 0;
    const monthTotal = monthData.monthSalesTotal ?? monthData.totalSales ?? monthData.total ?? 0;

    // Sprint 5: Utilidad neta del mes (Ingresos - gastos)
    const profitFromBackend = monthData.monthProfit ?? monthData.netProfit;
    const fallbackProfit = (monthData.monthSalesTotal - (monthData.monthExpenses || 0));
    const profit = (profitFromBackend ?? fallbackProfit);

    const utilNeta = outgoingsBalance?.netProfit
      ?? outgoingsBalance?.net
      ?? profit;

    $('card-day-sales').textContent = formatMoney(dayTotal);
    $('card-month-sales').textContent = formatMoney(monthTotal);

    const cardProfitEl = $('card-month-profit');
    if (cardProfitEl) cardProfitEl.textContent = formatMoney(profit);

    const cardNetEl = $('card-month-net-profit');
    if (cardNetEl) cardNetEl.textContent = formatMoney(utilNeta);

    const pending = Array.isArray(balances) ? balances.length
      : (monthData.pendingClientsCount ?? 0);
    $('card-pending-clients').textContent = String(pending);

    const totalDebt = Array.isArray(balances)
      ? balances.reduce((s, c) => s + Number(c.balance || c.pendingBalance || 0), 0)
      : 0;
    $('card-pending-sub').textContent = totalDebt > 0
      ? `Deuda total: ${formatMoney(totalDebt)}`
      : 'Sin saldos pendientes';
    $('card-day-sub').textContent = 'Total acumulado hoy';
    $('card-month-sub').textContent = 'Período actual';

    setCardLoading(false);
  }

  function renderLineChart(series) {
    showSectionLoading('chart-loading', ['sales-line-chart'], false);
    const canvas = $('sales-line-chart');
    canvas.style.display = 'block';

    const labels = series.map(d => d.label || d.date?.slice(5) || '');
    const values = series.map(d => Number(d.total ?? d.amount ?? 0));

    if (lineChart) lineChart.destroy();

    lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Ventas ($)',
          data: values,
          borderColor: '#1F3864',
          backgroundColor: 'rgba(44, 95, 138, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#2C5F8A',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatMoney(ctx.parsed.y)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => {
                if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
                if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
                return '$' + v;
              }
            },
            grid: { color: 'rgba(203,213,225,0.5)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderTopProducts(products) {
    showSectionLoading('top-products-loading', ['top-products-table'], false);
    const tbody = $('top-products-body');
    const table = $('top-products-table');
    const empty = $('top-products-empty');

    if (!products?.length) {
      table.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    table.style.display = 'table';
    tbody.innerHTML = products.map((p, i) => `
      <tr class="row-fade-in">
        <td><span class="badge badge-navy">${i + 1}</span></td>
        <td>${p.productName || p.name || '—'}</td>
        <td class="text-right fw-600">${p.quantitySold ?? p.quantity ?? 0}</td>
      </tr>
    `).join('');
  }

  function renderStockAlerts(alerts) {
    showSectionLoading('stock-alerts-loading', ['stock-alerts-table-wrap'], false);
    const wrap = $('stock-alerts-table-wrap');
    const empty = $('stock-alerts-empty');
    const tbody = $('stock-alerts-body');
    const banner = $('stock-alert-banner');
    const bannerText = $('stock-alert-text');

    if (!alerts?.length) {
      wrap.style.display = 'none';
      empty.style.display = 'block';
      banner.style.display = 'none';
      Layout.setBadge('badge-stock', 0);
      return;
    }

    empty.style.display = 'none';
    wrap.style.display = 'block';
    banner.style.display = 'flex';
    bannerText.innerHTML = `<strong>${alerts.length} producto(s)</strong> con stock en o por debajo del mínimo.
      <a href="inventario.html" style="color:inherit;font-weight:600;margin-left:6px">Revisar inventario →</a>`;

    Layout.setBadge('badge-stock', alerts.length);

    tbody.innerHTML = alerts.map(a => {
      const stock = Number(a.stock ?? a.currentStock ?? 0);
      const min = Number(a.stockMinimo ?? a.minStock ?? a.minimumStock ?? 0);
      const low = stock <= min;
      return `
        <tr>
          <td>${a.name || a.productName || '—'}</td>
          <td>${a.branchName || a.branch || '—'}</td>
          <td class="text-right ${low ? 'text-red' : 'text-green'}">${stock}</td>
          <td class="text-right">${min}</td>
          <td><span class="badge ${low ? 'badge-red' : 'badge-amber'}">${low ? 'Crítico' : 'Bajo'}</span></td>
        </tr>
      `;
    }).join('');
  }

  async function loadAll() {
    renderDate();
    setCardLoading(true);

    const user = Auth.getUser();
    const branchId = user?.branchId ?? undefined;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const recentExpensesKeys = {
      PERSONAL: 'Personal',
      MAINTENANCE: 'Mantenimiento',
      RENT: 'Arriendo',
      SERVICES: 'Servicios',
      EMPLOYEE: 'Empleados',
      OTHER: 'Otros'
    };

    function renderRecentExpensesByType(list) {
      const loading = $('recent-expenses-loading');
      const table = $('recent-expenses-table');
      const empty = $('recent-expenses-empty');
      const tbody = $('recent-expenses-body');

      if (loading) loading.style.display = 'none';

      const normalized = Array.isArray(list) ? list : [];
      if (!normalized.length) {
        if (table) table.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
      }

      const totals = new Map();
      normalized.forEach(g => {
        const t = g.type || g.tipo || g.gastoType || '';
        const key = (typeof t === 'string') ? t.toUpperCase() : t;
        const label = recentExpensesKeys[key] || key;
        const val = Number(g.total ?? g.monto ?? g.amount ?? 0);
        totals.set(label, (totals.get(label) || 0) + (Number.isFinite(val) ? val : 0));
      });

      const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

      if (empty) empty.style.display = 'none';
      if (table) table.style.display = 'table';

      tbody.innerHTML = rows.map(([label, total]) => `
        <tr>
          <td>${label}</td>
          <td class="text-right">${formatMoney(total)}</td>
        </tr>
      `).join('');
    }

    try {
      const [daySummary, monthSummary, salesByDay, topProducts, alerts, balances, outBalance, gastosList] =
        await Promise.all([
          API.reports.summary({ period: 'day', branchId }),
          API.reports.summary({ period: 'month', branchId }),
          API.reports.salesByDay({ days: 7, branchId }),
          API.reports.topProducts({ from: monthStart, to: today, branchId, limit: 5 }),
          API.reports.stockAlerts(branchId),
          API.clients.balances(),
          API.outgoings.balance({ from: monthStart, to: today, branchId }),
          API.gastos?.list
            ? API.gastos.list({
                sucursal: branchId,
                tipo: undefined,
                from: monthStart,
                to: today
              }).catch(() => [])
            : Promise.resolve([])
        ]);

      const chartData = Array.isArray(salesByDay)
        ? salesByDay
        : (monthSummary.salesByDay || []);

      renderCards(daySummary, monthSummary, balances, outBalance);
      renderLineChart(chartData.length ? chartData : []);
      renderTopProducts(topProducts);
      renderStockAlerts(API.unwrapList(alerts).length ? API.unwrapList(alerts) : alerts);

      // Mini tabla gastos recientes por tipo
      renderRecentExpensesByType(API.unwrapList(gastosList));
    } catch (err) {
      UI.toast(err.message || 'Error al cargar el dashboard.', 'error');
      setCardLoading(false);
      showSectionLoading('chart-loading', [], true);
      showSectionLoading('top-products-loading', [], true);
      showSectionLoading('stock-alerts-loading', [], true);
    }
  }

  function init() {
    loadAll();
  }

  return { init, loadAll, formatMoney };

})();
