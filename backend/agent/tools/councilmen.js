
const { supabase } = require('../db.js');

async function getCouncilmen({ camaraId, partido, nome, ativo = true }) {
  let query = supabase
    .from('vereadores')
    .select('id, nome, nome_parlamentar, partido_sigla, ativo, cargo_mesa, foto_url')
    .eq('camara_id', camaraId);

  if (ativo) query = query.eq('ativo', true);
  if (partido) query = query.ilike('partido_sigla', `%${partido}%`);
  if (nome) query = query.or(`nome.ilike.%${nome}%,nome_parlamentar.ilike.%${nome}%`);

  const { data, error } = await query.order('nome_parlamentar', { ascending: true });

  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhum vereador encontrado.' };

  return { vereadores: data };
}

module.exports = { getCouncilmen };
