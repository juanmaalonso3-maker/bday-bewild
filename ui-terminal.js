/**
 * BE WILD · Identidad de la terminal
 * ----------------------------------------------------------------------------
 * Mientras el login de Google esté pausado, cada computadora se identifica con
 * una terminal elegida una sola vez y guardada en el navegador. Ese valor es el
 * que se escribe en la columna Usuario de cada cliente.
 *
 * Cuando se active el login, este módulo se reemplaza por auth.js sin tocar el
 * resto de la app: la interfaz pública (obtener / nombre) se mantiene igual.
 */

import { TERMINALES, CLAVES, TERMINAL_POR_DEFECTO } from './config.js';

const esValida = id => TERMINALES.some(t => t.id === id);

/**
 * Terminal activa: la elegida a mano, o la de config si no hay ninguna.
 * @returns {string|null} null solo si tampoco hay valor por defecto.
 */
export function obtener() {
  const guardada = localStorage.getItem(CLAVES.terminal);
  if (esValida(guardada)) return guardada;
  return esValida(TERMINAL_POR_DEFECTO) ? TERMINAL_POR_DEFECTO : null;
}

/** Nombre legible de la terminal activa. */
export function nombre() {
  const activa = obtener();
  const t = TERMINALES.find(t => t.id === activa);
  return t ? t.nombre : '—';
}

/** Guarda la terminal elegida. */
export function definir(id) {
  localStorage.setItem(CLAVES.terminal, id);
  document.getElementById('terminal-actual').textContent =
    TERMINALES.find(t => t.id === id)?.nombre ?? id;
}

/**
 * Muestra el selector. Si es el primer arranque no se puede cerrar.
 * @param {{obligatorio?: boolean}} [opciones]
 * @returns {Promise<string>} id elegido
 */
export function pedirTerminal({ obligatorio = false } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-terminal');
    const lista = document.getElementById('terminal-opciones');

    lista.innerHTML = '';
    TERMINALES.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opcion-terminal';
      btn.innerHTML = `<span>${t.nombre}</span><span class="opcion-terminal__nota">${t.nota}</span>`;
      btn.addEventListener('click', () => {
        definir(t.id);
        modal.hidden = true;
        resolve(t.id);
      });
      lista.appendChild(btn);
    });

    if (!obligatorio) {
      const cerrar = e => {
        if (e.target === modal) { modal.hidden = true; document.removeEventListener('click', cerrar); }
      };
      setTimeout(() => document.addEventListener('click', cerrar), 0);
    }

    modal.hidden = false;
    lista.querySelector('button')?.focus();
  });
}
