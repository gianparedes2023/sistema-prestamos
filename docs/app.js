const STORAGE_KEY = "loanControlSystem.v1";
const TOKEN_KEY = "loanControlSystem.token";
const SUPABASE_STATE_ID = "main";
const supabaseConfig = window.APP_SUPABASE || {};
const supabaseReady = Boolean(
  window.supabase &&
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("PEGA_AQUI") &&
  !supabaseConfig.anonKey.includes("PEGA_AQUI")
);
const db = supabaseReady ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey) : null;
const API_BASE = !supabaseReady && location.protocol.startsWith("http") ? "/api" : "";

const state = loadState();
let selectedReceiptId = null;
let authToken = localStorage.getItem(TOKEN_KEY) || "";
let currentUser = null;
let remoteSaveTimer = null;
let monthlyStatusFilter = "";

const titles = {
  dashboard: ["Dashboard", "Indicadores actualizados a la fecha de consulta."],
  control: ["Control mensual", "Prestamos del mes, pagos recibidos y mora operativa."],
  clientes: ["Gestion de clientes", "Registro, busqueda, historial y deuda total por cliente."],
  prestamos: ["Gestion de prestamos", "Prestamos con o sin cronograma, modalidades flexibles y saldos al dia."],
  pagos: ["Registro de pagos", "Pagos parciales, totales o adelantados con saldo antes y despues."],
  deuda: ["Consulta de deuda", "Situacion actual del cliente recalculada a la fecha indicada."],
  reportes: ["Reportes", "Prestamos, pagos, deuda actual, vencidos e intereses generados."],
  seguridad: ["Seguridad y auditoria", "Usuarios, roles y trazabilidad de cambios principales."]
};

const money = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

document.addEventListener("DOMContentLoaded", () => {
  if (supabaseReady || (API_BASE && !authToken)) setAuthLocked(true);
  byId("asOfDate").value = today();
  byId("controlMonth").value = today().slice(0, 7);
  mountLoanModal();
  wireNavigation();
  wireForms();
  wireFilters();
  renderAll();
  initBackendSession();
});

function byId(id) {
  return document.getElementById(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mountLoanModal() {
  document.body.appendChild(byId("loanFormOverlay"));
  document.body.appendChild(byId("loanForm"));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return { clients: [], loans: [], payments: [], users: [], audit: [] };
}

function saveState(action, detail) {
  if (action) {
    state.audit.unshift({
      id: uid("AUD"),
      action,
      detail,
      user: currentUser?.username || "admin.local",
      createdAt: new Date().toISOString()
    });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  persistRemoteState();
}

async function initBackendSession() {
  renderAuthState();
  if (supabaseReady) {
    await initSupabaseSession();
    return;
  }
  if (!API_BASE || !authToken) return;
  try {
    currentUser = await apiRequest("/auth/me");
    const localState = normalizeState(state);
    const remoteState = normalizeState(await apiRequest("/state"));
    if (isStateEmpty(remoteState) && !isStateEmpty(localState) && currentUser.role !== "Consulta") {
      await apiRequest("/state", {
        method: "PUT",
        body: JSON.stringify(localState)
      });
      Object.assign(state, localState);
    } else {
      Object.assign(state, remoteState);
    }
    if (currentUser.role === "Administrador") {
      state.users = await apiRequest("/security/users");
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAuthState();
    renderAll();
  } catch (error) {
    console.warn(error);
    authToken = "";
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    renderAuthState("Sesion vencida");
  }
}

function renderAuthState(message) {
  const status = byId("authStatus");
  const loginBtn = byId("loginBtn");
  const logoutBtn = byId("logoutBtn");
  if (!status || !loginBtn || !logoutBtn) return;
  if (!API_BASE && !supabaseReady) {
    status.textContent = "Modo local";
    loginBtn.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    setAuthLocked(false);
    return;
  }
  if (currentUser) {
    status.textContent = `${currentUser.name || currentUser.username} | ${currentUser.role}`;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    setAuthLocked(false);
    hideLogin();
    return;
  }
  status.textContent = message || "Sin sesion";
  loginBtn.classList.remove("hidden");
  logoutBtn.classList.add("hidden");
  setAuthLocked(true);
  showLogin(message);
}

function setAuthLocked(locked) {
  document.body.classList.toggle("auth-locked", locked);
}

function showLogin(message) {
  const overlay = byId("loginOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.remove("hidden");
  setLoginMessage(message || "");
  setTimeout(() => byId("loginUser")?.focus(), 0);
}

function hideLogin() {
  const overlay = byId("loginOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.add("hidden");
  setLoginMessage("");
  if (byId("loginPassword")) byId("loginPassword").value = "";
}

function setLoginMessage(message) {
  const error = byId("loginError");
  if (!error) return;
  error.textContent = message || "";
  error.classList.toggle("hidden", !message);
}

async function loginBackend(event) {
  if (event) event.preventDefault();
  if (!API_BASE && !supabaseReady) {
    alert("Configure Supabase o abra la aplicacion desde http://localhost:3000 para usar seguridad.");
    return;
  }
  const username = byId("loginUser").value.trim();
  const password = byId("loginPassword").value;
  if (!username || !password) {
    setLoginMessage("Ingrese usuario y clave.");
    return;
  }
  const submit = byId("loginSubmitBtn");
  submit.disabled = true;
  submit.textContent = "Validando...";
  setLoginMessage("");
  try {
    if (supabaseReady) {
      await loginSupabase(username, password);
      return;
    }
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      skipAuth: true
    });
    authToken = response.token;
    currentUser = response.user;
    localStorage.setItem(TOKEN_KEY, authToken);
    await initBackendSession();
  } catch (error) {
    setLoginMessage(error.message || "No se pudo iniciar sesion.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Ingresar";
  }
}

async function logoutBackend() {
  try {
    if (supabaseReady && db) {
      await db.auth.signOut();
    }
    if (API_BASE && authToken) {
      await apiRequest("/auth/logout", { method: "POST" });
    }
  } catch (error) {
    console.warn(error);
  }
  authToken = "";
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  renderAuthState();
  showLogin("Sesion cerrada.");
}

function persistRemoteState() {
  if (supabaseReady) {
    persistSupabaseState();
    return;
  }
  if (!API_BASE || !authToken || !canRemoteWrite()) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(async () => {
    try {
      await apiRequest("/state", {
        method: "PUT",
        body: JSON.stringify(state)
      });
    } catch (error) {
      console.warn("No se pudo sincronizar con backend", error);
      renderAuthState("Sin sincronizar");
    }
  }, 300);
}

async function initSupabaseSession() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    currentUser = null;
    renderAuthState();
    return;
  }
  await loadSupabaseSessionUser();
}

async function loginSupabase(username, password) {
  const email = username.trim().toLowerCase();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  await loadSupabaseSessionUser();
}

async function loadSupabaseSessionUser() {
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError || !authData.user) {
    currentUser = null;
    renderAuthState("Debe iniciar sesion.");
    return;
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile || !profile.active) {
    await db.auth.signOut();
    currentUser = null;
    renderAuthState("Usuario sin perfil activo.");
    return;
  }

  currentUser = profileToUser(profile);
  await db.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", currentUser.id);
  await loadSupabaseState();
  renderAuthState();
  renderAll();
}

async function loadSupabaseState() {
  const localState = normalizeState(state);
  let { data, error } = await db
    .from("loan_app_state")
    .select("data")
    .eq("id", SUPABASE_STATE_ID)
    .maybeSingle();

  if (isSchemaCacheError(error)) {
    await wait(1500);
    const retry = await db
      .from("loan_app_state")
      .select("data")
      .eq("id", SUPABASE_STATE_ID)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (isSchemaCacheError(error)) {
      throw new Error("Supabase aun no actualiza el cache de tablas. Ejecuta supabase-reload-schema-cache.sql y espera 60 segundos.");
    }
    throw new Error(`Error de Supabase: ${error.message}`);
  }

  const remoteState = normalizeState(data?.data || {});
  if (isStateEmpty(remoteState) && !isStateEmpty(localState) && canRemoteWrite()) {
    await saveSupabaseState(localState);
    Object.assign(state, localState);
  } else {
    Object.assign(state, remoteState);
  }

  if (isSupabaseAdmin()) {
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (!profilesError) state.users = (profiles || []).map(profileToUser);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistSupabaseState() {
  if (!supabaseReady || !currentUser || !canRemoteWrite()) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(async () => {
    try {
      await saveSupabaseState(normalizeState(state));
    } catch (error) {
      console.warn("No se pudo sincronizar con Supabase", error);
      renderAuthState("Sin sincronizar");
    }
  }, 300);
}

async function saveSupabaseState(nextState) {
  const { error } = await db.from("loan_app_state").upsert({
    id: SUPABASE_STATE_ID,
    data: nextState,
    updated_by: currentUser?.id || null,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(`Error de Supabase: ${error.message}`);
}

function authErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("email not confirmed")) return "El correo existe, pero falta confirmarlo en Supabase Auth.";
  if (message.includes("invalid login credentials")) return "Supabase no reconoce ese correo/contrasena.";
  return error?.message || "No se pudo iniciar sesion.";
}

function isSchemaCacheError(error) {
  return String(error?.message || "").toLowerCase().includes("schema cache");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function profileToUser(profile) {
  return {
    id: profile.id,
    username: profile.email,
    name: profile.name || profile.email,
    role: roleLabel(profile.role),
    dbRole: profile.role,
    status: profile.active ? "Activo" : "Inactivo",
    createdAt: profile.created_at,
    lastLogin: profile.last_login
  };
}

function roleLabel(role) {
  const roles = {
    admin: "Administrador",
    operator: "Operador",
    viewer: "Consulta"
  };
  return roles[role] || role;
}

function isSupabaseAdmin() {
  return currentUser?.dbRole === "admin";
}

function canRemoteWrite() {
  if (supabaseReady) return ["admin", "operator"].includes(currentUser?.dbRole);
  return currentUser?.role !== "Consulta";
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken && !options.skipAuth) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Error de servidor.");
  return payload;
}

function normalizeState(input) {
  return {
    clients: Array.isArray(input.clients) ? input.clients : [],
    loans: Array.isArray(input.loans) ? input.loans : [],
    payments: Array.isArray(input.payments) ? input.payments : [],
    users: Array.isArray(input.users) ? input.users : [],
    audit: Array.isArray(input.audit) ? input.audit : []
  };
}

function isStateEmpty(input) {
  return !input.clients.length && !input.loans.length && !input.payments.length;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function wireNavigation() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
      button.classList.add("active");
      byId(button.dataset.view).classList.add("active");
      byId("viewTitle").textContent = titles[button.dataset.view][0];
      byId("viewSubtitle").textContent = titles[button.dataset.view][1];
      renderAll();
    });
  });
}

