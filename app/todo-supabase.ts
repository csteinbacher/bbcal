import { createClient } from "@supabase/supabase-js";

const TODO_SUPABASE_URL = "https://eiqdwusgajcefvblqria.supabase.co";
const TODO_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1MPDETD3DhRW2HKbOpD9AQ_FRo0vZ";

export const todoSupabase = createClient(TODO_SUPABASE_URL, TODO_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
