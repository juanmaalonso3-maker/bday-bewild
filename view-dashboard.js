/**
 * BE WILD · Vista "Dashboard"
 * ----------------------------------------------------------------------------
 * Indicadores del día y un panorama del mes. Todo se calcula en el navegador a
 * partir del estado ya cargado, así que no hace ni una llamada al servidor.
 */

import * as store from './store.js';
import * as router from './router.js';
import { hoyISO, hoyPartes, mesActual, MESES } from './utils-fecha.js';

let desuscribir = null;

export default {
  titulo: 'Dashboard',

  render(contenedor) {
    contenedor.innerHTML = '<div id="tablero"></div>';
    desuscribir = store.suscribir(pintar);
  },

  destruir() {
    if (desuscribir) desuscribir();
    desuscribir = null;
  }
};

/* ── Cálculos ───────────────────────────────────────────────────────────── */

function metricas() {
  const clientes = store.listar();
  const hoy = hoyISO();
  const partes = hoyPartes();

  const delMes = clientes.filter(c => c.cumple && c.cumple.esteMes);

  return {
    total: clientes.length,
    altasHoy: clientes.filter(c => String(c.fechaAlta || '').slice(0, 10) === hoy).length,
    aContactarHoy: delMes.filter(c => c.cumple.dia === partes.dia && !c.contactado).length,
    contactadasHoy: clientes.filter(c => c.ultimoContacto === hoy).length,
    pendientesMes: delMes.filter(c => !c.contactado).length,
    totalMes: delMes.length,
    altasPorDia: altasUltimos30(clientes),
    porMes: cumplesPorMes(clientes)
  };
}

/** Altas de los últimos 30 días, en orden cronológico. */
function altasUltimos30(clientes) {
  const conteo = new Map();
  const hoy = new Date(hoyISO() + 'T12:00:00');

  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    conteo.set(d.toISOString().slice(0, 10), 0);
  }

  clientes.forEach(c => {
    const dia = String(c.fechaAlta || '').slice(0, 10);
    if (conteo.has(dia)) conteo.set(dia, conteo.get(dia) + 1);
  });

  return [...conteo.entries()].map(([fecha, cantidad]) => ({ fecha, cantidad }));
}

/** Cuántos cumpleaños hay en cada mes del año. */
function cumplesPorMes(clientes) {
  const meses = Array(12).fill(0);
  clientes.forEach(c => {
    if (c.nacimiento && c.nacimiento.valida) meses[c.nacimiento.mes - 1]++;
  });
  return meses;
}

/* ── Pintado ────────────────────────────────────────────────────────────── */

function pintar() {
  const contenedor = document.getElementById('tablero');
  if (!contenedor) return;

  const m = metricas();

  contenedor.innerHTML = `
    <div class="indicadores">
      ${indicador('Clientes agregados hoy', m.altasHoy, '')}
      ${indicador('A contactar hoy', m.aContactarHoy, m.aContactarHoy ? 'destacado' : '')}
      ${indicador('Contactadas hoy', m.contactadasHoy, '')}
      ${indicador('Pendientes de ' + mesActual(), m.pendientesMes, m.pendientesMes ? 'alerta' : '')}
    </div>

    <div class="paneles">
      <section class="tarjeta">
        <h2 class="seccion-titulo">
          Altas de los últimos 30 días
          <span class="seccion-titulo__cuenta">${m.total} en total</span>
        </h2>
        ${grafico(m.altasPorDia)}
      </section>

      <section class="tarjeta">
        <h2 class="seccion-titulo">Cumpleaños por mes</h2>
        ${graficoMeses(m.porMes)}
      </section>
    </div>`;

  const tarjeta = contenedor.querySelector('[data-ir="cumpleanos"]');
  if (tarjeta) tarjeta.addEventListener('click', () => router.ir('cumpleanos'));
}

function indicador(titulo, valor, tono) {
  const clicable = titulo.startsWith('A contactar') || titulo.startsWith('Pendientes');
  return `
    <div class="indicador ${tono ? 'indicador--' + tono : ''}"
         ${clicable ? 'data-ir="cumpleanos" role="button" tabindex="0"' : ''}>
      <span class="indicador__valor">${valor}</span>
      <span class="indicador__titulo">${titulo}</span>
    </div>`;
}

/** Gráfico de barras en SVG, sin librerías. */
function grafico(datos) {
  const maximo = Math.max(1, ...datos.map(d => d.cantidad));
  const ancho = 100 / datos.length;

  const barras = datos.map((d, i) => {
    const alto = (d.cantidad / maximo) * 100;
    return `<rect x="${i * ancho + ancho * 0.15}%" y="${100 - alto}%"
                  width="${ancho * 0.7}%" height="${alto}%"
                  class="barra" data-cantidad="${d.cantidad}">
              <title>${d.fecha}: ${d.cantidad}</title>
            </rect>`;
  }).join('');

  const primera = datos[0] ? etiquetaFecha(datos[0].fecha) : '';
  const ultima = datos.length ? etiquetaFecha(datos[datos.length - 1].fecha) : '';

  return `
    <div class="grafico">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="grafico__svg">${barras}</svg>
      <div class="grafico__eje">
        <span>${primera}</span>
        <span class="grafico__max">máx. ${maximo} por día</span>
        <span>${ultima}</span>
      </div>
    </div>`;
}

function graficoMeses(meses) {
  const maximo = Math.max(1, ...meses);
  const actual = hoyPartes().mes - 1;

  return `
    <div class="barras-mes">
      ${meses.map((cantidad, i) => `
        <div class="barra-mes ${i === actual ? 'barra-mes--actual' : ''}">
          <div class="barra-mes__valor">${cantidad || ''}</div>
          <div class="barra-mes__caja">
            <div class="barra-mes__relleno" style="height:${(cantidad / maximo) * 100}%"></div>
          </div>
          <div class="barra-mes__nombre">${MESES[i].slice(0, 3)}</div>
        </div>`).join('')}
    </div>`;
}

function etiquetaFecha(iso) {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)}/${Number(mes)}`;
}
