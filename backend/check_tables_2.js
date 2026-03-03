
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    const tables = ['votacoes', 'votos', 'vereadores', 'profiles', 'sessao_presencas'];
    for (const t of tables) {
        console.log(`Checking "${t}"...`);
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (error) console.log(`Error ${t}:`, error.message);
        else console.log(`Success ${t}:`, data.length > 0 ? Object.keys(data[0]) : 'Empty (Table exists)');
    }
}

check();
