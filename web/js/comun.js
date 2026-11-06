/* Barómetro a barómetro: utilidades comunes y catálogo de preguntas, paneles por defecto y enlaces con nombre.
   Los ficheros de web/js son scripts clásicos que comparten el ámbito global; se cargan en el orden de index.html
   (comun, datos, grafico, paneles, vistas, guia, estimacion, editor, app) y solo se llaman entre sí tras la carga. */
'use strict';

const BASE = 'datos/';
const NR = new Set(['NS', 'NC', 'NR', 'NP']);
const MIN_N = 50;
const MAX_SERIES = 12;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = v => v == null || !isFinite(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = v => v == null || !isFinite(v) ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = v => v.toLocaleString('es-ES');
const mesLargo = m => { const [a, b] = m.split('-'); return `${MESES[+b - 1]} ${a}`; };
const mesCorto = m => { const [a, b] = m.split('-'); return `${MESES_C[+b - 1]} ${a}`; };
/* Medida de texto con la fuente del cuerpo, la de los rótulos de los SVG, en un canvas: sustituye a las constantes de
   «píxeles por carácter», que dependían de la fuente de cada sistema. La familia se lee una vez de la hoja de estilos. */
const MEDIDOR = document.createElement('canvas').getContext('2d');
let FUENTE_TEXTO = '';
function anchoTexto(txt, px = 12) {
  if (!FUENTE_TEXTO) FUENTE_TEXTO = (document.body && getComputedStyle(document.body).fontFamily) || 'sans-serif';
  MEDIDOR.font = `${px}px ${FUENTE_TEXTO}`;
  return MEDIDOR.measureText(String(txt)).width;
}
/* Recorta un texto, con puntos suspensivos, para que quepa en maxPx píxeles */
function recortarAncho(txt, maxPx, px = 12) {
  txt = String(txt);
  if (anchoTexto(txt, px) <= maxPx) return txt;
  let lo = 1, hi = txt.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (anchoTexto(txt.slice(0, mid) + '…', px) <= maxPx) lo = mid; else hi = mid - 1; }
  return txt.slice(0, lo).replace(/[\s,;:]+$/, '') + '…';
}
/* Parte un texto en hasta n líneas que quepan en maxPx (por palabras); la última se recorta con puntos suspensivos */
function lineasTexto(txt, maxPx, px = 12, n = 2) {
  const palabras = String(txt).split(/\s+/), lineas = [];
  let actual = '';
  for (const w of palabras) {
    const prueba = actual ? `${actual} ${w}` : w;
    if (!actual || anchoTexto(prueba, px) <= maxPx) { actual = prueba; continue; }
    lineas.push(actual); actual = w;
    if (lineas.length === n - 1) break;
  }
  const resto = palabras.slice(lineas.join(' ').split(/\s+/).filter(Boolean).length).join(' ');
  if (lineas.length < n) lineas.push(recortarAncho(resto || actual, maxPx, px));
  return lineas;
}
const fecha = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
/* Modo daltónico: paleta categórica segura (Okabe-Ito y afines, en estilos.css) y un trazo distinto por serie en las líneas.
   Los colores de partido se mantienen (son convención), por eso el trazo. El conmutador está en app.js. */
