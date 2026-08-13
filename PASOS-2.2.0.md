# BE WILD 2.2.0 · Paso a paso para dejarlo andando

Esta guía reemplaza a la anterior. Ya incluye la corrección de los timeouts que
estaban ensuciando la hoja de Logs, así que **es un solo despliegue, no dos**.

---

## Antes de empezar: usá los archivos correctos

Te pasé algunos archivos dos veces. **Valen siempre los últimos**, los de la
tanda de 6. Si tenés dudas, este es el criterio infalible:

| Archivo | Cuál va |
|---|---|
| `Code.gs` | el de la tanda de **6** (el nuevo tiene `limpiarCache_`) |
| `config.js`, `api.js`, `sync.js`, `store.js`, `app.js` | los de la tanda de **6** |
| `db.js`, `utils-fecha.js`, `view-cumpleanos.js`, `view-base.js`, `view-dashboard.js`, `ui-shell.js` | los de la tanda de **11** |
| `styles.css` | ya quedó modificado en tu carpeta |

**Cómo verificar `Code.gs` en dos segundos:** buscá `limpiarCache_` dentro del
archivo. Si aparece, es el correcto. Si no aparece, es el viejo.

Todos los archivos están sellados en la **misma versión 2.2.0**. Eso no es un
detalle cosmético: si quedan mezclados con 2.1.0, el navegador carga dos copias
del mismo módulo y la sesión se rompe de una forma difícil de diagnosticar.

---

## Parte 1 · Apps Script (va PRIMERO)

El backend tiene que estar arriba antes que el frontend. Si subís los archivos a
GitHub Pages primero, la app va a pedirle al servidor columnas que todavía no
existen y va a tirar error hasta que actualices el Apps Script.

### 1.1 — Pegar el código

1. Abrí el editor de Apps Script del proyecto.
2. Seleccioná **todo** el contenido de `Code.gs` (`Ctrl/Cmd + A`) y borralo.
3. Pegá el `Code.gs` nuevo completo.
4. **Guardá** (`Ctrl/Cmd + S`).

> No hace falta tocar nada adentro del archivo. El ID de la planilla, el
> CLIENT_ID y la lista de usuarios ya vienen con tus valores.

### 1.2 — Crear las columnas y la hoja nueva

En la barra de arriba del editor, en el desplegable de funciones, elegí
**`setupManual`** y apretá **Ejecutar**.

Qué hace:

- agrega tres columnas a la hoja **Clientes**: `UltimoVoucher` (Q),
  `ContactadoPor` (R) y `VoucherPor` (S);
- crea la hoja nueva **Historial**;
- no toca ni un dato de los que ya estaban.

**Verificá:** andá a la planilla. La hoja *Clientes* tiene que llegar hasta la
columna **S**, y abajo tiene que aparecer una pestaña nueva llamada
**Historial** con sus encabezados.

### 1.3 — Reconstruir el historial de lo que ya estaba

Ahora elegí **`sembrarHistorial`** y apretá **Ejecutar**.

Recorre las clientas ya cargadas y arma su historial con lo que quedó en la
planilla: el alta (fecha y quién la hizo) y el último contacto registrado.

Es idempotente: si la corrés dos veces no duplica nada.

**Verificá:** la hoja *Historial* tiene que quedar con filas. En el registro de
ejecución vas a ver `Eventos sembrados: N`.

> Los contactos de años anteriores no se pueden recuperar, porque hasta ahora
> nunca se guardaron. De acá en adelante sí queda todo.

### 1.4 — Publicar la versión nueva ⚠️

**Este es el paso que más se saltea, y sin él no cambia absolutamente nada.**
Guardar el archivo NO publica el código: el `/exec` sigue sirviendo el viejo.

**Implementar → Administrar implementaciones → ✏️ (lápiz) → Versión: Nueva
versión → Implementar.**

Importante: editá la implementación que ya existe con el lápiz. Si creás una
implementación nueva desde cero te cambia la URL del `/exec` y ahí sí tenés que
tocar `config.js`.

### 1.5 — Comprobar que quedó publicado

Abrí la URL del `/exec` en el navegador. Tiene que responder un JSON así:

