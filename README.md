# BE WILD · Gestor de Clientes y Cumpleaños

Aplicación web para registrar clientes del local y gestionar los saludos de
cumpleaños por WhatsApp.

- **Frontend:** HTML + CSS + JavaScript (módulos ES), sin frameworks.
- **Backend:** Google Apps Script Web App.
- **Base de datos:** Google Sheets.

> Versión sin carpetas: todos los archivos van en la raíz del repositorio.
> El prefijo del nombre indica el grupo al que pertenece cada módulo.

## Publicar en GitHub Pages

1. Subir todos los archivos a la raíz del repositorio.
2. Settings → Pages → Source: `Deploy from a branch` → rama `main`, carpeta `/(root)`.
3. Esperar un minuto y abrir la URL que muestra GitHub.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Sistema de diseño |
| `config.js` | URL del backend, terminales, tiempos. **Es el único que se toca para configurar.** |
| `api.js` | Única capa que habla con Apps Script |
| `router.js` | Navegación por hash |
| `db.js` | Base local (IndexedDB): clientes, cola, logs |
| `sync.js` | Motor de sincronización con reintentos |
| `store.js` | Estado central. Las vistas solo hablan con este archivo. |
| `logger.js` | Registro de eventos local y remoto |
| `utils-fecha.js` | Fechas, próximo cumpleaños, zona horaria |
| `utils-telefono.js` | Normalización de celulares y links de WhatsApp |
| `app.js` | Arranque y orquestación |
| `ui-shell.js` | Menú lateral, título, indicador de conexión |
| `ui-terminal.js` | Identidad de la terminal (provisorio hasta el login) |
| `ui-avisos.js` | Avisos flotantes |
| `view-carga.js` | Carga de clientes |
| `view-cumpleanos.js` | Cumpleaños del mes |
| `view-base.js` | Base de datos |
| `view-dashboard.js` | Dashboard |
| `view-logs.js` | Registro de errores |
| `view-ajustes.js` | Plantilla de WhatsApp y terminal |
| `plantilla.js` | Mensaje de cumpleaños (hoja Config) |
| `utils-csv.js` | Exportación a CSV compatible con Excel |

## Etapas

- [x] 1 · Backend (Code.gs)
- [x] 2 · Shell, navegación y conexión
- [x] 3 · Núcleo: cache local, cola de sincronización y logs
- [x] 4 · Carga de clientes
- [x] 5 · Cumpleaños del mes + WhatsApp
- [x] 6 · Base de datos
- [x] 7 · Dashboard y registro
