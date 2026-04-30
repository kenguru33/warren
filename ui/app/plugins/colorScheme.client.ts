// The inline <head> script in nuxt.config.ts already applied the persisted
// color scheme to the document so first paint is correct. This plugin runs
// after hydration to bring the reactive `useColorScheme` state in sync.
export default defineNuxtPlugin(() => {
  const { syncFromStorage } = useColorScheme()
  syncFromStorage()
})
