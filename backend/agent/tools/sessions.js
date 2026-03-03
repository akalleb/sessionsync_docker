
const { supabase } = require('../db.js');

async function getSessions({ camaraId, data_inicial, data_final, tipo, status, limit = 10, ordenar_por = 'data_desc' }) {
  let query = supabase
    .from('sessions')
    .select('id, date, status, title, created_at')
    .eq('camara_id', camaraId);

  if (data_inicial) query = query.gte('date', data_inicial);
  if (data_final)   query = query.lte('date', data_final);
  // Se houver coluna tipo específica na tabela, pode-se filtrar por ela:
  // if (tipo && tipo !== 'todas') query = query.eq('tipo', tipo);
  // O campo "status" na tabela pode não usar exatamente os mesmos valores
  // ("realizada", "agendada", etc.), então não filtramos por status aqui
  // para evitar falsos negativos em perguntas como "última sessão realizada".

  query = query
    .order('date', { ascending: ordenar_por === 'data_asc' })
    .limit(limit);

  const { data, error } = await query;
  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhuma sessão encontrada com esses filtros.' };

  return { sessoes: data, total: data.length };
}

module.exports = { getSessions };
