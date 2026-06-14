/* ============================================================
   API.JS — Cervecería Cocobongo
   Capa de abstracción para llamadas HTTP al backend Spring Boot
   ============================================================ */
 
const API = (() => {
 
  const productionUrl = 'https://cerveceriacocobongobackend-production.up.railway.app';
  
  const API_ORIGIN = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.CBC_API_ORIGIN || 'http://localhost:8082')
    : productionUrl;

  const BASE_URL = `${API_ORIGIN}/api/v1`;
 
  function buildHttpError(message, status, data = null) {
    const err = new Error(message || 'Error en la solicitud.');
    err.status = status;
    err.payload = data;
    return err;
  }
 
  function unwrapPayload(body) {
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'success')) {
      if (body.success === false) {
        throw new Error(body.message || 'Error en la solicitud.');
      }
      return body.data !== undefined && body.data !== null ? body.data : body;
    }
    return body;
  }
 
  function unwrapList(data) {
    if (Array.isArray(data)) return data;
    if (data?.content && Array.isArray(data.content)) return data.content;
    if (data?.items && Array.isArray(data.items)) return data.items;
    return [];
  }
 
  function errorMessage(data, fallback) {
    return data?.message || data?.error || fallback;
  }
 
  async function request(method, endpoint, body = null, options = {}) {
    const { auth = true, unwrap = true } = options;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = Auth.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
 
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
 
    let response;
    try {
      response = await fetch(`${BASE_URL}${endpoint}`, opts);
    } catch {
      throw new Error('Sin conexión con el servidor. Verifica tu red.');
    }
 
    const parseJson = async () => {
      try { return await response.json(); }
      catch { return {}; }
    };
 
    if (response.status === 401) {
      const data = await parseJson();
      if (auth) { Auth.clearSession(); window.location.href = 'login.html'; return; }
      throw buildHttpError(errorMessage(data, 'Credenciales incorrectas.'), 401, data);
    }
    if (response.status === 403) {
      const data = await parseJson();
      throw buildHttpError(errorMessage(data, 'No tienes permisos para realizar esta acción.'), 403, data);
    }
    if (response.status === 404) {
      const data = await parseJson();
      throw buildHttpError(errorMessage(data, 'El recurso solicitado no fue encontrado.'), 404, data);
    }
    if (response.status >= 500) {
      const data = await parseJson();
      throw buildHttpError(errorMessage(data, 'Error interno del servidor. Intenta nuevamente.'), response.status, data);
    }
    if (response.status === 400 || response.status === 409) {
      const data = await parseJson();
      if (unwrap) {
        try { unwrapPayload(data); }
        catch (e) { if (e instanceof Error) { e.status = response.status; e.payload = data; } throw e; }
      }
      throw buildHttpError(errorMessage(data, 'Datos inválidos. Revisa el formulario.'), response.status, data);
    }
    if (response.status === 204) return null;
    if (!response.ok) {
      const data = await parseJson();
      throw buildHttpError(errorMessage(data, 'Error en la solicitud.'), response.status, data);
    }
 
    const raw = await parseJson();
    return unwrap ? unwrapPayload(raw) : raw;
  }
 
  const get   = (endpoint, options)       => request('GET',    endpoint, null, options);
  const post  = (endpoint, body, options) => request('POST',   endpoint, body, options);
  const put   = (endpoint, body, options) => request('PUT',    endpoint, body, options);
  const patch = (endpoint, body, options) => request('PATCH',  endpoint, body, options);
  const del   = (endpoint, options)       => request('DELETE', endpoint, null, options);
 
  function toQuery(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : '';
  }
 
  function fetchWithMock(realFn, mockFn) {
    return realFn().catch(err => {
      if (window.CBC_API_USE_MOCK === true) {
        console.warn('[API] Usando datos mock:', err?.message || err);
        return mockFn();
      }
      throw err;
    });
  }
 
  function mockSalesByDay(days) {
    const labels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const values = [1800000, 1200000, 2100000, 1600000, 2600000, 3200000, 2900000];
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      out.push({ date: d.toISOString().slice(0, 10), label: labels[d.getDay()], total: values[d.getDay() % values.length] });
    }
    return out;
  }
 
  const ReportMocks = {
    summary(params = {}) {
      const base = { daySalesTotal: 487000, monthSalesTotal: 6240000, monthProfit: 4390000, monthExpenses: 1850000, pendingClientsCount: 5, transactionCount: 142, salesByDay: mockSalesByDay(7) };
      return params.period === 'day' ? { ...base, totalSales: base.daySalesTotal } : base;
    },
    topProducts: (limit = 5) => [
      { productName: 'Club Colombia', quantitySold: 214 }, { productName: 'Águila', quantitySold: 178 },
      { productName: 'Costeña', quantitySold: 120 }, { productName: 'Poker lata', quantitySold: 84 },
      { productName: 'Redds', quantitySold: 62 }
    ].slice(0, limit),
    stockAlerts: () => [
      { id: 1, name: 'Club Colombia 330ml', stock: 8, stockMinimo: 20, branchName: 'Centro' },
      { id: 2, name: 'Águila botella', stock: 5, stockMinimo: 15, branchName: 'Centro' }
    ],
    clientBalances: () => [
      { id: 1, name: 'Ramón Torres', balance: 85000 }, { id: 2, name: 'Fernando Ríos', balance: 135000 }
    ],
    outgoingsBalance: (params) => ({ totalIncome: 6240000, totalExpenses: 1850000, netProfit: 4390000 })
  };
 
  function aggregateTopProducts(sales, limit) {
    const map = new Map();
    sales.forEach(sale => {
      (sale.items || sale.details || []).forEach(item => {
        const name = item.productName || item.name || `Producto ${item.productId || ''}`;
        map.set(name, (map.get(name) || 0) + Number(item.quantity || 0));
      });
    });
    return [...map.entries()].map(([productName, quantitySold]) => ({ productName, quantitySold }))
      .sort((a, b) => b.quantitySold - a.quantitySold).slice(0, limit);
  }
 
  return {
    BASE_URL, API_ORIGIN,
    get, post, put, patch, del,
    unwrapList, unwrapPayload, toQuery,
 
    auth: {
      register:       (data)  => post('/auth/register', { name: data.name, email: data.email, password: data.password, branchId: data.branchId ?? null }, { auth: false }),
      login:          (creds) => post('/auth/login', creds, { auth: false }),
      logout:         ()      => post('/auth/logout'),
      forgotPassword: (data)  => post('/auth/forgot-password', data, { auth: false }),
      resetPassword:  (data)  => post('/auth/reset-password', data, { auth: false }),
      changePassword: (data)  => put('/auth/change-password', data),
      me:             ()      => get('/auth/me'),
      auditLogs:      (params = {}) => get(`/audit${toQuery(params)}`)
    },
 
    // ── NUEVO: Tasa BCV ────────────────────────────────────────────────────────
    exchangeRate: {
      /** GET /api/v1/exchange-rate/current — tasa vigente */
      getCurrent: () => get('/exchange-rate/current'),
      /** PATCH /api/v1/exchange-rate — actualizar tasa del día */
      update: (rate) => patch('/exchange-rate', { rate })
    },
 
    branches: {
      list:            (params = {}, options = {}) => get(`/branches${toQuery(params)}`, options),
      listForRegister: (params = {})               => get(`/branches${toQuery({ size: 100, ...params })}`, { auth: false }),
      get:             (id, options = {})           => get(`/branches/${id}`, options),
      create:          (data)                       => post('/branches', data),
      update:          (id, data)                   => put(`/branches/${id}`, data),
      remove:          (id)                         => del(`/branches/${id}`)
    },
 
    providers: {
      list:   (search) => get(`/providers${search ? toQuery({ search }) : ''}`),
      get:    (id)     => get(`/providers/${id}`),
      create: (data)   => post('/providers', data),
      update: (id, data) => put(`/providers/${id}`, data),
      remove: (id)     => del(`/providers/${id}`)
    },
 
    inventory: {
      list: (params = {}) => {
        const { idBranch, branchId, search } = params;
        const id = idBranch ?? branchId;
        if (id == null) return Promise.reject(new Error('Debes seleccionar una sucursal (idBranch).'));
        return get(`/inventory${toQuery({ idBranch: id, search })}`);
      },
      getByProduct:  (idProduct) => get(`/inventory/${idProduct}`),
      registerEntry: (data)      => post('/inventory/entries', {
        idProduct: data.idProduct ?? data.productId,
        idBranch:  data.idBranch  ?? data.branchId,
        quantity:  data.quantity,
        reason:    data.reason || 'PURCHASE',
        type:      data.type   || 'IN'
      }),
      movements: (params = {}) => get(`/inventory/movements${toQuery({
        idProduct: params.idProduct, idBranch: params.idBranch ?? params.branchId,
        type: params.type, reason: params.reason, from: params.from, to: params.to
      })}`)
    },
 
    products: {
      list:   (params = {}) => get(`/products${toQuery(params)}`),
      get:    (id)           => get(`/products/${id}`),
      create: (data)         => post('/products', data),
      update: (id, data)     => put(`/products/${id}`, data),
      remove: (id)           => del(`/products/${id}`),
      alerts: (idBranch)     => get(`/products/alerts${toQuery({ idBranch })}`),
      async forSale(idBranch, search) {
        try {
          return unwrapList(await get(`/products${toQuery({ idBranch, search, active: true, forSale: true })}`));
        } catch {
          return unwrapList(await get(`/inventory${toQuery({ idBranch, search: search || undefined })}`));
        }
      }
    },
 
    users: {
      list:       (params = {}) => get(`/users${toQuery(params)}`),
      get:        (id)           => get(`/users/${id}`),
      create:     (data)         => post('/users', data),
      update:     (id, data)     => put(`/users/${id}`, data),
      deactivate: (id)           => patch(`/users/${id}/deactivate`),
      activate:   (id)           => patch(`/users/${id}/activate`)
    },
 
    sales: {
      list:   (params = {}) => get(`/sales${toQuery(params)}`),
      get:    (id)           => get(`/sales/${id}`),
      /** RegisterSaleRequest: { clientId?, items:[{productId,branchId,quantity}], payments:[{method,currency,amount}] } */
      create: (data)         => post('/sales', data)
    },
 
    clients: {
      list:               (params = {}) => get(`/clients${toQuery(params)}`),
      get:                (id)          => get(`/clients/${id}`),
      create:             (data)        => post('/clients', data),
      update:             (id, data)    => put(`/clients/${id}`, data),
      remove:             (id)          => del(`/clients/${id}`),
      getAccountStatus:   (id)          => get(`/clients/${id}/accountStatus`),
      statement:          (id)          => get(`/clients/${id}/account-statement`),
      balances:           ()            => get('/clients/balances'),
      registerInstallment:(id, data)    => post(`/clients/${id}/installments`, data)
    },
 
    gastos: {
      /** OutgoingRequestDTO: { idBranch, type, date, total, description, currency } */
      create:  (data)        => post('/outgoings/register', data),
      list:    (params = {}) => get(`/outgoings${toQuery(params)}`),
      balance: (params = {}) => get(`/outgoings/balance${toQuery({
        inicio: params.inicio ?? params.from,
        fin:    params.fin    ?? params.to,
        idBranch: params.idBranch ?? params.branchId
      })}`)
    },
 
    outgoings: {
      balance: (params = {}) => get(`/outgoings/balance${toQuery({ from: params.from, to: params.to, branchId: params.branchId })}`)
    },
 
    reports: {
      summary(params = {}) {
        const { period = 'month', from, to, branchId } = params;
        return get(`/reports/summary${toQuery({ period, from, to, branchId })}`);
      },
      sales(params = {}) {
        const { from, to, branchId, page = 0, size = 10 } = params;
        return get(`/reports/sales${toQuery({ from, to, branchId, page, size })}`);
      },
      topProducts(params = {}) {
        const { from, to, branchId, limit = 5 } = params;
        return get(`/sales${toQuery({ from, to, branchId, page: 0, size: 200 })}`)
          .then(data => aggregateTopProducts(unwrapList(data), limit));
      },
      salesByDay(params = {}) {
        return get(`/reports/summary${toQuery({ period: 'week', branchId: params.branchId })}`)
          .then(data => data.salesByDay || data.dailySales || []);
      },
      stockAlerts(branchId) {
        return get(`/inventory/products/alerts${toQuery({ branchId })}`)
          .catch(() => get(`/products/alerts${toQuery({ idBranch: branchId, branchId })}`));
      }
    },
 
    reportes: {
      ventas:  (params) => get(`/reports/sales${toQuery(params)}`),
      resumen: (params) => get(`/reports/summary${toQuery(params)}`)
    },
 
    /* Aliases legacy */
    ventas:      { list: (p) => get(`/sales${toQuery(p)}`), create: (d) => post('/sales', d) },
    clientes:    { list: (p) => get(`/clients${toQuery(p)}`), create: (d) => post('/clients', d), statement: (id) => get(`/clients/${id}/account-statement`), registerInstallment: (id, d) => post(`/clients/${id}/installments`, d) },
    sucursales:  (params) => get(`/branches${toQuery(params)}`),
    proveedores: (search) => get(`/providers${search ? toQuery({ search }) : ''}`)
  };
 
})();