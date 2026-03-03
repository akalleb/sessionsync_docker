
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase URL or Service Key missing in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = { supabase };
