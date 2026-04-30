import tailwindcss from '@tailwindcss/vite'

// Inline script: applies the persisted theme + color scheme to <html> before
// first paint so users don't get a flash of the wrong palette on reload, and
// first-time visitors land in dark + the default scheme.
const themeBootstrapScript = `
(function(){
  var SCHEMES = ['zinc-indigo','slate-sky','stone-amber','neutral-emerald','gray-rose','zinc-violet'];
  try {
    var t = localStorage.getItem('warren:theme');
    if (t !== 'light') document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
  try {
    var s = localStorage.getItem('warren:scheme');
    if (!s || SCHEMES.indexOf(s) === -1) s = 'zinc-indigo';
    document.documentElement.setAttribute('data-scheme', s);
  } catch (e) {
    document.documentElement.setAttribute('data-scheme', 'zinc-indigo');
  }
})();
`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  app: {
    head: {
      title: 'Warren',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      script: [{ innerHTML: themeBootstrapScript, tagPosition: 'head' }],
    },
  },
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  devServer: { host: '0.0.0.0' },
  modules: ['nuxt-auth-utils'],
  runtimeConfig: {
    authUsername: '',
    authPassword: '',
    session: { password: '', cookie: { secure: false } },
  },
  nitro: {
    externals: { external: ['better-sqlite3', '@influxdata/influxdb3-client', 'mqtt'] },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['better-sqlite3'] },
  },
})
