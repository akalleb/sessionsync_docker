require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CAMARA_ID = 'a5dfbede-406c-4f83-a9f5-331b33be63b7';

async function main() {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, title, date, status, blocks, utterances')
    .eq('camara_id', CAMARA_ID)
    .order('date', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching sessions:', error.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main();

