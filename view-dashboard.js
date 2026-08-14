/**
 * BE WILD · Vista "Dashboard"
 * ----------------------------------------------------------------------------
 * Todo se calcula en el navegador a partir del estado ya cargado, así que no
 * hace ni una llamada al servidor.
 *
 * Los indicadores son del MES, no del día. "A contactar hoy" sonaba urgente
 * pero casi siempre valía cero, y "contactadas hoy" se reiniciaba cada mañana
 * sin decir nada del trabajo real. Lo que importa es cómo viene el mes:
 * cuántos cumpleaños hay, a cuántas les escribimos y cuántas vinieron a usar
 * el voucher. Lo único diario que se conserva son las altas, porque es la
 * medida de si el local está cargando clientas.
 */

import * as store from './store.js?v=2.3.0';
import { irAlMes } from './view-cumpleanos.js?v=2.3.0';
import { hoyISO, hoyPartes, mesActual, mesProximo, mesSiguiente,
         marcadoParaCiclo, MESES } from './utils-fecha.js?v=2.3.0';

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
  const proximo = mesSiguiente(partes.mes, partes.anio);

  const delMes = clientes.filter(c => c.cumple && c.cumple.esteMes);

  // Los del mes que viene se evalúan contra SU ciclo, no contra el de hoy: a
  // alguien que cumple en septiembre lo podemos haber contactado en agosto y
  // eso ya cuenta como hecho.
  const delProximo = clientes.filter(c => c.cumple && c.cumple.mesQueViene);
  const proximoSinContactar = delProximo
    .filter(c => !marcadoParaCiclo(c.ultimoContacto, proximo.mes, proximo.anio)).length;

  return {
    total: clientes.length,
    altasHoy: clientes.filter(c => String(c.fechaAlta || '').slice(0, 10) === hoy).length,

    totalMes: delMes.length,
    contactadasMes: delMes.filter(c => c.contactado).length,
    vouchersMes: delMes.filter(c => c.voucherUsado).length,
    pendientesMes: delMes.filter(c => !c.contactado).length,

    totalProximo: delProximo.length,
    proximoSinContactar,

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
  const mes = mesActual();
  const conversion = m.contactadasMes
    ? Math.round((m.vouchersMes / m.contactadasMes) * 100)
    : 0;

  contenedor.innerHTML = `
    <div class="indicadores">
      ${indicador(`Cumpleaños de ${mes}`, m.totalMes, '',
                  m.pendientesMes ? `${m.pendientesMes} sin contactar` : 'todas contactadas',
                  'mes-actual')}
      ${indicador('Contactadas', m.contactadasMes, 'destacado',
                  m.totalMes ? `de ${m.totalMes} del mes` : '', 'mes-actual')}
      ${indicador('Usaron el voucher', m.vouchersMes, m.vouchersMes ? 'ok' : '',
                  m.contactadasMes ? `${conversion}% de las contactadas` : 'todavía ninguna')}
      ${indicador('Altas de hoy', m.altasHoy, '', `${m.total} en total`)}
      ${indicador(`Cumplen en ${mesProximo()}`, m.totalProximo,
                  m.proximoSinContactar ? 'proximo' : '',
                  m.proximoSinContactar ? `${m.proximoSinContactar} para adelantar` : 'ya adelantadas',
                  'mes-proximo')}
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

  contenedor.querySelectorAll('[data-ir]').forEach(el => {
    el.addEventListener('click', () => abrirMes(el.dataset.ir));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirMes(el.dataset.ir); }
    });
  });
}

function abrirMes(cual) {
  const hoy = hoyPartes();
  if (cual === 'mes-proximo') {
    const p = mesSiguiente(hoy.mes, hoy.anio);
    return irAlMes(p.mes, p.anio);
  }
  return irAlMes(hoy.mes, hoy.anio);
}

function indicador(titulo, valor, tono, nota, destino) {
  return `
    <div class="indicador ${tono ? 'indicador--' + tono : ''}"
         ${destino ? `data-ir="${destino}" role="button" tabindex="0"` : ''}>
      <span class="indicador__valor">${valor}</span>
      <span class="indicador__titulo">${titulo}</span>
      ${nota ? `<span class="indicador__nota">${nota}</span>` : ''}
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
  const hoy = hoyPartes();
  const actual = hoy.mes - 1;
  const siguiente = mesSiguiente(hoy.mes, hoy.anio).mes - 1;

  return `
    <div class="barras-mes">
      ${meses.map((cantidad, i) => `
        <div class="barra-mes ${i === actual ? 'barra-mes--actual' : ''}${i === siguiente ? ' barra-mes--proximo' : ''}">
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
