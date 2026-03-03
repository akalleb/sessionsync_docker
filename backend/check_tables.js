
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    console.log('Checking "sessions"...');
    const { data: d1, error: e1 } = await supabase.from('sessions').select('*').limit(1);
    if (e1) console.log('Error sessions:', e1.message);
    else console.log('Success sessions:', d1.length > 0 ? Object.keys(d1[0]) : 'Empty');

    console.log('Checking "sessoes"...');
    const { data: d2, error: e2 } = await supabase.from('sessoes').select('*').limit(1);
    if (e2) console.log('Error sessoes:', e2.message);
    else console.log('Success sessoes:', d2.length > 0 ? Object.keys(d2[0]) : 'Empty');
}

check();