function wireForms() {
  byId("clientDate").value = today();
  byId("paymentDate").value = byId("asOfDate").value || today();
  byId("disbursementDate").value = today();

  byId("clientForm").addEventListener("submit", saveClient);
  byId("loanForm").addEventListener("submit", saveLoan);
  byId("paymentForm").addEventListener("submit", savePayment);
  byId("userForm").addEventListener("submit", saveUser);

  byId("newClientBtn").addEventListener("click", clearClientForm);
  byId("newLoanBtn").addEventListener("click", openNewLoanForm);
  byId("closeLoanFormBtn").addEventListener("click", hideLoanForm);
  byId("loanFormOverlay").addEventListener("click", hideLoanForm);
  byId("saveLoanPaymentBtn").addEventListener("click", saveLoanFormPayment);
  byId("clearLoanPaymentBtn").addEventListener("click", clearLoanPaymentEditor);
  byId("seedBtn").addEventListener("click", seedDemoData);
  byId("resetBtn").addEventListener("click", resetData);
  byId("loginBtn").addEventListener("click", () => showLogin());
  byId("loginForm").addEventListener("submit", loginBackend);
  byId("logoutBtn").addEventListener("click", logoutBackend);
  byId("recalcDebtBtn").addEventListener("click", renderDebtView);
  byId("exportExcelBtn").addEventListener("click", exportReportCsv);
  byId("exportPdfBtn").addEventListener("click", () => window.print());
  byId("printReceiptBtn").addEventListener("click", printReceipt);
  byId("paymentLoan").addEventListener("change", renderPaymentPreview);
  byId("paymentAmount").addEventListener("input", renderPaymentPreview);
  byId("paymentApply").addEventListener("change", renderPaymentPreview);
  byId("asOfDate").addEventListener("change", () => {
    byId("paymentDate").value = byId("asOfDate").value || today();
    renderAll();
  });
  byId("controlMonth").addEventListener("change", renderAll);
  ["loanClient", "disbursementDate", "principal", "currency", "interestRate", "interestType", "loanMode", "installments"].forEach(id => {
    byId(id).addEventListener("change", autoLoanDates);
    byId(id).addEventListener("input", autoLoanDates);
  });
  ["loanPaymentDate", "loanPaymentAmount", "loanPaymentApply"].forEach(id => {
    byId(id).addEventListener("change", renderLoanPaymentPreview);
    byId(id).addEventListener("input", renderLoanPaymentPreview);
  });

  document.querySelectorAll(".form-tab").forEach(button => {
    button.addEventListener("click", () => switchLoanFormTab(button.dataset.loanTab));
  });

  document.querySelectorAll(".status-tab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".status-tab").forEach(tab => tab.classList.remove("active"));
      button.classList.add("active");
      monthlyStatusFilter = button.dataset.monthStatus || "";
      renderMonthlyControl();
    });
  });
}

function wireFilters() {
  ["clientSearch", "loanFilter", "loanClientFilter", "monthlyClientFilter", "reportClient", "reportStatus", "reportMode", "reportCurrency", "debtClient"].forEach(id => {
    const element = byId(id);
    element.addEventListener("input", renderAll);
    element.addEventListener("change", renderAll);
  });
}

function saveClient(event) {
  event.preventDefault();
  const id = byId("clientId").value || uid("CLI");
  const payload = {
    id,
    docType: byId("docType").value,
    docNumber: byId("docNumber").value.trim(),
    name: byId("clientName").value.trim(),
    phone: byId("phone").value.trim(),
    email: byId("email").value.trim(),
    address: byId("address").value.trim(),
    status: byId("clientStatus").value,
    registeredAt: byId("clientDate").value || today(),
    updatedAt: new Date().toISOString()
  };
  const index = state.clients.findIndex(client => client.id === id);
  if (index >= 0) state.clients[index] = { ...state.clients[index], ...payload };
  else state.clients.push({ ...payload, createdAt: new Date().toISOString() });
  saveState(index >= 0 ? "Cliente actualizado" : "Cliente creado", payload.name);
  clearClientForm();
  renderAll();
}

function clearClientForm() {
  byId("clientForm").reset();
  byId("clientId").value = "";
  byId("clientDate").value = today();
}

function editClient(id) {
  const client = state.clients.find(item => item.id === id);
  if (!client) return;
  byId("clientId").value = client.id;
  byId("docType").value = client.docType;
  byId("docNumber").value = client.docNumber;
  byId("clientName").value = client.name;
  byId("phone").value = client.phone;
  byId("email").value = client.email;
  byId("address").value = client.address;
  byId("clientStatus").value = client.status;
  byId("clientDate").value = client.registeredAt;
}

function saveLoan(event) {
  event.preventDefault();
  if (!state.clients.length) {
    alert("Registre al menos un cliente.");
    return;
  }
  const id = byId("loanId").value || uid("PRE");
  const existingLoan = state.loans.find(loan => loan.id === id);
  const payload = {
    id,
    code: existingLoan?.code || nextLoanCode(byId("disbursementDate").value),
    clientId: byId("loanClient").value,
    disbursementDate: byId("disbursementDate").value,
    principal: Number(byId("principal").value || 0),
    currency: byId("currency").value,
    interestRate: Number(byId("interestRate").value || 0),
    interestType: byId("interestType").value,
    mode: byId("loanMode").value,
    hasSchedule: byId("hasSchedule").value === "true",
    termDays: Number(byId("termDays").value || 0),
    estimatedPayDate: byId("estimatedPayDate").value,
    firstPayDate: byId("firstPayDate").value,
    installments: Number(byId("installments").value || 0),
    status: byId("loanStatus").value,
    note: byId("loanNote").value.trim(),
    updatedAt: new Date().toISOString()
  };
  const index = state.loans.findIndex(loan => loan.id === id);
  if (index >= 0) state.loans[index] = { ...state.loans[index], ...payload };
  else state.loans.push({ ...payload, createdAt: new Date().toISOString() });
  syncLoanStatusByBalance(id, byId("asOfDate").value || today());
  saveState(index >= 0 ? "Prestamo actualizado" : "Prestamo creado", payload.id);
  clearLoanForm();
  hideLoanForm();
  renderAll();
}

function openNewLoanForm() {
  clearLoanForm();
  showLoanForm("Nuevo prestamo");
}

function showLoanForm(title = "Prestamo") {
  byId("loanFormTitle").textContent = title;
  byId("loanFormOverlay").hidden = false;
  byId("loanFormOverlay").classList.remove("hidden");
  byId("loanForm").hidden = false;
  byId("loanForm").classList.remove("hidden");
  document.body.classList.add("modal-open");
  updateLoanScheduleTabVisibility();
  renderLoanFormPayments();
}

