// Comprobación mínima de web/js: variables no definidas y no usadas, e igualdad estricta. Sin reglas de estilo.
// Los tres ficheros comparten el ámbito global del navegador (se cargan con <script>, sin módulos), así que
// `npm run lint` los concatena en el orden de carga (.lint/web.js) y comprueba ese fichero.
export default [
  {
    files: ['.lint/web.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        d3: 'readonly', topojson: 'readonly', getComputedStyle: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly',
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
        localStorage: 'readonly', fetch: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly', addEventListener: 'readonly', matchMedia: 'readonly', devicePixelRatio: 'readonly',
        scrollTo: 'readonly', confirm: 'readonly', structuredClone: 'readonly', IntersectionObserver: 'readonly',
        DecompressionStream: 'readonly', Response: 'readonly', Blob: 'readonly', URL: 'readonly', Image: 'readonly',
        XMLSerializer: 'readonly', TextDecoder: 'readonly', btoa: 'readonly', atob: 'readonly', escape: 'readonly', unescape: 'readonly',
        performance: 'readonly', Intl: 'readonly', Float64Array: 'readonly', Float32Array: 'readonly', Uint8Array: 'readonly',
        Uint16Array: 'readonly', Uint32Array: 'readonly', Int32Array: 'readonly', Map: 'readonly', Set: 'readonly', Promise: 'readonly',
        URLSearchParams: 'readonly', ResizeObserver: 'readonly', requestIdleCallback: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },
];
