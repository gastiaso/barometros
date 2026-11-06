# Cómo contribuir

El proyecto lo mantiene una persona y se actualiza cada mes con el barómetro nuevo. Las aportaciones más útiles, por este orden:

1. **Errores en los datos o en el método.** Abre una incidencia con el panel o la cifra, el mes y, si puedes, la tabla del CIS con la que no cuadra. Las cifras de referencia viven en `inventario/referencias_cis.csv`; añadir una fila con una cifra publicada por el CIS que la web no reproduce es la forma más directa de señalar un error, porque la validación la comprobará en cada publicación.
2. **Decisiones de armonización.** Las reglas no están en el código sino en los CSV de `inventario/` (`crosswalk_revisado.csv`, `decisiones_manuales.csv`, `rupturas_candidatas.csv`, `mapa_*.csv`). Una propuesta de cambio debe decir qué estudio y qué pregunta afecta, por qué, y cómo se comprueba. Si cambia el nivel de comparabilidad (A/B/C) de alguna serie, hay que anotarlo en `CHANGELOG.md`.
3. **Web.** `web/js/app.js` (cálculo, series, barras, editor), `web/js/vistas.js` (transferencias, dispersión, mapa, mapa de calor, comparar, nube de puntos) y `web/js/guia.js` (página de entrada). Sin dependencias externas: d3 va autoalojado y no se añaden librerías ni analítica.

## Flujo

- Rama por cambio y pull request contra `main`. La pull request construye el pipeline completo (R + Python) y pasa la prueba en Chromium sin publicar; `main` publica en GitHub Pages.
- La web no se publica si la validación contra el CIS falla. Si un cambio hace que una cifra deje de cuadrar, el cambio es el problema, no la referencia.
- Dependencias de Python en `requirements.txt`; paquetes de R en `docs/documentacion_tecnica.md`. `npm run lint` comprueba `web/js` (eslint: variables no definidas o sin usar, igualdad estricta); la PR lo ejecuta antes de construir.
- Textos en castellano, registro impersonal y sin valoraciones políticas. El proyecto no tiene relación con el CIS ni opina sobre sus métodos: describe lo que hay en los microdatos.
- Mensajes de commit en castellano, en una línea que diga qué cambia para quien usa los datos o la web.

## Lo que no se acepta

- Datos de otras fuentes mezclados con los del CIS sin una columna que los distinga.
- Estimaciones de voto presentadas como si fueran del CIS, o sin el aviso «estimación propia».
- Cambios en los ZIP originales de `datos/raw/`: son los ficheros del CIS tal como se descargan.
