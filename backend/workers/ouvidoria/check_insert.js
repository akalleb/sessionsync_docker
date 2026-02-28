const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    // Tenta forçar uma inserção em uma mensagem associada ao primeiro ticket que acharmos
    const { data: tickets } = await supabase.from('ouvidoria_tickets').select('id').limit(1);

    if (tickets && tickets.length > 0) {
        let tid = tickets[0].id;
        console.log("Tentando inserir em ouvidoria_messages no ticket ID:", tid);

        const { error } = await supabase.from('ouvidoria_messages').insert({
            ticket_id: tid,
            from_type: 'ia',
            direction: 'outbound',
            body: 'Mensagem de diagnostico testando constraints'
        });

        if (error) {
            console.error("ERRO COMPLETO DO BANCO DE DADOS:");
            console.dir(error, { depth: null });
        } else {
            console.log("Inserção bem sucedida! O schema NÃO está bloqueando.");
        }
    } else {
        console.log("Nenhum ticket encontrado para testar a FK.");
    }
}
checkSchema();
