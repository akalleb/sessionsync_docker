
const { supabase } = require('../db.js');

async function getSpeeches({ camaraId, vereador, session_id, data_inicial, data_final, agrupar_por_vereador, limit = 10 }) {
  // 1. Fetch relevant sessions first
  let query = supabase
    .from('sessions')
    .select('id, date, title, blocks')
    .eq('camara_id', camaraId);

  if (session_id) query = query.eq('id', session_id);
  if (data_inicial) query = query.gte('date', data_inicial);
  if (data_final) query = query.lte('date', data_final);

  // Reduzir o limite para evitar OOM (Out of Memory) devido ao parsing pesado da coluna JSONB 'blocks'
  const maxSessions = agrupar_por_vereador ? 20 : 10;
  const { data: sessions, error } = await query.limit(maxSessions).order('date', { ascending: false });

  if (error) return { erro: error.message };
  if (!sessions?.length) return { resultado: 'Nenhuma sessão encontrada para buscar discursos.' };

  let allBlocks = [];
  for (const session of sessions) {
    const blocks = session.blocks || [];
    for (const block of blocks) {
      if (!block.content) continue;
      // Filter by type if needed (e.g., ignore headers)
      // if (['cabecalho', 'encerramento'].includes(block.type)) continue;

      allBlocks.push({
        ...block,
        session_date: session.date,
        session_title: session.title,
        session_id: session.id
      });
    }
  }

  // Filter by vereador name in speaker or content
  if (vereador) {
    const vLower = vereador.toLowerCase();
    allBlocks = allBlocks.filter(b => 
      (b.speaker && b.speaker.toLowerCase().includes(vLower)) ||
      (b.content && b.content.toLowerCase().includes(vLower))
    );
  }

  // Grouping / Ranking
  if (agrupar_por_vereador) {
    const ranking = {};
    for (const b of allBlocks) {
      // Use speaker as principal identificador de quem falou
      let name = b.speaker || b.vereador || 'Desconhecido';
      name = String(name).replace(/^(Vereador|Vereadora)\s+/i, '').trim();
      
      if (!ranking[name]) ranking[name] = 0;
      ranking[name]++;
    }

    const sorted = Object.entries(ranking)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ vereador: name, total_discursos: count }));
    
    return { ranking: sorted.slice(0, 20) };
  }

  // Normal listing (retorna últimos discursos encontrados)
  return { 
    discursos: allBlocks.slice(0, limit),
    total_encontrado: allBlocks.length
  };
}

module.exports = { getSpeeches };
