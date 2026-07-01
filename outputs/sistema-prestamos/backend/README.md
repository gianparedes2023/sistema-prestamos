# Backend y seguridad

Servidor local Node.js sin dependencias externas.

## Arranque

Desde esta carpeta de la aplicacion:

```powershell
npm start
```

Luego abrir:

```text
http://localhost:3000
```

Usuario inicial:

```text
admin / Admin123!
```

Para produccion, iniciar con una clave propia:

```powershell
$env:ADMIN_PASSWORD="UnaClaveFuerteAqui"; npm start
```

## Seguridad incluida

- Login con usuario y clave.
- Sesiones temporales con token Bearer.
- Claves guardadas con PBKDF2 y sal individual.
- Roles: `Administrador`, `Operador`, `Consulta`.
- Escritura de datos solo para `Administrador` y `Operador`.
- Gestion de usuarios solo para `Administrador`.
- Auditoria del backend para inicios de sesion, cierres, cambios de datos y usuarios.
- Cabeceras basicas de seguridad HTTP.
- Persistencia en `backend/data/db.json`.

## Rutas API

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/state`
- `PUT /api/state`
- `GET /api/security/users`
- `POST /api/security/users`
- `PATCH /api/security/users/:id`
- `GET /api/audit`