function hideLoanForm() {
  byId("loanFormOverlay").hidden = true;
  byId("loanFormOverlay").classList.add("hidden");
  byId("loanForm").hidden = true;
  byId("loanForm").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function clearLoanForm() {
  byId("loanForm").reset();
  byId("loanId").value = "";
  byId("disbursementDate").value = today();
  byId("interestRate").value = 0;
  byId("installments").value = 0;
  byId("termDays").value = 0;
  clearLoanPaymentEditor();
  switchLoanFormTab("conditions");
  autoLoanDates();
  updateLoanScheduleTabVisibility();
}

function editLoan(id) {
  const loan = state.loans.find(item => item.id === id);
  if (!loan) return;
  showLoanForm(`Editar ${loanCode(loan)}`);
  byId("loanId").value = loan.id;
  byId("loanClient").value = loan.clientId;
  byId("disbursementDate").value = loan.disbursementDate;
  byId("principal").value = loan.principal;
  byId("currency").value = loan.currency;
  byId("interestRate").value = loan.interestRate;
  byId("interestType").value = loan.interestType;
  byId("loanMode").value = loan.mode;
  byId("hasSchedule").value = String(loan.hasSchedule);
  byId("termDays").value = loan.termDays || inferTermDays(loan);
  byId("estimatedPayDate").value = loan.estimatedPayDate || "";
  byId("firstPayDate").value = loan.firstPayDate || "";
  byId("installments").value = loan.installments || 0;
  byId("loanStatus").value = effectiveLoanStatus(loan, calculateLoanDebt(loan, byId("asOfDate").value || today()));
  byId("loanNote").value = loan.note || "";
  autoLoanDates();
  clearLoanPaymentEditor();
  updateLoanScheduleTabVisibility();
  renderLoanFormPayments();
}

function autoLoanDates() {
  const disbursement = byId("disbursementDate").value;
  if (!disbursement) return;
  const mode = byId("loanMode").value;
  const isPeriodic = isPeriodicMode(mode);
  const installments = Number(byId("installments").value || 0);
  const intervalDays = paymentIntervalDays();

  if (isPeriodic || mode === "Con cronograma") {
    byId("hasSchedule").value = installments > 0 ? "true" : "false";
    byId("firstPayDate").value = addDays(disbursement, intervalDays);
    const periods = Math.max(installments, 1);
    byId("termDays").value = String(intervalDays * periods);
    byId("estimatedPayDate").value = addDays(disbursement, intervalDays * periods);
    renderLoanSummary();
    return;
  }

  if (mode === "Sin cronograma" || mode === "Pago libre / flexible") {
    byId("hasSchedule").value = "false";
  }
  byId("firstPayDate").value = "";
  byId("termDays").value = "";
  byId("estimatedPayDate").value = "";
  renderLoanSummary();
  updateLoanScheduleTabVisibility();
}

function isPeriodicMode(mode) {
  return ["Pago diario", "Pago semanal", "Pago quincenal", "Pago mensual"].includes(mode);
}

function paymentIntervalDays() {
  const mode = byId("loanMode").value;
  const interestType = byId("interestType").value;
  if (mode === "Pago diario") return 1;
  if (mode === "Pago semanal") return 7;
  if (mode === "Pago quincenal") return 15;
  if (mode === "Pago mensual") return 30;
  if (interestType === "Interes porcentual diario") return 1;
  if (interestType === "Interes porcentual quincenal") return 15;
  if (interestType === "Interes porcentual mensual") return 30;
  return 30;
}

function renderLoanSummary() {
  const amount = Number(byId("principal").value || 0);
  const currency = byId("currency").value || "PEN";
  const clientId = byId("loanClient").value;
  const mode = byId("loanMode").value;
  const installments = Number(byId("installments").value || 0);
  const interval = isPeriodicMode(mode) ? paymentIntervalDays() : 0;
  const firstPay = byId("firstPayDate").value;
  const finalDate = byId("estimatedPayDate").value;
  const termDays = byId("termDays").value;
  const interest = byId("interestType").value === "Sin interes"
    ? "Sin interes"
    : `${byId("interestRate").value || 0}% - ${byId("interestType").value}`;
  const scheduleText = installments > 0 && interval
    ? `${installments} pagos cada ${interval} dias`
    : "Sin cronograma automatico";
  byId("loanSummary").innerHTML = `
    <div class="summary-title">Resumen del prestamo</div>
    <div class="summary-grid">
      <span>Cliente</span><strong>${escapeHtml(clientId ? clientName(clientId) : "Seleccione cliente")}</strong>
      <span>Monto</span><strong>${formatCurrency(amount, currency)}</strong>
      <span>Cobro</span><strong>${escapeHtml(mode)}${interval ? ` cada ${interval} dias` : ""}</strong>
      <span>Interes</span><strong>${escapeHtml(interest)}</strong>
      <span>Cuotas</span><strong>${scheduleText}</strong>
      <span>Primer pago</span><strong>${firstPay || "No aplica"}</strong>
      <span>Fecha final</span><strong>${finalDate || "Libre / sin fecha"}</strong>
      <span>Plazo</span><strong>${termDays ? `${termDays} dias` : "No definido"}</strong>
    </div>`;
  updateLoanScheduleTabVisibility();
}

function savePayment(event) {
  event.preventDefault();
  const loan = state.loans.find(item => item.id === byId("paymentLoan").value);
  if (!loan) return;
  const amount = Number(byId("paymentAmount").value || 0);
  const asOf = byId("paymentDate").value;
  const before = calculateLoanDebt(loan, asOf);
  const applied = applyPayment(amount, before, byId("paymentApply").value);
  const payment = buildPaymentRecord(loan, amount, asOf, applied, before, {
    method: byId("paymentMethod").value,
    operationNumber: byId("operationNumber").value.trim(),
    note: byId("paymentNote").value.trim()
  });
  state.payments.push(payment);
  selectedReceiptId = payment.id;
  syncLoanStatusByBalance(loan.id, asOf);
  saveState("Pago registrado", `${loanCode(loan)} - ${formatCurrency(amount, loan.currency)}`);
  byId("paymentForm").reset();
  byId("paymentDate").value = byId("asOfDate").value || today();
  byId("paymentLoan").value = loan.id;
  renderAll();
}

function buildPaymentRecord(loan, amount, date, applied, before, details = {}) {
  const afterCapital = Math.max(0, before.capitalPending - applied.capital);
  const afterInterest = Math.max(0, before.interestPending - applied.interest);
  return {
    id: uid("PAG"),
    loanId: loan.id,
    clientId: loan.clientId,
    date,
    amount,
    appliedCapital: applied.capital,
    appliedInterest: applied.interest,
    method: details.method || "Efectivo",
    operationNumber: details.operationNumber || "",
    capitalBefore: before.capitalPending,
    capitalAfter: afterCapital,
    interestBefore: before.interestPending,
    interestAfter: afterInterest,
    note: details.note || "",
    status: "Activo",
    user: currentUser?.username || "admin.local",
    createdAt: new Date().toISOString()
  };
}

async function saveUser(event) {
  event.preventDefault();
  if (supabaseReady) {
    alert("En modo Supabase, cree el usuario en Authentication > Users y luego ajuste su rol en la tabla profiles.");
    return;
  }
  const payload = {
    username: byId("userName").value.trim(),
    name: byId("userName").value.trim(),
    password: byId("userPassword").value || "Cambiar123!",
    role: byId("userRole").value,
    status: byId("userStatus").value
  };
  if (API_BASE && currentUser) {
    try {
      const created = await apiRequest("/security/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.users.push(created);
      saveState("Usuario creado", created.username);
      byId("userForm").reset();
      renderAll();
    } catch (error) {
      alert(error.message || "No se pudo crear el usuario.");
    }
    return;
  }
  state.users.push({
    id: uid("USR"),
    name: payload.name,
    role: payload.role,
    status: payload.status,
    createdAt: new Date().toISOString()
  });
  saveState("Usuario creado", payload.name);
  byId("userForm").reset();
  renderAll();
}

function renderAll() {
  refreshSelects();
  renderDashboard();
  renderMonthlyControl();
  renderClients();
  renderLoans();
  renderPayments();
  renderDebtView();
  renderReports();
  renderSecurity();
  renderPaymentPreview();
  renderLoanSummary();
}

function refreshSelects() {
  const asOf = byId("asOfDate")?.value || today();
  const currentLoanClient = byId("loanClient").value;
  const currentDebtClient = byId("debtClient").value;
  const currentReportClient = byId("reportClient").value;
  const currentLoanClientFilter = byId("loanClientFilter").value;
  const currentMonthlyClientFilter = byId("monthlyClientFilter").value;
  const currentPaymentLoan = byId("paymentLoan").value;
  const clientOptions = state.clients.map(client => `<option value="${client.id}">${escapeHtml(client.name)} - ${escapeHtml(client.docNumber)}</option>`).join("");
  byId("loanClient").innerHTML = clientOptions || `<option value="">Sin clientes</option>`;
  byId("debtClient").innerHTML = clientOptions || `<option value="">Sin clientes</option>`;
  byId("reportClient").innerHTML = `<option value="">Todos</option>${clientOptions}`;
  byId("loanClientFilter").innerHTML = `<option value="">Todos los clientes</option>${clientOptions}`;
  byId("monthlyClientFilter").innerHTML = `<option value="">Todos los clientes</option>${clientOptions}`;
  byId("paymentLoan").innerHTML = state.loans
    .filter(loan => {
      const calc = calculateLoanDebt(loan, asOf);
      const status = effectiveLoanStatus(loan, calc);
      return status !== "Anulado" && status !== "Pagado";
    })
    .map((loan, index) => `<option value="${loan.id}">${escapeHtml(paymentLoanOptionLabel(loan, index))}</option>`)
    .join("") || `<option value="">Sin prestamos activos</option>`;
  restoreSelectValue("loanClient", currentLoanClient);
  restoreSelectValue("debtClient", currentDebtClient);
  restoreSelectValue("reportClient", currentReportClient);
  restoreSelectValue("loanClientFilter", currentLoanClientFilter);
  restoreSelectValue("monthlyClientFilter", currentMonthlyClientFilter);
  restoreSelectValue("paymentLoan", currentPaymentLoan);
}

function paymentLoanOptionLabel(loan, index = 0) {
  return `${loanCode(loan, index)} - ${clientName(loan.clientId)} - ${formatDateShort(loan.disbursementDate)} - ${formatCurrency(loan.principal, loan.currency)}`;
}

function renderDashboard() {
  const asOf = byId("asOfDate").value || today();
  const dashboardRange = monthlyControlRange(asOf.slice(0, 7), asOf);
  const debts = state.loans.map(loan => ({ loan, calc: calculateLoanDebt(loan, asOf) }));
  const active = debts.filter(item => item.loan.status !== "Anulado");
  const operationalRows = dashboardRange.hasStarted
    ? active.map(item => buildMonthlyLoanRow(item.loan, dashboardRange))
    : [];
  const totalDisbursed = sum(active.map(item => item.loan.principal));
  const totalPaid = sum(state.payments.filter(payment => payment.status === "Activo").map(payment => payment.amount));
  const capitalPending = sum(active.map(item => item.calc.capitalPending));
  const interestPending = sum(active.map(item => item.calc.interestPending));
  const debtTotal = sum(active.map(item => item.calc.totalDebt));
  const activeCount = operationalRows.filter(row => row.monthStatus === "Al dia" || row.monthStatus === "Vence este mes" || row.monthStatus === "Pago parcial").length;
  const overdueCount = operationalRows.filter(row => row.monthStatus === "En mora").length;
  const clientsWithDebt = new Set(active.filter(item => item.calc.totalDebt > 0).map(item => item.loan.clientId)).size;
  const clientsWithLate = new Set(operationalRows.filter(row => row.monthStatus === "En mora").map(row => row.loan.clientId)).size;
  const clientsOk = Math.max(0, state.clients.length - clientsWithLate);
  const monthPayments = paymentsInMonth(asOf);

  byId("metrics").innerHTML = [
    metric("Total desembolsado", formatCurrency(totalDisbursed, "PEN"), `${state.loans.length} prestamos`),
    metric("Total cobrado", formatCurrency(totalPaid, "PEN"), "Pagos activos"),
    metric("Capital pendiente", formatCurrency(capitalPending, "PEN"), `${clientsWithDebt} clientes con deuda`),
    metric("Interes pendiente", formatCurrency(interestPending, "PEN"), "Acumulado a la fecha"),
    metric("Deuda total actual", formatCurrency(debtTotal, "PEN"), asOf),
    metric("Prestamos vigentes", activeCount, `${overdueCount} vencidos o atrasados`),
    metric("Clientes al dia", clientsOk, `${clientsWithLate} con mora`),
    metric("Pagos del mes", formatCurrency(monthPayments, "PEN"), "Mes seleccionado")
  ].join("");

  renderPieSummary("stateBars", groupCount(operationalRows.map(row => ({ status: row.monthStatus })), "status"));
  const debtByClient = {};
  active.forEach(item => {
    debtByClient[clientName(item.loan.clientId)] = (debtByClient[clientName(item.loan.clientId)] || 0) + item.calc.totalDebt;
  });
  renderBars("clientDebtBars", debtByClient, true);

  byId("activeLoansTable").innerHTML = active
    .filter(item => item.calc.totalDebt > 0)
    .map(item => {
      const operational = operationalRows.find(row => row.loan.id === item.loan.id);
      return loanRow(item.loan, item.calc, operational?.monthStatus);
    })
    .join("") || emptyRow(7, "No hay prestamos activos con deuda.");
}

function renderMonthlyControl() {
  const month = byId("controlMonth").value || today().slice(0, 7);
  const asOf = byId("asOfDate").value || today();
  const range = monthlyControlRange(month, asOf);
  const statusFilter = monthlyStatusFilter;
  const clientFilter = byId("monthlyClientFilter").value;
  document.querySelectorAll(".status-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.monthStatus === statusFilter);
  });

  const rows = range.hasStarted
    ? state.loans
      .filter(loan => loan.status !== "Anulado")
      .filter(loan => parseDate(loan.disbursementDate) <= range.cutoff)
      .map(loan => buildMonthlyLoanRow(loan, range))
      .filter(row => !row.calc.paidOffDate || parseDate(row.calc.paidOffDate) >= range.start)
    : [];

  const visibleRows = rows
    .filter(row => !clientFilter || row.loan.clientId === clientFilter)
    .filter(row => !statusFilter || row.monthStatus === statusFilter);
  const disbursedInMonth = rows.filter(row => isDateInControlRange(row.loan.disbursementDate, range));
  const paidInMonth = rows.filter(row => row.monthStatus === "Pagado");
  const lateRows = rows.filter(row => row.monthStatus === "En mora");
  const monthPayments = state.payments.filter(payment => payment.status === "Activo" && isDateInControlRange(payment.date, range));

  byId("monthlyMetrics").innerHTML = [
    metric("Prestamos desembolsados", disbursedInMonth.length, formatCurrency(sum(disbursedInMonth.map(row => row.loan.principal)), "PEN")),
    metric("Pagos recibidos", formatCurrency(sum(monthPayments.map(payment => payment.amount)), "PEN"), `${monthPayments.length} pagos al corte`),
    metric("Capital recuperado", formatCurrency(sum(monthPayments.map(payment => payment.appliedCapital)), "PEN"), "Aplicado a capital"),
    metric("Interes cobrado", formatCurrency(sum(monthPayments.map(payment => payment.appliedInterest)), "PEN"), "Aplicado a interes"),
    metric("Prestamos pagados", paidInMonth.length, "Sin saldo al corte"),
    metric("Prestamos con mora", lateRows.length, `${formatCurrency(sum(lateRows.map(row => row.calc.totalDebt)), "PEN")} vencido`),
    metric("Clientes con deuda", new Set(rows.filter(row => row.calc.totalDebt > 0).map(row => row.loan.clientId)).size, "Saldo pendiente"),
    metric("Saldo cartera", formatCurrency(sum(rows.map(row => row.calc.totalDebt)), "PEN"), `Al ${range.cutoffString}`),
    `<div class="mini-pie-card"><h3>Estados del mes</h3><div id="monthlyStatePie" class="pie-summary"></div></div>`,
    `<div class="mini-pie-card"><h3>Mora por cliente</h3><div id="monthlyLatePie" class="pie-summary"></div></div>`
  ].join("");

  const lateByClient = {};
  lateRows.forEach(row => {
    lateByClient[clientName(row.loan.clientId)] = (lateByClient[clientName(row.loan.clientId)] || 0) + row.calc.totalDebt;
  });
  renderPieSummary("monthlyStatePie", groupCount(rows, "monthStatus"));
  renderPieSummary("monthlyLatePie", lateByClient, true);

  byId("monthlyControlTable").innerHTML = visibleRows.map(row => `
    <tr>
      <td>
        <div class="table-actions">
          <button class="pay-action" onclick="quickInterestPayment('${row.loan.id}')">Pagar</button>
          <button onclick="openLoanFromMonthly('${row.loan.id}')">Editar</button>
        </div>
      </td>
      <td>${escapeHtml(clientName(row.loan.clientId))}</td>
      <td>${row.loan.disbursementDate}</td>
      <td>${formatCurrency(row.loan.principal, row.loan.currency)}</td>
      <td>${row.loan.interestRate}%</td>
      <td>${row.loan.mode}</td>
      <td>${formatCurrency(row.paidThisMonth, row.loan.currency)}</td>
      <td><strong>${formatCurrency(row.calc.interestPending, row.loan.currency)}</strong></td>
      <td><strong>${formatCurrency(row.calc.totalDebt, row.loan.currency)}</strong></td>
      <td>${row.dueDate || "Sin fecha"}</td>
      <td>${row.daysLate > 0 ? row.daysLate : "-"}</td>
      <td><span class="pill ${monthStatusClass(row.monthStatus)}">${row.monthStatus}</span></td>
    </tr>`).join("") || emptyRow(12, "No hay prestamos para el filtro mensual seleccionado.");
}

function buildMonthlyLoanRow(loan, range) {
  const calc = calculateLoanDebt(loan, range.cutoffString);
  const payments = state.payments.filter(payment => payment.loanId === loan.id && payment.status === "Activo" && isDateInControlRange(payment.date, range));
  const paidThisMonth = sum(payments.map(payment => payment.amount));
  const dueDate = monthlyDueDate(loan, calc, range);
  const dueInMonth = dueDate ? isDateInRange(dueDate, range) : false;
  const daysLate = monthlyDaysLate(loan, calc, paidThisMonth, dueDate, range);
  const monthStatus = monthlyLoanStatus(loan, calc, paidThisMonth, dueDate, dueInMonth, payments, range, daysLate);
  return { loan, calc, payments, paidThisMonth, dueDate, dueInMonth, daysLate, monthStatus };
}

function monthlyLoanStatus(loan, calc, paidThisMonth, dueDate, dueInMonth, payments, range, daysLate) {
  const lastPaymentInMonth = payments.length ? payments[payments.length - 1] : null;
  if (calc.totalDebt <= 0 && (lastPaymentInMonth || loan.status === "Pagado")) return "Pagado";
  if (calc.interestPending <= 0 && paidThisMonth > 0) return "Al dia";
  if (daysLate > 0 || loan.status === "Vencido") return "En mora";
  if (paidThisMonth > 0) return "Pago parcial";
  if (dueInMonth) return "Vence este mes";
  if (dueDate && parseDate(dueDate) > range.cutoff) return "Al dia";
  return "Sin pago";
}

function renderClients() {
  const query = byId("clientSearch").value.toLowerCase();
  const clients = state.clients.filter(client => `${client.name} ${client.docNumber}`.toLowerCase().includes(query));
  byId("clientsList").innerHTML = clients.map(client => {
    const summary = clientSummary(client.id);
    return `
      <article class="list-item">
        <div class="list-item-head">
          <div><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.docType)} ${escapeHtml(client.docNumber)} | ${escapeHtml(client.phone || "Sin telefono")}</small></div>
          <span class="pill ${client.status === "Activo" ? "ok" : "warn"}">${client.status}</span>
        </div>
        <div>Prestamos: ${summary.loans} | Deuda actual: <strong>${formatCurrency(summary.debt, "PEN")}</strong></div>
        <div class="item-actions">
          <button onclick="editClient('${client.id}')">Editar</button>
          <button onclick="selectDebtClient('${client.id}')">Ver deuda</button>
        </div>
      </article>`;
  }).join("") || `<div class="empty">No hay clientes registrados.</div>`;
}

function renderLoans() {
  const filter = byId("loanFilter").value;
  const clientFilter = byId("loanClientFilter").value;
  const asOf = byId("asOfDate").value || today();
  const loans = state.loans
    .map(loan => ({ loan, calc: calculateLoanDebt(loan, asOf) }))
    .map(item => ({ ...item, effectiveStatus: effectiveLoanStatus(item.loan, item.calc) }))
    .filter(item => !filter || item.effectiveStatus === filter)
    .filter(item => !clientFilter || item.loan.clientId === clientFilter);
  byId("loansList").innerHTML = loans.map((item, index) => {
    const { loan, calc, effectiveStatus } = item;
    return `
      <tr>
        <td><strong>${escapeHtml(loanCode(loan, index))}</strong><small class="muted-id">${escapeHtml(loan.id)}</small></td>
        <td>${escapeHtml(clientName(loan.clientId))}</td>
        <td>${loan.disbursementDate}</td>
        <td>${formatCurrency(loan.principal, loan.currency)}</td>
        <td>${loan.mode}</td>
        <td>${loan.installments || "-"}</td>
        <td>${formatCurrency(calc.totalPaid, loan.currency)}</td>
        <td><strong>${formatCurrency(calc.totalDebt, loan.currency)}</strong></td>
        <td>${calc.daysLate > 0 ? `${calc.daysLate} dias` : "-"}</td>
        <td><span class="pill ${statusClass(effectiveStatus, calc)}">${effectiveStatus}</span></td>
        <td>
          <div class="table-actions">
            <button onclick="editLoan('${loan.id}')">Editar</button>
            <button onclick="focusPayment('${loan.id}')">Pago</button>
            <button onclick="voidLoan('${loan.id}')">Anular</button>
          </div>
        </td>
      </tr>`;
  }).join("") || emptyRow(11, "No hay prestamos registrados.");

  renderLoanFormSchedule();
}

function renderPayments() {
  const month = byId("controlMonth").value || today().slice(0, 7);
  const asOf = byId("asOfDate").value || today();
  const range = monthlyControlRange(month, asOf);
  const payments = range.hasStarted
    ? state.payments.filter(payment => payment.status === "Activo" && isDateInControlRange(payment.date, range))
    : [];
  const selectedPayment = payments.find(item => item.id === selectedReceiptId);
  byId("printReceiptBtn").textContent = selectedPayment ? `Comprobante ${selectedPayment.id}` : "Comprobante";
  byId("paymentsList").innerHTML = `
    <div class="table-wrap monthly-payments-table">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Prestamo</th>
            <th>Cliente</th>
            <th>Monto</th>
            <th>Medio</th>
            <th>Nota</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(payment => {
    const loan = state.loans.find(item => item.id === payment.loanId);
    const isSelected = payment.id === selectedReceiptId;
    return `
      <tr class="${isSelected ? "selected-row" : ""}">
        <td>${payment.date}</td>
        <td>${loan ? loanCode(loan) : payment.loanId}</td>
        <td>${escapeHtml(clientName(payment.clientId))}</td>
        <td><strong>${formatCurrency(payment.amount, loan?.currency || "PEN")}</strong></td>
        <td>${escapeHtml(payment.method)}</td>
        <td>${escapeHtml(payment.note || payment.operationNumber || "-")}</td>
        <td>
          <div class="table-actions">
            <button class="${isSelected ? "selected-action" : ""}" onclick="selectReceipt('${payment.id}')">${isSelected ? "Seleccionado" : "Seleccionar"}</button>
            <button onclick="voidPayment('${payment.id}')">Anular</button>
          </div>
        </td>
      </tr>`;
  }).join("") || emptyRow(7, "No hay pagos registrados en el mes.")}
        </tbody>
      </table>
    </div>`;
}

function renderDebtView() {
  const clientId = byId("debtClient").value;
  const asOf = byId("asOfDate").value || today();
  const clientLoans = state.loans.filter(loan => loan.clientId === clientId && loan.status !== "Anulado");
  const rows = clientLoans.map(loan => ({ loan, calc: calculateLoanDebt(loan, asOf) }));
  const totals = {
    loans: rows.filter(item => item.calc.totalDebt > 0).length,
    disbursed: sum(rows.map(item => item.loan.principal)),
    capital: sum(rows.map(item => item.calc.capitalPending)),
    interest: sum(rows.map(item => item.calc.interestPending)),
    debt: sum(rows.map(item => item.calc.totalDebt)),
    paid: sum(rows.map(item => item.calc.totalPaid))
  };
  byId("clientDebtSummary").innerHTML = [
    metric("Prestamos activos", totals.loans, "Con saldo"),
    metric("Desembolsado", formatCurrency(totals.disbursed, "PEN"), "Total historico"),
    metric("Capital pendiente", formatCurrency(totals.capital, "PEN"), "Por cobrar"),
    metric("Interes pendiente", formatCurrency(totals.interest, "PEN"), "A la fecha"),
    metric("Deuda total", formatCurrency(totals.debt, "PEN"), `Pagado ${formatCurrency(totals.paid, "PEN")}`)
  ].join("");
  byId("clientDebtTable").innerHTML = rows.map(item => `
    <tr>
      <td>${loanCode(item.loan)}</td>
      <td>${item.loan.disbursementDate}</td>
      <td>${formatCurrency(item.calc.capitalPending, item.loan.currency)}</td>
      <td>${formatCurrency(item.calc.interestPending, item.loan.currency)}</td>
      <td><strong>${formatCurrency(item.calc.totalDebt, item.loan.currency)}</strong></td>
      <td>${item.calc.lastPayment || "Sin pagos"}</td>
      <td>${item.calc.daysLate > 0 ? `${item.calc.daysLate} dias` : "Al dia"}</td>
    </tr>`).join("") || emptyRow(7, "Seleccione un cliente con prestamos.");
}

function renderReports() {
  const asOf = byId("asOfDate").value || today();
  const clientId = byId("reportClient").value;
  const status = byId("reportStatus").value;
  const mode = byId("reportMode").value;
  const currency = byId("reportCurrency").value;
  const rows = state.loans
    .filter(loan => !clientId || loan.clientId === clientId)
    .filter(loan => !mode || loan.mode === mode)
    .filter(loan => !currency || loan.currency === currency)
    .map(loan => ({ loan, calc: calculateLoanDebt(loan, asOf) }))
    .filter(item => !status || effectiveLoanStatus(item.loan, item.calc) === status);
  byId("reportsTable").innerHTML = rows.map(item => `
    <tr>
      <td>${escapeHtml(clientName(item.loan.clientId))}</td>
      <td>${loanCode(item.loan)}</td>
      <td>${item.loan.disbursementDate}</td>
      <td>${effectiveLoanStatus(item.loan, item.calc)}</td>
      <td>${item.loan.mode}</td>
      <td>${item.loan.currency}</td>
      <td>${formatCurrency(item.loan.principal, item.loan.currency)}</td>
      <td>${formatCurrency(item.calc.totalPaid, item.loan.currency)}</td>
      <td>${formatCurrency(item.calc.capitalPending, item.loan.currency)}</td>
      <td>${formatCurrency(item.calc.interestPending, item.loan.currency)}</td>
      <td>${formatCurrency(item.calc.totalDebt, item.loan.currency)}</td>
    </tr>`).join("") || emptyRow(11, "No hay informacion para los filtros seleccionados.");
}

function renderSecurity() {
  const userRows = state.users.map(user => `<div><strong>${escapeHtml(user.name)}</strong> | ${user.role} | ${user.status}</div>`).join("");
  const auditRows = state.audit.slice(0, 30).map(item => `
    <article class="list-item">
      <div class="list-item-head">
        <div><strong>${escapeHtml(item.action)}</strong><small>${new Date(item.createdAt).toLocaleString("es-PE")} | ${escapeHtml(item.user)}</small></div>
      </div>
      <div>${escapeHtml(item.detail || "")}</div>
    </article>`).join("");
  byId("auditList").innerHTML = `${userRows ? `<div class="preview">${userRows}</div>` : ""}${auditRows || `<div class="empty">Sin auditoria registrada.</div>`}`;
}

function renderPaymentPreview() {
  const loan = state.loans.find(item => item.id === byId("paymentLoan").value);
  if (!loan) {
    byId("paymentPreview").innerHTML = "Seleccione un prestamo activo.";
    return;
  }
  const calc = calculateLoanDebt(loan, byId("paymentDate").value || today());
  const amount = Number(byId("paymentAmount").value || 0);
  const applied = applyPayment(amount, calc, byId("paymentApply").value);
  byId("paymentPreview").innerHTML = `
    Saldo antes: <strong>${formatCurrency(calc.totalDebt, loan.currency)}</strong>.
    Aplicado a interes: ${formatCurrency(applied.interest, loan.currency)}.
    Aplicado a capital: ${formatCurrency(applied.capital, loan.currency)}.
    Saldo estimado despues: <strong>${formatCurrency(Math.max(0, calc.totalDebt - amount), loan.currency)}</strong>.`;
}

function switchLoanFormTab(tab) {
  document.querySelectorAll(".form-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.loanTab === tab);
  });
  byId("loanConditionsTab").classList.toggle("hidden", tab !== "conditions");
  byId("loanConditionsTab").classList.toggle("active", tab === "conditions");
  byId("loanPaymentsTab").classList.toggle("hidden", tab !== "payments");
  byId("loanPaymentsTab").classList.toggle("active", tab === "payments");
  byId("loanScheduleTab").classList.toggle("hidden", tab !== "schedule");
  byId("loanScheduleTab").classList.toggle("active", tab === "schedule");
  if (tab === "payments") renderLoanFormPayments();
  if (tab === "schedule") renderLoanFormSchedule();
}

