require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const { data, error } = await supabase.from('camaras').select('id, nome').limit(5);
  if (error) {
    console.error('Error fetching camaras:', error.message);
  } else {
    console.log('Camaras:', data);
  }
}

main();

