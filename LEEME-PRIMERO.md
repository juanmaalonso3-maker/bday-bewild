# BE WILD 2.2.0 · Qué hay acá y qué te falta

## Lo que va en este ZIP (18 archivos, listos)

Todos sellados en la misma versión **2.2.0** y verificados.

**Backend**

- `Code.gs`

**Modificados para esta versión**

- `config.js` · `api.js` · `sync.js` · `store.js` · `app.js`
- `db.js` · `utils-fecha.js`
- `view-cumpleanos.js` · `view-base.js` · `view-dashboard.js`
- `ui-shell.js` · `index.html`

**Sin cambios de fondo (solo el sello de versión)**

- `auth.js` · `logger.js` · `router.js` · `ui-avisos.js`

**Herramienta**

- `sellar_version.py`

**Extra**

- `AGREGAR-A-styles.css` — no es un `styles.css` completo (ver abajo)
- `PASOS-2.2.0.md` — el paso a paso del despliegue

---

## Lo que NO está y por qué

Estos 7 archivos nunca los pude leer enteros: iCloud los tenía bloqueados
mientras trabajaba, y después se cortó el puente con tu Mac. **No los invento**,
porque escribir de memoria código que nunca vi sería cambiarte la app sin que
ninguno de los dos sepa qué cambió.

| Archivo | Qué le cambié |
|---|---|
| `styles.css` | le agregué un bloque al final |
| `plantilla.js` | **nada**, solo el sello de versión |
| `utils-csv.js` | **nada** (no tiene imports, queda igual) |
| `utils-telefono.js` | **nada** (no tiene imports, queda igual) |
| `view-carga.js` | **nada**, solo el sello de versión |
| `view-logs.js` | **nada**, solo el sello de versión |
| `view-ajustes.js` | **nada**, solo el sello de versión |

La buena noticia: en seis de los siete **no toqué una sola línea de lógica**. Lo
único que cambia es el `?v=2.1.0` → `?v=2.2.0` de sus imports, y de eso se
encarga solo el script `sellar_version.py`.

### De dónde sacar esos 7

Cualquiera de estas sirve, en este orden de comodidad:

1. **Tu repositorio de GitHub** — la app está publicada, así que los archivos
   están ahí tal cual.
2. **Time Machine** o el historial de versiones de iCloud sobre la carpeta.
3. **La papelera** de la Mac.
4. Si la carpeta en realidad nunca se vació y era el puente el que fallaba,
   están donde siempre.

---

## Cómo armar la carpeta

1. Descomprimí este ZIP en la carpeta del proyecto.
2. Sumale los 7 archivos de la lista de arriba.
3. Abrí tu `styles.css` original, andá al final y pegá **todo** el contenido de
   `AGREGAR-A-styles.css`. Después borrá ese archivo, ya no hace falta.
4. Parado en la carpeta, corré:

   ```
   python3 sellar_version.py 2.2.0
   ```

   Esto deja los imports de **todos** los archivos apuntando a la misma versión.
   Es idempotente: correrlo de más no rompe nada.

5. Verificá que no quedó nada mezclado:

   ```
   grep -l "v=2.1.0" *.js index.html
   ```

   No tiene que devolver ningún archivo. **Esto importa de verdad**: si quedan
   mezclados 2.1.0 y 2.2.0, el navegador carga dos copias del mismo módulo y la
   app arranca rota de una forma difícil de diagnosticar.

6. Seguí con `PASOS-2.2.0.md`.

---

## Sobre `index.html`

Sí cambió, pero solo el sello de versión: `styles.css?v=` y `app.js?v=` pasaron
de 2.1.0 a 2.2.0. La estructura de la página es idéntica — no hizo falta tocarla
porque las vistas nuevas se dibujan por JavaScript adentro de los contenedores
que ya existían. Va incluido igual, ya sellado.
