import { initDb } from '../utils/db'

export default defineNitroPlugin(() => {
  initDb()
})