function renderLoanFormPayments() {
  const loanId = byId("loanId").value;
  const loan = state.loans.find(item => item.id === loanId);
  if (!loan) {
    byId("loanPaymentsTable").innerHTML = emptyRow(7, "Guarde el prestamo antes de registrar pagos.");
    byId("loanPaymentEditor").classList.add("disabled-block");
    byId("saveLoanPaymentBtn").disabled = true;
    byId("loanPaymentPreview").innerHTML = "Primero guarde el prestamo.";
    return;
  }
  byId("loanPaymentEditor").classList.remove("disabled-block");
  byId("saveLoanPaymentBtn").disabled = false;
  if (!byId("loanPaymentDate").value) byId("loanPaymentDate").value = byId("asOfDate").value || today();
  const payments = state.payments
    .filter(payment => payment.loanId === loan.id && payment.status === "Activo")
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));
  byId("loanPaymentsTable").innerHTML = payments.map(payment => `
    <tr>
      <td>${payment.date}</td>
      <td><strong>${formatCurrency(payment.amount, loan.currency)}</strong></td>
      <td>Cap. ${formatCurrency(payment.appliedCapital, loan.currency)}<br>Int. ${formatCurrency(payment.appliedInterest, loan.currency)}</td>
      <td>${escapeHtml(payment.method)}</td>
      <td>${escapeHtml(payment.operationNumber || "-")}</td>
      <td>${escapeHtml(payment.note || "-")}</td>
      <td>
        <div class="table-actions">
          <button type="button" onclick="editLoanFormPayment('${payment.id}')">Editar</button>
          <button type="button" onclick="voidLoanFormPayment('${payment.id}')">Eliminar</button>
        </div>
      </td>
    </tr>`).join("") || emptyRow(7, "Este prestamo no tiene pagos registrados.");
  renderLoanPaymentPreview();
}

