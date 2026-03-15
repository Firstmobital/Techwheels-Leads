import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase web env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in root .env.local (or your deployment build environment), then restart the app."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
