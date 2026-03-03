
const { supabase } = require('../db.js');

async function getAttendance({ camaraId, vereador, session_id, data_inicial, data_final, agrupar_por_vereador }) {
  // 1. Build query
  let query = supabase
    .from('sessao_presencas')
    .select('presente, sessao_id, vereador:vereadores(id, nome, nome_parlamentar)')
    // We need to filter by camara_id, but sessao_presencas usually doesn't have it directly.
    // It's linked to sessao_id -> sessions(camara_id) or vereadores(camara_id).
    // Let's assume we filter by sessions of the camara.
  ;

  let sessionIds = [];
  if (session_id) {
    sessionIds = [session_id];
  } else {
    // Fetch sessions first to filter
    let sQuery = supabase.from('sessions').select('id').eq('camara_id', camaraId);
    if (data_inicial) sQuery = sQuery.gte('date', data_inicial);
    if (data_final)   sQuery = sQuery.lte('date', data_final);
    
    // If no date filter, limit to last 20 sessions to avoid huge query
    if (!data_inicial && !data_final) sQuery = sQuery.order('date', { ascending: false }).limit(20);

    const { data: sessions } = await sQuery;
    if (!sessions?.length) return { resultado: 'Nenhuma sessão encontrada.' };
    sessionIds = sessions.map(s => s.id);
  }

  query = query.in('sessao_id', sessionIds);

  const { data: presencas, error } = await query;

  if (error) return { erro: error.message };
  if (!presencas?.length) return { resultado: 'Nenhum registro de presença encontrado.' };

  // Filter by vereador name if provided (client-side filtering as we joined)
  let filtered = presencas;
  if (vereador) {
    const vLower = vereador.toLowerCase();
    filtered = filtered.filter(p => {
      const v = p.vereador || {};
      return (v.nome && v.nome.toLowerCase().includes(vLower)) ||
             (v.nome_parlamentar && v.nome_parlamentar.toLowerCase().includes(vLower));
    });
  }

  if (agrupar_por_vereador) {
    const ranking = {};
    for (const p of filtered) {
      const v = p.vereador || {};
      const name = v.nome_parlamentar || v.nome || 'Desconhecido';
      
      if (!ranking[name]) ranking[name] = { presentes: 0, ausencias: 0, total: 0 };
      ranking[name].total++;
      if (p.presente) ranking[name].presentes++;
      else ranking[name].ausencias++;
    }

    const sorted = Object.entries(ranking)
      .map(([name, stats]) => ({
        vereador: name,
        presenca: `${stats.presentes}/${stats.total} (${((stats.presentes/stats.total)*100).toFixed(1)}%)`,
        faltas: stats.ausencias
      }))
      .sort((a, b) => b.presenca.localeCompare(a.presenca)); // Rough sort, better by percentage

    return { ranking: sorted };
  }

  // List output
  const output = filtered.map(p => ({
    vereador: p.vereador?.nome_parlamentar || p.vereador?.nome,
    sessao_id: p.sessao_id,
    presente: p.presente
  }));

  return { presencas: output.slice(0, 50) }; // Limit output
}

module.exports = { getAttendance };
