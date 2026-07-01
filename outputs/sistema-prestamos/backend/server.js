const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);

const ROLES = {
  admin: "Administrador",
  operator: "Operador",
  viewer: "Consulta"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const loginAttempts = new Map();

ensureDatabase();

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }
    await serveStatic(req, res, requestUrl);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Error interno del servidor." });
  }
});

server.listen(PORT, () => {
  console.log(`Sistema de Prestamos disponible en http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log("Usuario inicial: admin / Admin123! Cambie ADMIN_PASSWORD para produccion.");
  }
});

async function handleApi(req, res, requestUrl) {
  const route = requestUrl.pathname;

  if (req.method === "POST" && route === "/api/auth/login") {
    const body = await readJsonBody(req);
    return login(req, res, body);
  }

  if (req.method === "POST" && route === "/api/auth/logout") {
    const session = requireSession(req, res);
    if (!session) return;
    const db = readDb();
    db.security.sessions = db.security.sessions.filter(item => item.tokenHash !== session.tokenHash);
    addAudit(db, session.user, "Sesion cerrada", session.user.username);
    writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && route === "/api/auth/me") {
    const session = requireSession(req, res);
    if (!session) return;
    return sendJson(res, 200, publicUser(session.user));
  }

  if (req.method === "GET" && route === "/api/state") {
    const session = requireSession(req, res);
    if (!session) return;
    const db = readDb();
    return sendJson(res, 200, normalizeState(db.state));
  }

  if (req.method === "PUT" && route === "/api/state") {
    const session = requireSession(req, res, [ROLES.admin, ROLES.operator]);
    if (!session) return;
    const body = await readJsonBody(req, 3_000_000);
    const db = readDb();
    db.state = normalizeState(body);
    addAudit(db, session.user, "Datos guardados", "Sincronizacion desde la aplicacion web.");
    writeDb(db);
    return sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
  }

  if (req.method === "GET" && route === "/api/security/users") {
    const session = requireSession(req, res, [ROLES.admin]);
    if (!session) return;
    const db = readDb();
    return sendJson(res, 200, db.security.users.map(publicUser));
  }

  if (req.method === "POST" && route === "/api/security/users") {
    const session = requireSession(req, res, [ROLES.admin]);
    if (!session) return;
    const body = await readJsonBody(req);
    const db = readDb();
    if (db.security.users.some(user => user.username.toLowerCase() === String(body.username || "").toLowerCase())) {
      return sendJson(res, 409, { error: "El usuario ya existe." });
    }
    const user = createUser(body);
    db.security.users.push(user);
    addAudit(db, session.user, "Usuario creado", user.username);
    writeDb(db);
    return sendJson(res, 201, publicUser(user));
  }

  if (req.method === "PATCH" && route.startsWith("/api/security/users/")) {
    const session = requireSession(req, res, [ROLES.admin]);
    if (!session) return;
    const userId = decodeURIComponent(route.split("/").pop());
    const body = await readJsonBody(req);
    const db = readDb();
    const user = db.security.users.find(item => item.id === userId);
    if (!user) return sendJson(res, 404, { error: "Usuario no encontrado." });
    if (body.name) user.name = String(body.name).trim();
    if (body.role && Object.values(ROLES).includes(body.role)) user.role = body.role;
    if (body.status && ["Activo", "Inactivo"].includes(body.status)) user.status = body.status;
    if (body.password) setPassword(user, body.password);
    user.updatedAt = new Date().toISOString();
    addAudit(db, session.user, "Usuario actualizado", user.username);
    writeDb(db);
    return sendJson(res, 200, publicUser(user));
  }

  if (req.method === "GET" && route === "/api/audit") {
    const session = requireSession(req, res, [ROLES.admin, ROLES.operator]);
    if (!session) return;
    const db = readDb();
    return sendJson(res, 200, db.audit.slice(0, 200));
  }

  sendJson(res, 404, { error: "Ruta no encontrada." });
}

function login(req, res, body) {
  const ip = req.socket.remoteAddress || "local";
  const attempt = loginAttempts.get(ip) || { count: 0, firstAt: Date.now() };
  if (Date.now() - attempt.firstAt > 10 * 60 * 1000) {
    attempt.count = 0;
    attempt.firstAt = Date.now();
  }
  if (attempt.count >= 8) return sendJson(res, 429, { error: "Demasiados intentos. Espere unos minutos." });

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const db = readDb();
  const user = db.security.users.find(item => item.username.toLowerCase() === username.toLowerCase());
  if (!user || user.status !== "Activo" || !verifyPassword(user, password)) {
    attempt.count += 1;
    loginAttempts.set(ip, attempt);
    return sendJson(res, 401, { error: "Usuario o clave incorrectos." });
  }

  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString("base64url");
  const session = {
    id: crypto.randomUUID(),
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
  };
  db.security.sessions = db.security.sessions.filter(item => new Date(item.expiresAt) > new Date());
  db.security.sessions.push(session);
  addAudit(db, user, "Sesion iniciada", user.username);
  writeDb(db);
  sendJson(res, 200, { token, user: publicUser(user), expiresAt: session.expiresAt });
}

function requireSession(req, res, roles) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    sendJson(res, 401, { error: "Debe iniciar sesion." });
    return null;
  }
  const db = readDb();
  const tokenHash = hashToken(match[1]);
  const session = db.security.sessions.find(item => item.tokenHash === tokenHash);
  if (!session || new Date(session.expiresAt) <= new Date()) {
    db.security.sessions = db.security.sessions.filter(item => item.tokenHash !== tokenHash);
    writeDb(db);
    sendJson(res, 401, { error: "Sesion vencida." });
    return null;
  }
  const user = db.security.users.find(item => item.id === session.userId && item.status === "Activo");
  if (!user) {
    sendJson(res, 401, { error: "Usuario inactivo." });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    sendJson(res, 403, { error: "No tiene permiso para esta accion." });
    return null;
  }
  return { ...session, tokenHash, user };
}

function ensureDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;
  const admin = createUser({
    username: "admin",
    name: "Administrador",
    role: ROLES.admin,
    status: "Activo",
    password: process.env.ADMIN_PASSWORD || "Admin123!"
  });
  writeDb({
    state: normalizeState({}),
    security: { users: [admin], sessions: [] },
    audit: [{
      id: crypto.randomUUID(),
      action: "Sistema inicializado",
      detail: "Se creo el usuario administrador inicial.",
      user: "sistema",
      createdAt: new Date().toISOString()
    }]
  });
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tempFile, DB_FILE);
}

function normalizeState(input) {
  return {
    clients: Array.isArray(input.clients) ? input.clients : [],
    loans: Array.isArray(input.loans) ? input.loans : [],
    payments: Array.isArray(input.payments) ? input.payments : [],
    users: Array.isArray(input.users) ? input.users : [],
    audit: Array.isArray(input.audit) ? input.audit.slice(0, 500) : []
  };
}

function createUser(input) {
  const user = {
    id: input.id || crypto.randomUUID(),
    username: String(input.username || "").trim(),
    name: String(input.name || input.username || "").trim(),
    role: Object.values(ROLES).includes(input.role) ? input.role : ROLES.viewer,
    status: ["Activo", "Inactivo"].includes(input.status) ? input.status : "Activo",
    createdAt: new Date().toISOString()
  };
  setPassword(user, input.password || crypto.randomBytes(9).toString("base64url"));
  return user;
}

function setPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString("base64url");
  user.iterations = 120000;
  user.passwordHash = crypto.pbkdf2Sync(String(password), user.salt, user.iterations, 32, "sha256").toString("base64url");
}

function verifyPassword(user, password) {
  const candidate = crypto.pbkdf2Sync(String(password), user.salt, user.iterations, 32, "sha256").toString("base64url");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(user.passwordHash));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null
  };
}

function addAudit(db, user, action, detail) {
  db.audit.unshift({
    id: crypto.randomUUID(),
    action,
    detail,
    user: user.username || user.name || "sistema",
    createdAt: new Date().toISOString()
  });
  db.audit = db.audit.slice(0, 1000);
}

async function readJsonBody(req, limit = 250000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Payload demasiado grande.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}

async function serveStatic(req, res, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Metodo no permitido." });
    return;
  }
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT_DIR, relativePath);
  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: "Ruta no permitida." });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { error: "Archivo no encontrado." });
    return;
  }
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