const TRAZOS_CVD = [null, '7 3', '2 2.5', '9 3 2 3', '1 3', '12 4', '4 2 1 2', '14 3 2 3'];
const modoCVD = () => document.documentElement.dataset.cvd === '1';
/* Un panel sin su identificador de sesión (lo que se guarda y se comparte) y la codificación de los enlaces #p= */
const limpio = p => { const { id, ...r } = p; return r; };
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/* ================= catálogo ================= */
const PREG = [
  { g: 'Voto', id: 'intencion_voto_r', t: 'Intención directa de voto' },
  { g: 'Voto', id: 'voto_simpatia', t: 'Voto + simpatía' },
  { g: 'Voto', id: 'simpatia', t: 'Partido por el que siente más simpatía' },
  { g: 'Voto', id: 'cercania', t: 'Partido más cercano a sus ideas' },
  { g: 'Voto', id: 'intencion_alternativa', t: 'Intención de voto alternativa' },
  { g: 'Voto', id: 'intencion_voto', t: 'Intención directa: respuesta literal, sin agrupar' },
  { g: 'Voto', id: 'recuerdo_voto', t: 'Recuerdo de voto en las últimas generales' },
  { g: 'Voto', id: 'pref_presidente', t: 'Preferencia como presidente del Gobierno' },
  { g: 'Líderes', id: 'lideres', t: 'Valoración de líderes', tipo: 'medias' },
  { g: 'Líderes', id: 'ministros', t: 'Valoración de ministros', tipo: 'medias' },
  { g: 'Problemas', id: 'prob_esp', t: 'Principales problemas de España', tipo: 'multi', cols: ['prob_esp_1', 'prob_esp_2', 'prob_esp_3'] },
  { g: 'Problemas', id: 'prob_esp_1', t: 'Primer problema de España' },
  { g: 'Problemas', id: 'prob_per', t: 'Problemas que más le afectan personalmente', tipo: 'multi', cols: ['prob_per_1', 'prob_per_2', 'prob_per_3'] },
  { g: 'Problemas', id: 'prob_per_1', t: 'Problema que más le afecta personalmente' },
  { g: 'Economía', id: 'eco_esp', t: 'Situación económica general de España' },
  { g: 'Economía', id: 'eco_per', t: 'Situación económica personal' },
  { g: 'Ideología', id: 'ideologia', t: 'Autoubicación ideológica (media)', tipo: 'media', cols: ['ideologia'] },
  { g: 'Ideología', id: 'ideologia_g', t: 'Autoubicación ideológica (cinco grupos)' },
  { g: 'Ideología', id: 'ideologia_cat', t: 'Autoubicación ideológica (escala 1 a 10)' },
  { g: 'Perfil', id: 'clase_subjetiva', t: 'Clase social subjetiva' },
  { g: 'Perfil', id: 'clase_social', t: 'Clase social subjetiva (detallada)' },
  { g: 'Perfil', id: 'religiosidad', t: 'Religiosidad' },
  { g: 'Perfil', id: 'practica_religiosa', t: 'Asistencia a oficios religiosos' },
  { g: 'Perfil', id: 'sitlab', t: 'Situación laboral' },
  { g: 'Perfil', id: 'estudios', t: 'Nivel de estudios' },
  { g: 'Perfil', id: 'participacion_g', t: 'Participación en las últimas generales' },
  { g: 'Perfil', id: 'estado_civil', t: 'Estado civil' },
  { g: 'Perfil', id: 'ocupacion_g', t: 'Grupo ocupacional' },
  { g: 'Perfil', id: 'ocupacion_r', t: 'Ocupación (grandes grupos de la CNO-11)' },
  { g: 'Perfil', id: 'situacion_profesional', t: 'Situación profesional' },
  { g: 'Perfil', id: 'ingresos_hogar', t: 'Ingresos netos del hogar' },
  { g: 'Perfil', id: 'nacionalidad', t: 'Nacionalidad' },
  { g: 'Perfil', id: 'lugar_nacimiento', t: 'Lugar de nacimiento' },
];
const CRUCES = [
  ['sexo', 'Sexo'], ['edad_g', 'Edad'], ['ccaa', 'Comunidad autónoma'], ['tamuni', 'Tamaño de municipio'],
  ['estudios', 'Nivel de estudios'], ['sitlab', 'Situación laboral'], ['clase_subjetiva', 'Clase social subjetiva'],
  ['religiosidad', 'Religiosidad'], ['ideologia_g', 'Ideología'], ['recuerdo_voto', 'Recuerdo de voto'],
  ['intencion_voto_r', 'Intención directa de voto'], ['voto_simpatia', 'Voto + simpatía'], ['estado_civil', 'Estado civil'],
  ['practica_religiosa', 'Asistencia a oficios religiosos'], ['ocupacion_g', 'Grupo ocupacional'],
  ['situacion_profesional', 'Situación profesional'], ['ingresos_hogar', 'Ingresos del hogar'],
  ['nacionalidad', 'Nacionalidad'], ['lugar_nacimiento', 'Lugar de nacimiento'],
];
const FILTROS = [...CRUCES, ['provincia', 'Provincia']];
// la respuesta literal ya no se ofrece como cruce, pero los enlaces guardados que la usan siguen funcionando
const CRUCE_DE = Object.fromEntries([...FILTROS, ['intencion_voto', 'Intención directa: respuesta literal']]);

