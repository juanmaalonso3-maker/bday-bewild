# BE WILD 2.3.0 · Qué cambió y cómo subirlo

## Lo que pediste

| # | Pedido | Estado |
|---|---|---|
| 1 | Selector de mes moderno | Tira con los 12 meses y el conteo de cada uno |
| 2 | Contactado tachado, no que desaparezca | La fila se queda, tachada y apagada |
| 3 | El buscador no funciona | Bug encontrado y corregido |
| 4 | Diferencias con el Excel | **Pendiente: no me llegó el archivo** |
| 5 | Dashboard por mes, no por día | 5 cuadrados del mes |
| 6 | Base de datos limpia + Historial aparte | Sección nueva en el menú |

---

## 1 · Selector de mes

Los doce meses en una tira, siempre a la vista, con **cuántos cumpleaños tiene
cada uno** debajo del nombre. Un clic para ir a cualquiera. El año se cambia con
‹ 2026 ›, el mes en curso queda marcado y el que viene punteado.

Antes las flechas aparecían apiladas una arriba y otra abajo del título: eso
pasaba porque faltaban los estilos, no porque estuviera mal el diseño. Ver el
punto sobre `estilos-nuevos.css` más abajo.

## 2 · La fila ya no desaparece

Al tildar "Contactado" con el filtro *A contactar* puesto, la fila **se queda a
la vista**: tachada, en gris, con el chip en verde. Ves qué acabás de marcar y
podés destildar si te equivocaste. Se van recién cuando cambiás de mes o de
filtro. Lo mismo con el voucher.

## 3 · El buscador

Era un bug real, y venía de antes de estos cambios. El filtro comparaba lo
buscado contra el celular después de sacarle todo lo que no fuera número:
buscar `camila` dejaba una cadena vacía, y en JavaScript `"loquesea".includes("")`
es **siempre verdadero**. Resultado: cualquier búsqueda sin números devolvía la
base entera.

Ahora sólo compara contra el teléfono si escribiste al menos 3 dígitos. De paso,
el nombre se busca por palabras sueltas: `lopez marcela` encuentra a
*Marcela Lopez*.

## 5 · Dashboard

Se fueron "A contactar hoy" y "Contactadas hoy". Quedaron cinco cuadrados:

- **Cumpleaños de agosto** — total del mes, con cuántas faltan contactar
- **Contactadas** — sobre el total del mes
- **Usaron el voucher** — con el % sobre las contactadas
- **Altas de hoy** — con el total de la base
- **Cumplen en septiembre** — con cuántas hay para adelantar

El primero, el segundo y el último son clicables y llevan al mes que
corresponde.

## 6 · Base de datos e Historial

**Base de datos** quedó con seis columnas: nombre, nacimiento, próximo, celular,
email y notas. Nada más.

**Historial** es una sección nueva del menú, con buscador propio. Muestra:

- alta: fecha, quién la cargó y desde qué local
- último contacto y quién lo hizo
- **vouchers por año**: una tabla con año, mes, fecha del canje, quién lo
  registró y el local
- línea de tiempo completa de todos los eventos
- y el formulario para registrar un canje con fecha retroactiva

Desde cualquier fila de Base de datos, el botón **Historial** abre esa ficha.

---

## 4 · Lo que falta: el Excel

Dijiste que lo adjuntabas pero no llegó. Mandámelo y comparo fila por fila:
quiénes están en uno y no en el otro, fechas de nacimiento que no coinciden,
celulares distintos y duplicados. Te devuelvo la lista de diferencias.

---

## Cómo subirlo

### Novedad: los estilos ya no se pegan a mano

Los estilos nuevos van en **`estilos-nuevos.css`**, un archivo propio que
`index.html` carga después de `styles.css`. Antes eran un bloque que había que
pegar al final de tu `styles.css`, y al reponer los archivos se perdió. Ahora se
copia y se sube como cualquier otro archivo.

**A tu `styles.css` no hay que tocarle nada.**

### Pasos

1. Copiá todos los archivos del ZIP sobre la carpeta del proyecto.
2. Sumá los que no tengo y ya están en tu carpeta: `styles.css`, `plantilla.js`,
   `utils-csv.js`, `utils-telefono.js`, `view-carga.js`, `view-logs.js`,
   `view-ajustes.js`.
3. Parado en la carpeta, corré:

   ```
   python3 sellar_version.py 2.3.0
   ```

   Sella los imports de **todos** los archivos en la misma versión, incluidos
   esos siete. Sin este paso quedan mezclados 2.2.0 y 2.3.0, el navegador carga
   dos copias del mismo módulo y la app arranca rota.

4. Comprobá que no quedó nada viejo:

   ```
   grep -l "v=2.2.0" *.js index.html
   ```

   No tiene que devolver nada.

5. Subí a GitHub Pages y esperá a que el job **deploy** se ponga en verde.
6. Abrí la app con **Cmd+Shift+R**. Abajo a la izquierda tiene que decir **v2.3.0**.

### El Apps Script no se toca

`Code.gs` no cambió en esta versión. Ya lo tenés publicado y en 2.2.0: sigue
sirviendo igual.

---

## Cómo lo verifiqué

Además de revisar la sintaxis de los 17 módulos, levanté la app en un navegador
real (Chromium) con datos de prueba y comprobé 30 cosas: que la tira tenga los
12 meses y no se apile, que la fila tachada no desaparezca y el tachado sea
real, que el buscador con "camila" devuelva una sola clienta, que Base de datos
tenga seis columnas, que el historial agrupe los vouchers de 2024, 2025 y 2026,
y que el dashboard ya no muestre nada "de hoy" salvo las altas. Todo en verde,
sin errores de JavaScript.

También encontré y corregí un problema de contraste: la clienta seleccionada en
la lista del historial quedaba con texto blanco sobre fondo claro al pasarle el
mouse por encima.
