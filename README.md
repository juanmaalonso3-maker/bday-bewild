# BE WILD · Gestor de Clientes y Cumpleaños

Aplicación web para registrar clientes del local y gestionar los saludos de
cumpleaños por WhatsApp.

- **Frontend:** HTML + CSS + JavaScript (módulos ES), sin frameworks.
- **Backend:** Google Apps Script Web App.
- **Base de datos:** Google Sheets.
- **Ingreso:** Google Identity Services, con verificación del token en el servidor.

> Versión sin carpetas: todos los archivos van en la raíz del repositorio.
> El prefijo del nombre indica el grupo al que pertenece cada módulo.

## Puesta en marcha

1. Subir todos los archivos a la raíz del repositorio.
2. Settings → Pages → Source: `Deploy from a branch` → rama `main`, carpeta `/(root)`.
3. En Google Cloud, agregar el origen de GitHub Pages a los orígenes autorizados
   del ID de cliente OAuth (ver `config.js`).
4. Pegar `Code.gs` en Apps Script, ejecutar `setupManual()` y redesplegar con
   **Nueva versión**.

## Usuarios y permisos

| Cuenta | Rol | Local | Acceso |
|---|---|---|---|
| bewild.ventas@gmail.com | Administrador | — | Todo |
| info@bewild.com.ar | Administrador | — | Todo |
| bw.este@bewild.com.ar | Operador | Lanús Este | Carga y cumpleaños |
| bw.oeste@bewild.com.ar | Operador | Lanús Oeste | Carga y cumpleaños |

Para dar de alta a alguien hay que agregarlo en **dos lugares**: `config.js`
(para el menú del navegador) y `Code.gs` (para el permiso real).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la página y pantalla de ingreso |
| `styles.css` | Sistema de diseño |
| `config.js` | Backend, ID de cliente OAuth, usuarios y roles |
| `auth.js` | Ingreso con Google, sesión y permisos |
| `api.js` | Única capa que habla con Apps Script |
| `router.js` | Navegación por hash |
| `app.js` | Arranque y orquestación |
| `db.js` | Base local (IndexedDB): clientes, cola, logs |
| `sync.js` | Motor de sincronización con reintentos |
| `store.js` | Estado central. Las vistas solo hablan con este archivo. |
| `logger.js` | Registro de eventos local y remoto |
| `plantilla.js` | Mensaje de cumpleaños (hoja Config) |
| `ui-shell.js` | Menú, encabezado, indicador de conexión |
| `ui-avisos.js` | Avisos flotantes |
| `utils-fecha.js` | Fechas, próximo cumpleaños, zona horaria |
| `utils-telefono.js` | Normalización de celulares y links de WhatsApp |
| `utils-csv.js` | Exportación a CSV compatible con Excel |
| `view-carga.js` | Carga de clientes |
| `view-cumpleanos.js` | Cumpleaños del mes |
| `view-base.js` | Base de datos |
| `view-dashboard.js` | Dashboard |
| `view-logs.js` | Registro de errores |
| `view-ajustes.js` | Plantilla de WhatsApp y datos de sesión |

## Estado

- [x] 1 · Backend
- [x] 2 · Shell, navegación y conexión
- [x] 3 · Cache local, cola de sincronización y logs
- [x] 4 · Carga de clientes
- [x] 5 · Cumpleaños del mes + WhatsApp
- [x] 6 · Base de datos
- [x] 7 · Dashboard y registro
- [x] 8 · Ingreso con Google, roles, email y local de origen
