const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checando tickets...");
    const { data: tickets } = await supabase.from('ouvidoria_tickets').select('*');
    console.log("Tickets encontrados:", tickets.length);
    if (tickets.length > 0) console.log("Exemplo de ID:", tickets[0].id);

    console.log("Checando mensagens...");
    const { data: messages, error } = await supabase.from('ouvidoria_messages').select('*');
    if (error) console.error("Erro tb mensagens:", error);
    console.log("Mensagens cadastradas no banco:", messages ? messages.length : 0);
    if (messages && messages.length > 0) {
        console.log("Amostra mensagem:", messages[0]);
    }

    console.log("Checando Knowledge Base...");
    const { data: kb } = await supabase.from('ouvidoria_knowledge_base').select('*');
    console.log("KB cadastradas:", kb ? kb.length : 0);
}
check();
