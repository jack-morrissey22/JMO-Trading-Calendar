import { createClient } from '@supabase/supabase-js'

// Public Supabase project config. The publishable ("anon") key is meant to be
// exposed in the browser — access is guarded by row-level security, not by key
// secrecy — so it is safe to ship. These constants are the fallback used by the
// hosting build; local dev can override them via .env.local.
const FALLBACK_URL = 'https://hbozusmqxkvkzhlimtmy.supabase.co'
const FALLBACK_ANON_KEY = 'sb_publishable_0skAaDqVefkxFTana0_Ghg_nBKCPzH6'

const url = import.meta.env.VITE_SUPABASE_URL ?? FALLBACK_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY

// Single shared client. Session is persisted to localStorage by default, so a
// machine stays logged in between visits (part of the device-trust model, D11).
export const supabase = createClient(url, key)