function currentLoanHasSchedule() {
  return byId("hasSchedule").value === "true" && Number(byId("installments").value || 0) > 0 && !!byId("firstPayDate").value;
}

function updateLoanScheduleTabVisibility() {
  if (!byId("loanScheduleTabBtn")) return;
  const visible = currentLoanHasSchedule();
  byId("loanScheduleTabBtn").classList.toggle("hidden", !visible);
  if (!visible && byId("loanScheduleTab").classList.contains("active")) {
    switchLoanFormTab("conditions");
  }
  if (visible) renderLoanFormSchedule();
}

function renderLoanFormSchedule() {
  const table = byId("loanScheduleTable");
  if (!table) return;
  const loanId = byId("loanId").value;
  const savedLoan = state.loans.find(item => item.id === loanId);
  const loan = savedLoan || loanFromForm();
  if (!loan || !loan.hasSchedule || !loan.installments || !loan.firstPayDate) {
    table.innerHTML = emptyRow(7, "Este prestamo no tiene cronograma.");
    return;
  }
  table.innerHTML = buildScheduleRows(loan).join("") || emptyRow(7, "Este prestamo no tiene cronograma.");
}

function loanFromForm() {
  const disbursementDate = byId("disbursementDate").value;
  if (!disbursementDate) return null;
  return {
    id: byId("loanId").value || "PRE-VISTA",
    code: byId("loanId").value ? undefined : "Vista previa",
    clientId: byId("loanClient").value,
    disbursementDate,
    principal: Number(byId("principal").value || 0),
    currency: byId("currency").value,
    interestRate: Number(byId("interestRate").value || 0),
    interestType: byId("interestType").value,
    mode: byId("loanMode").value,
    hasSchedule: byId("hasSchedule").value === "true",
    termDays: Number(byId("termDays").value || 0),
    estimatedPayDate: byId("estimatedPayDate").value,
    firstPayDate: byId("firstPayDate").value,
    installments: Number(byId("installments").value || 0),
    status: byId("loanStatus").value || "Vigente",
    note: byId("loanNote").value.trim()
  };
}

