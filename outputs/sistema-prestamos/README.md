# Sistema de Prestamos

Frontend inicial con la misma linea arquitectonica del sistema de alquileres:

- Frontend web: `index.html`, `styles.css`, `app.js`.
- Persistencia principal recomendada en Supabase: `supabase-schema.sql` y `supabase-config.js`.
- Backend local Node.js: `backend/server.js`, solo como respaldo de prueba.
- Persistencia local en `backend/data/db.json` cuando se usa el servidor Node sin Supabase.
- Modo local con `localStorage` solo para pruebas rapidas abriendo el archivo directo.

## Modulos incluidos

- Dashboard con indicadores de desembolso, cobros, capital pendiente, interes pendiente y deuda actual.
- Control mensual para ver prestamos del mes, pagos recibidos, pagados, vencimientos y mora.
- Clientes con registro, edicion, busqueda y deuda total.
- Prestamos con interes fijo, diario, quincenal, mensual, personalizado o sin interes.
- Modalidad con o sin cronograma.
- Pagos parciales, totales o adelantados, aplicados primero a interes y luego capital por defecto.
- Consulta de deuda por cliente a la fecha seleccionada.
- Reportes filtrables y exportacion CSV compatible con Excel.
- Impresion PDF mediante la opcion de imprimir del navegador.
- Usuarios, roles, sesiones y auditoria cuando se abre desde el backend.

## Como usar con Supabase, igual al control de alquileres

1. Crear un proyecto en Supabase.
2. Abrir `SQL Editor` y ejecutar:

```text
C:\Users\gparedes\Documents\Codex\2026-06-30\sist\outputs\sistema-prestamos\supabase-schema.sql
```

3. En Supabase, ir a `Authentication > Users` y crear el primer usuario.
4. En `SQL Editor`, convertir ese usuario en administrador:

```sql
update public.profiles
set role = 'admin'
where email = 'tu-correo@dominio.com';
```

5. Editar:

```text
C:\Users\gparedes\Documents\Codex\2026-06-30\sist\outputs\sistema-prestamos\supabase-config.js
```

Colocar la `Project URL` y la `anon public key` de Supabase:

```js
window.APP_SUPABASE = {
  url: "https://TU-PROYECTO.supabase.co",
  anonKey: "TU-ANON-KEY",
};
```

6. Abrir la app desde:

```text
http://localhost:3000
```

## Como abrir con backend local de respaldo

Desde PowerShell:

```powershell
cd C:\Users\gparedes\Documents\Codex\2026-06-30\sist\outputs\sistema-prestamos
npm start
```

Abrir en el navegador:

`http://localhost:3000`

Usuario inicial del backend local:

`admin / Admin123!`

Para definir una clave inicial distinta en backend local:

```powershell
$env:ADMIN_PASSWORD="UnaClaveFuerteAqui"; npm start
```

## Modo local de prueba

Tambien puede abrirse directo, pero sin seguridad real de servidor:

`C:\Users\gparedes\Documents\Codex\2026-06-30\sist\outputs\sistema-prestamos\index.html`

El boton `Datos demo` carga clientes, prestamos y pagos de ejemplo para probar el calculo de deuda.

La pantalla `Control mensual` permite seleccionar un mes y filtrar por:

- Pagados
- En mora
- Sin pago
- Pago parcial
- Vencen este mes

## Seguridad implementada

1. Supabase Auth para login.
2. Tabla `profiles` con roles `admin`, `operator`, `viewer`.
3. RLS en `profiles`, `loan_app_state` y `audit_log`.
4. La clave `anonKey` puede estar en frontend; la proteccion real es RLS.
5. El estado de prestamos se guarda en PostgreSQL/Supabase como JSONB en `loan_app_state`.
6. Backend local queda solo como alternativa de prueba.

## Siguiente fase recomendada

1. Si deseas reportes SQL avanzados, separar `loan_app_state` en tablas normalizadas `clients`, `loans`, `payments`.
2. Agregar backup automatico de Supabase.
3. Agregar pantalla de cambio de clave para usuarios finales.
