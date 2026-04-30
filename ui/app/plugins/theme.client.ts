// The inline <head> script in nuxt.config.ts already applied the persisted
// theme to the document so first paint is correct. This plugin runs after
// hydration to bring the reactive `useTheme` state in sync with whatever the
// inline script decided.
export default defineNuxtPlugin(() => {
  const { syncFromStorage } = useTheme()
  syncFromStorage()
})