function renderLoanPaymentPreview() {
  const loan = state.loans.find(item => item.id === byId("loanId").value);
  if (!loan) return;
  const date = byId("loanPaymentDate").value || byId("asOfDate").value || today();
  const editingId = byId("loanPaymentId").value;
  const calc = calculateLoanDebt(loan, date, editingId);
  const amount = Number(byId("loanPaymentAmount").value || 0);
  const applied = applyPayment(amount, calc, byId("loanPaymentApply").value);
  byId("loanPaymentPreview").innerHTML = `
    Saldo antes: <strong>${formatCurrency(calc.totalDebt, loan.currency)}</strong>.
    Interes: ${formatCurrency(applied.interest, loan.currency)}.
    Capital: ${formatCurrency(applied.capital, loan.currency)}.
    Saldo despues: <strong>${formatCurrency(Math.max(0, calc.totalDebt - amount), loan.currency)}</strong>.`;
}

function clearLoanPaymentEditor() {
  if (!byId("loanPaymentId")) return;
  byId("loanPaymentId").value = "";
  byId("loanPaymentDate").value = byId("asOfDate")?.value || today();
  byId("loanPaymentAmount").value = "";
  byId("loanPaymentApply").value = "auto";
  byId("loanPaymentMethod").value = "Efectivo";
  byId("loanPaymentOperation").value = "";
  byId("loanPaymentNote").value = "";
  byId("saveLoanPaymentBtn").textContent = "Guardar";
  renderLoanPaymentPreview();
}

function saveLoanFormPayment() {
  const loan = state.loans.find(item => item.id === byId("loanId").value);
  if (!loan) return;
  const amount = Number(byId("loanPaymentAmount").value || 0);
  if (amount <= 0) {
    alert("Ingrese un monto mayor a cero.");
    return;
  }
  const id = byId("loanPaymentId").value;
  const date = byId("loanPaymentDate").value || today();
  const before = calculateLoanDebt(loan, date, id);
  const applied = applyPayment(amount, before, byId("loanPaymentApply").value);
  const payment = buildPaymentRecord(loan, amount, date, applied, before, {
    method: byId("loanPaymentMethod").value,
    operationNumber: byId("loanPaymentOperation").value.trim(),
    note: byId("loanPaymentNote").value.trim()
  });
  if (id) {
    const index = state.payments.findIndex(item => item.id === id);
    if (index >= 0) state.payments[index] = { ...state.payments[index], ...payment, id, updatedAt: new Date().toISOString() };
    syncLoanStatusByBalance(loan.id, date);
    saveState("Pago actualizado", `${loanCode(loan)} - ${formatCurrency(amount, loan.currency)}`);
  } else {
    state.payments.push(payment);
    selectedReceiptId = payment.id;
    syncLoanStatusByBalance(loan.id, date);
    saveState("Pago registrado", `${loanCode(loan)} - ${formatCurrency(amount, loan.currency)}`);
  }
  clearLoanPaymentEditor();
  renderAll();
  renderLoanFormPayments();
}

function editLoanFormPayment(id) {
  const payment = state.payments.find(item => item.id === id);
  if (!payment) return;
  byId("loanPaymentId").value = payment.id;
  byId("loanPaymentDate").value = payment.date;
  byId("loanPaymentAmount").value = payment.amount;
  byId("loanPaymentApply").value = payment.appliedCapital > 0 && payment.appliedInterest <= 0 ? "capital" : payment.appliedInterest > 0 && payment.appliedCapital <= 0 ? "interest" : "auto";
  byId("loanPaymentMethod").value = payment.method || "Efectivo";
  byId("loanPaymentOperation").value = payment.operationNumber || "";
  byId("loanPaymentNote").value = payment.note || "";
  byId("saveLoanPaymentBtn").textContent = "Actualizar";
  renderLoanPaymentPreview();
}

function voidLoanFormPayment(id) {
  voidPayment(id);
  renderLoanFormPayments();
}

function calculateLoanDebt(loan, asOfDate, excludePaymentId = "") {
  const asOf = parseDate(asOfDate);
  const start = parseDate(loan.disbursementDate);
  const elapsedDays = Math.max(0, daysBetween(start, asOf));
  const loanPayments = state.payments
    .filter(payment => payment.id !== excludePaymentId && payment.loanId === loan.id && payment.status === "Activo" && parseDate(payment.date) <= asOf)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const paidOffDate = findLoanPaidOffDate(loan, loanPayments);
  const interestCutoffDate = paidOffDate && parseDate(paidOffDate) < asOf ? paidOffDate : asOfDate;
  const interestElapsedDays = Math.max(0, daysBetween(start, parseDate(interestCutoffDate)));
  const totalPaid = sum(loanPayments.map(payment => payment.amount));
  const capitalPaid = sum(loanPayments.map(payment => payment.appliedCapital));
  const interestPaid = sum(loanPayments.map(payment => payment.appliedInterest));
  const generatedInterest = calculateGeneratedInterest(loan, interestElapsedDays, interestCutoffDate);
  const capitalPending = Math.max(0, loan.principal - capitalPaid);
  const interestPending = Math.max(0, generatedInterest - interestPaid);
  const estimated = loan.estimatedPayDate ? parseDate(loan.estimatedPayDate) : null;
  const daysLate = estimated && asOf > estimated && capitalPending + interestPending > 0 ? daysBetween(estimated, asOf) : 0;
  return {
    elapsedDays,
    generatedInterest,
    capitalPending,
    interestPending,
    totalPaid,
    capitalPaid,
    interestPaid,
    totalDebt: capitalPending + interestPending,
    lastPayment: loanPayments.length ? loanPayments[loanPayments.length - 1].date : "",
    nextDate: nextPaymentDate(loan, asOf),
    paidOffDate,
    daysLate
  };
}

function findLoanPaidOffDate(loan, payments) {
  let capitalPaid = 0;
  let interestPaid = 0;
  const start = parseDate(loan.disbursementDate);
  for (const payment of payments) {
    capitalPaid += Number(payment.appliedCapital || 0);
    interestPaid += Number(payment.appliedInterest || 0);
    const paymentDate = parseDate(payment.date);
    const elapsedDays = Math.max(0, daysBetween(start, paymentDate));
    const generatedInterest = calculateGeneratedInterest(loan, elapsedDays, payment.date);
    const capitalPending = Math.max(0, loan.principal - capitalPaid);
    const interestPending = Math.max(0, generatedInterest - interestPaid);
    if (capitalPending + interestPending <= 0) return payment.date;
  }
  return "";
}

