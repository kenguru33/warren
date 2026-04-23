// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  app: { head: { title: 'Warren' } },
  devtools: { enabled: true },
  devServer: { host: '0.0.0.0' },
  modules: ['nuxt-auth-utils'],
  runtimeConfig: {
    authUsername: '',
    authPassword: '',
    session: { password: '' },
  },
  nitro: {
    externals: { external: ['better-sqlite3', '@influxdata/influxdb3-client', 'mqtt'] },
  },
  vite: {
    optimizeDeps: { exclude: ['better-sqlite3'] },
  },
})
