import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing Supabase env vars — check .env.local')
}

// Single shared client. Session is persisted to localStorage by default, so a
// machine stays logged in between visits (part of the device-trust model, D11).
export const supabase = createClient(url, key)
