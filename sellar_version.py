#!/usr/bin/env python3
"""
Sella la versión en todas las referencias entre archivos.

El problema que resuelve: el navegador cachea los .js por unos minutos. Al subir
una versión nueva, puede quedarse con algunos archivos viejos y otros nuevos, y
esa mezcla rompe la aplicación con una pantalla en blanco.

Agregando ?v=VERSION a cada import, la URL cambia en cada release y el navegador
está obligado a bajar todo de nuevo. El servidor ignora el parámetro, así que no
hay que renombrar ningún archivo.

Uso:  python3 sellar_version.py 2.2.0

Es idempotente: correrlo dos veces con la misma versión no cambia nada. Después
de mezclar archivos de distintas tandas, corrigelo con esto y quedan todos
sellados igual.
"""

import pathlib
import re
import sys

CARPETA = pathlib.Path(__file__).parent


def leer_version_actual():
    texto = (CARPETA / 'config.js').read_text(encoding='utf-8')
    encontrado = re.search(r"export const VERSION = '([^']+)'", texto)
    return encontrado.group(1) if encontrado else '0.0.0'


def sellar(version):
    # --- Módulos JS: imports relativos ---
    for archivo in CARPETA.glob('*.js'):
        if archivo.name == 'sellar_version.py':
            continue
        texto = archivo.read_text(encoding='utf-8')

        # Saca cualquier ?v= anterior y pone el nuevo.
        nuevo = re.sub(
            r"(from\s+'\./[a-z0-9.\-]+\.js)(\?v=[^']*)?'",
            lambda m: f"{m.group(1)}?v={version}'",
            texto
        )

        if nuevo != texto:
            archivo.write_text(nuevo, encoding='utf-8')

    # --- config.js: la constante VERSION ---
    config = CARPETA / 'config.js'
    texto = config.read_text(encoding='utf-8')
    texto = re.sub(r"export const VERSION = '[^']+'",
                   f"export const VERSION = '{version}'", texto)
    config.write_text(texto, encoding='utf-8')

    # --- index.html: hoja de estilos y módulo de entrada ---
    html = CARPETA / 'index.html'
    texto = html.read_text(encoding='utf-8')
    texto = re.sub(r'href="styles\.css(\?v=[^"]*)?"',
                   f'href="styles.css?v={version}"', texto)
    texto = re.sub(r'href="estilos-nuevos\.css(\?v=[^"]*)?"',
                   f'href="estilos-nuevos.css?v={version}"', texto)
    texto = re.sub(r'src="app\.js(\?v=[^"]*)?"',
                   f'src="app.js?v={version}"', texto)
    html.write_text(texto, encoding='utf-8')

    print(f'Versión sellada: {version}')


if __name__ == '__main__':
    nueva = sys.argv[1] if len(sys.argv) > 1 else leer_version_actual()
    sellar(nueva)