```json
{"ok":true,"data":{"service":"BE WILD API","version":"2.2.0","hora":"..."}}
```

**Fijate en `version`.** Si dice `2.2.0`, quedó publicado. Si dice `2.0.0`,
el paso 1.4 no se completó: volvé y hacé "Nueva versión".

Esta es la mejor comprobación que tenés, porque no depende de nada del frontend.

---

## Parte 2 · Frontend (después)

Subí a GitHub Pages la carpeta completa, con los archivos de la tabla de arriba
ya reemplazados.

No hace falta que nadie borre la caché ni haga nada raro en los locales: como la
versión de los imports cambió de 2.1.0 a 2.2.0, los navegadores están obligados
a bajar todo de nuevo.

### Comprobar que funciona

1. Abrí la app. Abajo a la izquierda, en el pie del menú, tiene que decir
   **v2.2.0**.
2. Arriba a la derecha tiene que decir **Conectado**.
3. En **Cumpleaños** tiene que aparecer el selector `‹ Agosto 2026 ›` y las
   columnas *Contactado* y *Usó voucher*.
4. En **Base de datos**, el botón 👁 en cada fila. Abrilo en cualquier clienta:
   tiene que mostrar al menos el alta.
5. En **Dashboard**, el indicador *A contactar de septiembre* y el panel
   *Campaña de agosto*.

---

## Parte 3 · Que el registro deje de llenarse de errores

Esto ya viene resuelto en los archivos nuevos, no hay nada que ejecutar. Lo
dejo explicado para que sepas qué mirar.

**Qué pasaba.** Cada arranque de la app disparaba tres peticiones al mismo
tiempo. Apps Script las ejecuta todas bajo tu cuenta, así que hacían cola entre
ellas; con los dos locales abriendo cerca en el tiempo eran seis compitiendo, y
las últimas se pasaban del timeout. Nada estaba roto: se cortaban solas por
impacientes, y cada corte dejaba una fila de WARN.

**Qué cambió:** el arranque hace ahora una sola petición, las lecturas pesadas
esperan hasta 60s con un reintento silencioso, un tropiezo de red ya no se
escribe en la planilla, y el backend abre la planilla y busca la fila una sola
vez por petición en vez de una por operación.

**Cómo confirmarlo:** mirá la hoja *Logs* durante los próximos días. No tendrían
que aparecer más filas con **"El servidor tardó demasiado en responder"** en
`backend:ping`, `plantilla:cargar` ni `store:refrescar`.

Las filas viejas quedan como están; si te molestan, borrá esas filas a mano en
la planilla y listo.

---

## Si algo sale mal

| Síntoma | Qué pasó | Solución |
|---|---|---|
| El `/exec` dice `"version":"2.0.0"` | Falta publicar | Paso 1.4: Nueva versión → Implementar |
| `Falta la hoja "Historial"` | No corriste el setup | Paso 1.2 |
| La app queda en "Conectando…" y no pasa | El `/exec` no responde | Abrí el `/exec` en el navegador y mirá qué dice |
| Pantalla en blanco al abrir la app | Sellado mezclado 2.1.0 / 2.2.0 | Revisá que subiste **todos** los archivos, no algunos |
| El ojito abre vacío en todas | Falta sembrar | Paso 1.3 |
| `range out of bounds` | Faltan las columnas nuevas | Paso 1.2 (el código igual las agrega solo) |

Nada de esto pierde datos: la baja es lógica, el historial nunca se pisa y lo
que se carga sin conexión queda en el navegador hasta que se pueda enviar.

---

## Orden resumido

```
1. Pegar Code.gs (el que tiene limpiarCache_)  →  Guardar
2. Ejecutar setupManual()
3. Ejecutar sembrarHistorial()
4. Implementar → Administrar implementaciones → ✏️ → Nueva versión
5. Abrir el /exec: tiene que decir "version":"2.2.0"
6. Subir la carpeta a GitHub Pages
7. Abrir la app: tiene que decir v2.2.0 y "Conectado"
```

## Un archivo suelto

En la carpeta quedó `styles.css.bak-2.1.0`, la copia de la hoja de estilos antes
de los cambios. Si todo funciona bien, se puede borrar.