const COLOR_PARTIDO = {
  PSOE: '#d8312b', PP: '#2a6fbe', VOX: '#5a9e2c', SUMAR: '#d43f7a', PODEMOS: '#6c3483', UNIDAS_PODEMOS: '#8a4fa6',
  PODEMOS_IU_AV: '#8a4fa6', CS: '#ea7a2a', MAS_PAIS: '#0f9d8a', ERC: '#e2a224', JUNTS: '#25b7c4', PNV: '#2e7d3c',
  EH_BILDU: '#9aa61c', BNG: '#79b2dc', CC: '#e6be00', SALF: '#7a5236', IU: '#b03a3a', COMPROMIS: '#f08c2e',
  NO_VOTARIA: '#55585e', NO_VOTO: '#55585e', NO_VOTA_NINGUNO: '#55585e', BLANCO: '#b9b6b0', NULO: '#9d9a94', NINGUNO: '#958f84', OTRO: '#aeaba5',
};
const PARTIDO_LIDER = {
  lider_pedro_sanchez: 'PSOE', lider_alberto_nunez_feijoo: 'PP', lider_pablo_casado: 'PP', lider_santiago_abascal: 'VOX',
  lider_yolanda_diaz: 'SUMAR', lider_pablo_iglesias: 'PODEMOS', lider_ione_belarra: 'PODEMOS', lider_ines_arrimadas: 'CS',
  lider_inigo_errejon: 'MAS_PAIS',
};
const PARTIDO_CANDIDATO = {
  'Pedro Sánchez': 'PSOE', 'Alberto Núñez Feijóo': 'PP', 'Pablo Casado': 'PP', 'Santiago Abascal': 'VOX', 'Yolanda Díaz': 'SUMAR',
  'Pablo Iglesias': 'PODEMOS', 'Ione Belarra': 'PODEMOS', 'Irene Montero': 'PODEMOS', 'Inés Arrimadas': 'CS', 'Íñigo Errejón': 'MAS_PAIS',
  'Isabel Díaz Ayuso': 'PP', 'Alberto Garzón': 'IU', 'Gabriel Rufián': 'ERC', 'Juan Manuel Moreno Bonilla': 'PP', 'Emiliano García-Page': 'PSOE',
  'Alvise Pérez': 'SALF',
};
const DEFECTO = [
  { preg: 'intencion_voto_r' },
  { preg: 'voto_simpatia' },
  { tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', ancho: true, cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] },
  { tipo: 'transferencias', preg: 'intencion_voto_r', acum: 3, ancho: true },
  { preg: 'lideres' },
  { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] },
  { tipo: 'dispersion', grupo: 'voto_simpatia', x: { preg: 'ideologia' }, yEtq: ['prob_esp', 'La vivienda'], acum: 3 },
  { tipo: 'mapa', indEtq: ['prob_esp', 'La vivienda'], acum: 6 },
  { tipo: 'calor', preg: 'prob_esp', ancho: true },
  { preg: 'prob_per' },
  { tipo: 'comparar', preg: 'intencion_voto_r' },
  { preg: 'intencion_voto_r', recuerdo: true },
  { preg: 'eco_esp' },
];
// En el móvil, menos paneles y sin los que necesitan todo el ancho (transferencias, dispersión, mapa, calor)
const DEFECTO_MOVIL = [
  { preg: 'intencion_voto_r' },
  { preg: 'voto_simpatia' },
  { tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] },
  { preg: 'lideres' },
  { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] },
  { preg: 'prob_esp' },
  { preg: 'eco_esp' },
];
/* Enlaces con nombre (#vivienda, #lideres…): una selección de paneles cada uno, en la misma notación que DEFECTO */
const PRESETS = {
  voto: [{ preg: 'intencion_voto_r' }, { preg: 'voto_simpatia' }, { tipo: 'comparar', preg: 'intencion_voto_r' }],
  edad: [{ tipo: 'barras', preg: 'intencion_voto_r', cruce: 'edad_g', ancho: true, cats: ['PSOE', 'PP', 'VOX', 'SUMAR', 'PODEMOS', 'SALF', 'NO_VOTARIA', 'NS'] }, { preg: 'intencion_voto_r', cruce: 'edad_g', cat1: 'VOX' }, { preg: 'intencion_voto_r', cruce: 'edad_g', cat1: 'PSOE' }],
  transferencias: [{ tipo: 'transferencias', preg: 'intencion_voto_r', acum: 3, ancho: true }],
  lideres: [{ preg: 'lideres' }, { preg: 'pref_presidente', catsEtq: ['Pedro Sánchez', 'Alberto Núñez Feijóo', 'Santiago Abascal', 'Yolanda Díaz', 'Gabriel Rufián', 'Irene Montero'] }],
  problemas: [{ preg: 'prob_esp' }, { preg: 'prob_per' }, { tipo: 'calor', preg: 'prob_esp', ancho: true }],
  vivienda: [{ preg: 'prob_esp', catsEtq: ['La vivienda'] }, { preg: 'prob_per', catsEtq: ['La vivienda'] }, { preg: 'prob_esp', cruce: 'edad_g', cat1Etq: 'La vivienda' }, { tipo: 'mapa', indEtq: ['prob_esp', 'La vivienda'], acum: 6 }],
  economia: [{ preg: 'eco_esp' }, { preg: 'eco_per' }],
  ideologia: [{ preg: 'ideologia' }, { tipo: 'dispersion', grupo: 'voto_simpatia', x: { preg: 'ideologia' }, yEtq: ['prob_esp', 'La vivienda'], acum: 3 }],
  recuerdo: [{ preg: 'intencion_voto_r', recuerdo: true }, { preg: 'recuerdo_voto' }],
  puntos: [{ tipo: 'puntos', ancho: true }],
};
const esMovil = () => matchMedia('(max-width: 640px)').matches;
const CLAVE = 'bet-paneles-v4';
const NOTA_RECUERDO = 'Reponderado por recuerdo de voto: los pesos del CIS se ajustan para que quienes podían votar reproduzcan la participación de las últimas generales, y quienes recuerdan su voto, el resultado (2019 hasta agosto de 2023; 2023 desde septiembre). Es una estimación propia y no coincide con las tablas del CIS. El margen de error usa el efecto de diseño de los nuevos pesos, mayor que el del CIS.';
const DEFECTO_VEDA = [{ preg: 'prob_esp' }, { preg: 'eco_esp' }, { preg: 'ideologia' }, { preg: 'prob_per' }];
