/**
 * BE WILD · Exportación a CSV
 * ----------------------------------------------------------------------------
 * Se usa punto y coma como separador y se agrega el BOM de UTF-8 porque es lo
 * que Excel en español espera: con coma, mete todo en una sola columna, y sin
 * BOM rompe los acentos y las eñes.
 */

const SEPARADOR = ';';

/**
 * Convierte filas a texto CSV.
 * @param {Array<Object>} filas
 * @param {Array<{clave: string, titulo: string}>} columnas
 */
export function aCSV(filas, columnas) {
  const encabezado = columnas.map(c => celda(c.titulo)).join(SEPARADOR);
  const cuerpo = filas.map(fila =>
    columnas.map(c => celda(fila[c.clave])).join(SEPARADOR)
  );
  return [encabezado, ...cuerpo].join('\r\n');
}

/**
 * Escapa un valor. Los números largos (celulares) llevan comilla simple
 * adelante para que Excel no los pase a notación científica.
 */
function celda(valor) {
  if (valor === null || valor === undefined) return '';

  let texto = String(valor);
  if (/^\d{11,}$/.test(texto)) texto = '="' + texto + '"';

  if (/[";\r\n]/.test(texto)) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

/**
 * Dispara la descarga del archivo en el navegador.
 * @param {string} nombreArchivo
 * @param {string} contenido
 */
export function descargar(nombreArchivo, contenido) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Se libera después de un instante: si se revoca al toque, Safari cancela.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre con fecha, del estilo "clientes-2026-07-28.csv". */
export function nombreConFecha(prefijo) {
  const hoy = new Date().toISOString().slice(0, 10);
  return `${prefijo}-${hoy}.csv`;
}