function calculateGeneratedInterest(loan, elapsedDays, asOfDate) {
  const rate = Number(loan.interestRate || 0) / 100;
  if (!rate || loan.interestType === "Sin interes") return 0;
  if (loan.interestType === "Interes fijo") return loan.principal * rate;
  if (loan.interestType === "Interes porcentual diario") return loan.principal * rate * elapsedDays;
  if (loan.interestType === "Interes porcentual quincenal") return loan.principal * rate * Math.floor(elapsedDays / 15);
  if (loan.interestType === "Interes porcentual mensual") return loan.principal * rate * fullMonths(loan.disbursementDate, asOfDate || today());
  if (loan.interestType === "Interes personalizado") {
    if (loan.mode === "Pago diario") return loan.principal * rate * elapsedDays;
    if (loan.mode === "Pago quincenal") return loan.principal * rate * Math.floor(elapsedDays / 15);
    if (loan.mode === "Pago semanal") return loan.principal * rate * Math.floor(elapsedDays / 7);
    return loan.principal * rate * Math.max(1, fullMonths(loan.disbursementDate, asOfDate || today()));
  }
  return 0;
}

function applyPayment(amount, calc, mode) {
  let interest = 0;
  let capital = 0;
  if (mode === "capital") {
    capital = Math.min(amount, calc.capitalPending);
  } else if (mode === "interest") {
    interest = Math.min(amount, calc.interestPending);
  } else {
    interest = Math.min(amount, calc.interestPending);
    capital = Math.min(amount - interest, calc.capitalPending);
  }
  return { interest, capital };
}

function buildScheduleRows(loan) {
  if (!loan.hasSchedule || !loan.installments || !loan.firstPayDate) return [];
  const calc = calculateLoanDebt(loan, byId("asOfDate").value || today());
  const total = loan.principal + calculateGeneratedInterest(loan, daysBetween(parseDate(loan.disbursementDate), parseDate(loan.estimatedPayDate || today())), loan.estimatedPayDate || today());
  const quota = total / loan.installments;
  const rows = [];
  for (let i = 1; i <= loan.installments; i++) {
    const due = addByMode(loan.firstPayDate, loan.mode, i - 1);
    const paid = Math.min(quota, Math.max(0, calc.totalPaid - quota * (i - 1)));
    const balance = Math.max(0, quota - paid);
    const status = balance <= 0 ? "Pagado" : parseDate(due) < parseDate(byId("asOfDate").value || today()) ? "Vencido" : paid > 0 ? "Parcial" : "Pendiente";
    rows.push(`<tr><td>${loanCode(loan)}</td><td>${i}</td><td>${due}</td><td>${formatCurrency(quota, loan.currency)}</td><td>${formatCurrency(paid, loan.currency)}</td><td>${formatCurrency(balance, loan.currency)}</td><td>${status}</td></tr>`);
  }
  return rows;
}

function addByMode(dateString, mode, step) {
  const date = parseDate(dateString);
  if (mode === "Pago diario") date.setDate(date.getDate() + step);
  else if (mode === "Pago semanal") date.setDate(date.getDate() + step * 7);
  else if (mode === "Pago quincenal") date.setDate(date.getDate() + step * 15);
  else date.setMonth(date.getMonth() + step);
  return date.toISOString().slice(0, 10);
}

function isLoanPeriodic(loan) {
  return ["Pago diario", "Pago semanal", "Pago quincenal", "Pago mensual"].includes(loan.mode);
}

function monthlyDueDate(loan, calc, range) {
  if (!isLoanPeriodic(loan)) return loan.estimatedPayDate || nextPaymentDate(loan, range.cutoff) || "";
  const dueInControlMonth = periodicDueDateInRange(loan, range);
  if (dueInControlMonth) return dueInControlMonth;
  if (calc.interestPending <= 0 && calc.capitalPending > 0) {
    return nextPeriodicDueDate(loan, range.cutoff) || loan.estimatedPayDate || "";
  }
  return lastPeriodicDueDate(loan, range.cutoff) || loan.firstPayDate || loan.estimatedPayDate || "";
}

function monthlyDaysLate(loan, calc, paidThisMonth, dueDate, range) {
  if (!dueDate || calc.totalDebt <= 0) return 0;
  if (calc.interestPending <= 0 && paidThisMonth > 0) return 0;
  return parseDate(dueDate) < range.cutoff ? daysBetween(parseDate(dueDate), range.cutoff) : 0;
}

function periodicStartDate(loan) {
  if (loan.firstPayDate) return loan.firstPayDate;
  return addByMode(loan.disbursementDate, loan.mode, 1);
}

function lastPeriodicDueDate(loan, cutoff) {
  const start = periodicStartDate(loan);
  if (!start || parseDate(start) > cutoff) return "";
  let due = start;
  let guard = 0;
  while (guard < 600) {
    const next = addByMode(due, loan.mode, 1);
    if (parseDate(next) > cutoff) return due;
    due = next;
    guard += 1;
  }
  return due;
}

function periodicDueDateInRange(loan, range) {
  let due = periodicStartDate(loan);
  if (!due) return "";
  let guard = 0;
  while (parseDate(due) < range.start && guard < 600) {
    due = addByMode(due, loan.mode, 1);
    guard += 1;
  }
  return parseDate(due) <= range.end ? due : "";
}

function nextPeriodicDueDate(loan, cutoff) {
  let due = periodicStartDate(loan);
  if (!due) return "";
  let guard = 0;
  while (parseDate(due) <= cutoff && guard < 600) {
    due = addByMode(due, loan.mode, 1);
    guard += 1;
  }
  return due;
}

function nextPaymentDate(loan, asOf) {
  if (!loan.firstPayDate) return loan.estimatedPayDate || "";
  if (!loan.hasSchedule) return loan.estimatedPayDate || "";
  for (let i = 0; i < Math.max(loan.installments || 0, 1); i++) {
    const due = addByMode(loan.firstPayDate, loan.mode, i);
    if (parseDate(due) >= asOf) return due;
  }
  return "";
}

function selectDebtClient(id) {
  document.querySelector('[data-view="deuda"]').click();
  byId("debtClient").value = id;
  renderDebtView();
}

