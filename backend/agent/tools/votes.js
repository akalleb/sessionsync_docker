
const { supabase } = require('../db.js');

async function getVotes({ camaraId, session_id, vereador, resultado, projeto, data_inicial, data_final }) {
  // 1. Build query for votacoes
  let query = supabase
    .from('votacoes')
    .select('id, sessao_id, titulo, tipo, status, resultado, votos_favor, votos_contra, abstencoes, created_at')
    // We might need to join with sessions to filter by camara_id if votacoes doesn't have it
    // But usually it should have. Let's assume it has or we filter by session_ids from camara
  ;

  // If votacoes has camara_id, good. If not, we might need to filter sessions first.
  // Let's assume votacoes is linked to sessao_id.
  // To be safe, let's fetch sessions for this camara first if we don't have session_id
  
  let sessionIds = [];
  if (session_id) {
    sessionIds = [session_id];
  } else {
    let sQuery = supabase.from('sessions').select('id').eq('camara_id', camaraId);
    if (data_inicial) sQuery = sQuery.gte('date', data_inicial);
    if (data_final)   sQuery = sQuery.lte('date', data_final);
    
    const { data: sessions } = await sQuery.limit(100);
    if (!sessions?.length) return { resultado: 'Nenhuma sessão encontrada neste período.' };
    sessionIds = sessions.map(s => s.id);
  }

  query = query.in('sessao_id', sessionIds);

  if (resultado && resultado !== 'todos') query = query.ilike('resultado', `%${resultado}%`);
  if (projeto) query = query.ilike('titulo', `%${projeto}%`); // titulo da votação costuma ser o projeto

  const { data: votacoes, error } = await query.order('created_at', { ascending: false }).limit(20);

  if (error) return { erro: error.message };
  if (!votacoes?.length) return { resultado: 'Nenhuma votação encontrada.' };

  // 2. If filtering by vereador, fetch their votes
  if (vereador) {
    // Find vereador ID
    const { data: vData } = await supabase
      .from('vereadores')
      .select('id, nome, nome_parlamentar')
      .eq('camara_id', camaraId)
      .or(`nome.ilike.%${vereador}%,nome_parlamentar.ilike.%${vereador}%`)
      .limit(1);

    if (!vData?.length) return { resultado: `Vereador '${vereador}' não encontrado.` };
    const vereadorId = vData[0].id;
    const vereadorNome = vData[0].nome_parlamentar || vData[0].nome;

    // Fetch votes for these votacoes
    const votacaoIds = votacoes.map(v => v.id);
    const { data: votos } = await supabase
      .from('votos')
      .select('votacao_id, voto')
      .eq('vereador_id', vereadorId)
      .in('votacao_id', votacaoIds);

    const votosMap = {};
    (votos || []).forEach(v => votosMap[v.votacao_id] = v.voto);

    // Merge info
    const result = votacoes.map(v => ({
      ...v,
      voto_do_vereador: votosMap[v.id] || 'Não registrou voto / Ausente',
      vereador_consultado: vereadorNome
    }));

    return { votacoes: result };
  }

  return { votacoes };
}

module.exports = { getVotes };
