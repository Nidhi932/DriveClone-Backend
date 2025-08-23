import { createClient } from '@supabase/supabase-js';

// dotenv is no longer needed. Node.js handles it via the --env-file flag.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// --- DEBUGGING LOGS ---
// These lines will print the values to your terminal.
console.log("--- Checking Environment Variables ---");
console.log("SUPABASE_URL:", supabaseUrl ? "Loaded Successfully" : "MISSING!");
console.log("SUPABASE_SERVICE_KEY:", supabaseKey ? "Loaded Successfully" : "MISSING!");
console.log("------------------------------------");
// --------------------

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or Service Key. Please check your .env file in the root of your backend project.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