function focusPayment(id) {
  document.querySelector('[data-view="control"]').click();
  byId("paymentLoan").value = id;
  byId("paymentDate").value = byId("asOfDate").value || today();
  renderPaymentPreview();
  byId("paymentForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function quickInterestPayment(id) {
  const loan = state.loans.find(item => item.id === id);
  if (!loan) return;
  const paymentDate = today();
  const before = calculateLoanDebt(loan, paymentDate);
  const amount = Math.max(0, before.interestPending);
  if (amount <= 0) {
    alert("Este prestamo no tiene interes pendiente para pagar.");
    focusPayment(id);
    return;
  }
  const applied = applyPayment(amount, before, "interest");
  const payment = buildPaymentRecord(loan, amount, paymentDate, applied, before, {
    method: "Efectivo",
    note: "Pago rapido de interes"
  });
  state.payments.push(payment);
  selectedReceiptId = payment.id;
  syncLoanStatusByBalance(loan.id, paymentDate);
  byId("paymentLoan").value = loan.id;
  byId("paymentDate").value = paymentDate;
  byId("paymentAmount").value = "";
  saveState("Pago rapido de interes", `${loanCode(loan)} - ${formatCurrency(amount, loan.currency)}`);
  renderAll();
}

function goMonthlyControl() {
  document.querySelector('[data-view="control"]').click();
}

function openLoanFromMonthly(id) {
  editLoan(id);
}

function selectReceipt(id) {
  selectedReceiptId = id;
  renderPayments();
}

function printReceipt() {
  const payment = state.payments.find(item => item.id === selectedReceiptId);
  if (!payment) {
    alert("Seleccione un pago.");
    return;
  }
  const loan = state.loans.find(item => item.id === payment.loanId);
  const receipt = window.open("", "_blank", "width=520,height=620");
  receipt.document.write(`
    <html><head><title>Comprobante ${payment.id}</title><style>body{font-family:Arial;padding:24px}h1{font-size:22px}div{margin:8px 0}.total{font-size:20px;font-weight:700}</style></head>
    <body><h1>Comprobante de pago</h1>
    <div>ID Pago: ${payment.id}</div><div>Prestamo: ${loan ? loanCode(loan) : payment.loanId}</div><div>Cliente: ${escapeHtml(clientName(payment.clientId))}</div>
    <div>Fecha: ${payment.date}</div><div>Medio: ${escapeHtml(payment.method)}</div><div>Operacion: ${escapeHtml(payment.operationNumber || "-")}</div>
    <div class="total">Monto: ${formatCurrency(payment.amount, loan?.currency || "PEN")}</div>
    <div>Aplicado capital: ${formatCurrency(payment.appliedCapital, loan?.currency || "PEN")}</div><div>Aplicado interes: ${formatCurrency(payment.appliedInterest, loan?.currency || "PEN")}</div>
    <div>Saldo despues: ${formatCurrency(payment.capitalAfter + payment.interestAfter, loan?.currency || "PEN")}</div></body></html>`);
  receipt.document.close();
  receipt.print();
}

function voidLoan(id) {
  const reason = prompt("Motivo de anulacion del prestamo:");
  if (!reason) return;
  const loan = state.loans.find(item => item.id === id);
  loan.status = "Anulado";
  loan.voidReason = reason;
  loan.voidedAt = new Date().toISOString();
  saveState("Prestamo anulado", `${id}: ${reason}`);
  renderAll();
}

function voidPayment(id) {
  const reason = prompt("Motivo de anulacion del pago:");
  if (!reason) return;
  const payment = state.payments.find(item => item.id === id);
  payment.status = "Anulado";
  payment.voidReason = reason;
  payment.voidedAt = new Date().toISOString();
  syncLoanStatusByBalance(payment.loanId, byId("asOfDate").value || today());
  saveState("Pago anulado", `${id}: ${reason}`);
  renderAll();
}

function seedDemoData() {
  if (state.clients.length || state.loans.length) {
    if (!confirm("Esto agregara datos demo a la informacion actual.")) return;
  }
  const c1 = uid("CLI");
  const c2 = uid("CLI");
  const l1 = uid("PRE");
  const l2 = uid("PRE");
  state.clients.push(
    { id: c1, docType: "DNI", docNumber: "45678912", name: "Rosa Medina", phone: "999111222", email: "rosa@email.com", address: "Lima", status: "Activo", registeredAt: "2026-05-10", createdAt: new Date().toISOString() },
    { id: c2, docType: "DNI", docNumber: "70451236", name: "Carlos Ramos", phone: "988444555", email: "carlos@email.com", address: "Callao", status: "Activo", registeredAt: "2026-05-12", createdAt: new Date().toISOString() }
  );
  state.loans.push(
    { id: l1, code: "PR-2026-0001", clientId: c1, disbursementDate: "2026-05-15", principal: 2500, currency: "PEN", interestRate: 8, interestType: "Interes porcentual mensual", mode: "Pago mensual", hasSchedule: true, termDays: 123, estimatedPayDate: "2026-09-15", firstPayDate: "2026-06-15", installments: 4, status: "Vigente", note: "Prestamo con cronograma", createdAt: new Date().toISOString() },
    { id: l2, code: "PR-2026-0002", clientId: c2, disbursementDate: "2026-06-01", principal: 900, currency: "PEN", interestRate: 1, interestType: "Interes porcentual diario", mode: "Pago libre / flexible", hasSchedule: false, termDays: 19, estimatedPayDate: "2026-06-20", firstPayDate: "", installments: 0, status: "Vigente", note: "Prestamo flexible", createdAt: new Date().toISOString() }
  );
  state.payments.push({ id: uid("PAG"), loanId: l1, clientId: c1, date: "2026-06-16", amount: 700, appliedCapital: 500, appliedInterest: 200, method: "Yape", operationNumber: "YP1001", capitalBefore: 2500, capitalAfter: 2000, interestBefore: 200, interestAfter: 0, note: "", status: "Activo", user: "admin.local", createdAt: new Date().toISOString() });
  saveState("Datos demo cargados", "Clientes, prestamos y pago de ejemplo");
  renderAll();
}

function resetData() {
  if (!confirm("Desea limpiar todos los datos locales?")) return;
  state.clients = [];
  state.loans = [];
  state.payments = [];
  state.users = [];
  state.audit = [];
  selectedReceiptId = null;
  saveState();
  renderAll();
}

function exportReportCsv() {
  const rows = [["Cliente", "Prestamo", "Fecha", "Estado", "Modalidad", "Moneda", "Desembolsado", "Pagado", "Capital pendiente", "Interes pendiente", "Deuda actual"]];
  document.querySelectorAll("#reportsTable tr").forEach(tr => {
    rows.push(Array.from(tr.children).map(td => td.textContent.replace(/\s+/g, " ").trim()));
  });
  const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `reporte-prestamos-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function metric(label, value, note) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note || ""}</small></div>`;
}

function renderBars(containerId, data, currency = false) {
  const entries = Object.entries(data).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  byId(containerId).innerHTML = entries.map(([label, value]) => `
    <div class="bar-row">
      <div class="bar-meta"><span>${escapeHtml(label)}</span><strong>${currency ? formatCurrency(value, "PEN") : value}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (value / max) * 100)}%"></div></div>
    </div>`).join("") || `<div class="empty">Sin datos para mostrar.</div>`;
}

function renderPieSummary(containerId, data, currency = false) {
  const entries = Object.entries(data).filter(([, value]) => Number(value) > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    byId(containerId).innerHTML = `<div class="empty compact-empty">Sin datos.</div>`;
    return;
  }
  const total = sum(entries.map(([, value]) => value));
  const colors = ["#1f7a5c", "#2f6f9f", "#b35a00", "#b42318", "#7c3aed", "#475467"];
  let cursor = 0;
  const segments = entries.map(([, value], index) => {
    const start = cursor;
    const end = cursor + (Number(value) / total) * 100;
    cursor = end;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ");
  byId(containerId).innerHTML = `
    <div class="pie-visual" style="background: conic-gradient(${segments});"></div>
    <div class="pie-legend">
      ${entries.slice(0, 4).map(([label, value], index) => `
        <div class="pie-legend-row">
          <span class="pie-dot" style="background:${colors[index % colors.length]}"></span>
          <span>${escapeHtml(label)}</span>
          <strong>${currency ? formatCurrency(value, "PEN") : value}</strong>
        </div>`).join("")}
    </div>`;
}

function groupCount(items, field) {
  return items.reduce((acc, item) => {
    acc[item[field] || "Sin estado"] = (acc[item[field] || "Sin estado"] || 0) + 1;
    return acc;
  }, {});
}

function clientSummary(clientId) {
  const asOf = byId("asOfDate")?.value || today();
  const loans = state.loans.filter(loan => loan.clientId === clientId && loan.status !== "Anulado");
  return { loans: loans.length, debt: sum(loans.map(loan => calculateLoanDebt(loan, asOf).totalDebt)) };
}

function clientName(clientId) {
  return state.clients.find(client => client.id === clientId)?.name || "Cliente no encontrado";
}

function nextLoanCode(dateString) {
  const year = (dateString || today()).slice(0, 4);
  const max = state.loans
    .map(loan => loan.code || "")
    .filter(code => code.startsWith(`PR-${year}-`))
    .map(code => Number(code.split("-")[2] || 0))
    .reduce((highest, current) => Math.max(highest, current), 0);
  return `PR-${year}-${String(max + 1).padStart(4, "0")}`;
}

function loanCode(loan, index = 0) {
  if (loan.code) return loan.code;
  const year = (loan.disbursementDate || today()).slice(0, 4);
  return `PR-${year}-${String(index + 1).padStart(4, "0")}`;
}

function restoreSelectValue(id, value) {
  const select = byId(id);
  if (!value) return;
  const exists = Array.from(select.options).some(option => option.value === value);
  if (exists) select.value = value;
}

function statusClass(status, calc) {
  if (status === "Pagado") return "ok";
  if (status === "Anulado") return "danger";
  if (status === "Vencido" || calc.daysLate > 0) return "warn";
  return "ok";
}

function effectiveLoanStatus(loan, calc) {
  if (loan.status === "Anulado") return "Anulado";
  if (calc.totalDebt <= 0) return "Pagado";
  if (loan.status === "Pagado" && calc.totalDebt > 0) return "Vigente";
  if (loan.status === "Vencido" || calc.daysLate > 0) return "Vencido";
  return loan.status || "Vigente";
}

function syncLoanStatusByBalance(loanId, asOfDate) {
  const loan = state.loans.find(item => item.id === loanId);
  if (!loan || loan.status === "Anulado") return;
  const calc = calculateLoanDebt(loan, asOfDate || today());
  loan.status = calc.totalDebt <= 0 ? "Pagado" : loan.status === "Pagado" ? "Vigente" : loan.status;
  loan.updatedAt = new Date().toISOString();
}

function loanRow(loan, calc, status = "") {
  const displayStatus = status || effectiveLoanStatus(loan, calc);
  return `<tr><td>${escapeHtml(clientName(loan.clientId))}</td><td>${loan.disbursementDate}</td><td>${loan.mode}</td><td>${formatCurrency(calc.capitalPending, loan.currency)}</td><td>${formatCurrency(calc.interestPending, loan.currency)}</td><td><strong>${formatCurrency(calc.totalDebt, loan.currency)}</strong></td><td>${displayStatus}</td></tr>`;
}

function paymentsInMonth(asOf) {
  const month = asOf.slice(0, 7);
  return sum(state.payments.filter(payment => payment.status === "Activo" && payment.date.slice(0, 7) === month).map(payment => payment.amount));
}

function monthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  return {
    start,
    end,
    startString: start.toISOString().slice(0, 10),
    endString: end.toISOString().slice(0, 10)
  };
}

function monthlyControlRange(month, asOfDate) {
  const range = monthRange(month);
  const asOf = parseDate(asOfDate);
  const cutoff = asOf < range.end ? asOf : range.end;
  return {
    ...range,
    hasStarted: asOf >= range.start,
    cutoff,
    cutoffString: cutoff.toISOString().slice(0, 10)
  };
}

function isDateInRange(dateString, range) {
  const date = parseDate(dateString);
  return date >= range.start && date <= range.end;
}

function isDateInControlRange(dateString, range) {
  const date = parseDate(dateString);
  return date >= range.start && date <= range.cutoff;
}

function monthStatusClass(status) {
  if (status === "Pagado" || status === "Al dia") return "ok";
  if (status === "Pago parcial" || status === "Vence este mes") return "info";
  if (status === "En mora") return "danger";
  return "neutral";
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function formatCurrency(value, currency) {
  const symbols = { PEN: "S/", USD: "$" };
  return `${symbols[currency] || currency || "S/"} ${money.format(Number(value || 0))}`;
}

function formatDateShort(dateString) {
  if (!dateString) return "Sin fecha";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function parseDate(dateString) {
  const [year, month, day] = (dateString || today()).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.floor((end - start) / 86400000);
}

function inferTermDays(loan) {
  if (!loan.disbursementDate || !loan.estimatedPayDate) return 0;
  return Math.max(0, daysBetween(parseDate(loan.disbursementDate), parseDate(loan.estimatedPayDate)));
}

function fullMonths(startString, endString) {
  const start = parseDate(startString);
  const end = parseDate(endString);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

window.editClient = editClient;
window.editLoan = editLoan;
window.openLoanFromMonthly = openLoanFromMonthly;
window.selectDebtClient = selectDebtClient;
window.focusPayment = focusPayment;
window.quickInterestPayment = quickInterestPayment;
window.goMonthlyControl = goMonthlyControl;
window.voidLoan = voidLoan;
window.voidPayment = voidPayment;
window.editLoanFormPayment = editLoanFormPayment;
window.voidLoanFormPayment = voidLoanFormPayment;
window.selectReceipt = selectReceipt;
