
const { supabase } = require('../db.js');
const { getEmbedding } = require('../openai.js');

async function searchTranscription({ camaraId, query, session_id, limit = 5 }) {
  // Generate embedding for query
  const embedding = await getEmbedding(query);

  // Vector search in Supabase
  // Note: match_session_embeddings takes filter_camara_id, not p_camara_id
  const { data, error } = await supabase.rpc('match_session_embeddings', {
    query_embedding: embedding,
    match_threshold: 0.5, // Lower threshold for better recall
    match_count: limit,
    filter_camara_id: camaraId
  });

  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhum trecho relevante encontrado.' };

  // Filter by session_id if provided (client-side filtering as RPC might not support it)
  let results = data;
  if (session_id) {
    results = results.filter(d => d.session_id === session_id);
  }

  return {
    trechos: results.map(d => ({
      conteudo: d.content,
      // Metadata is stored in JSONB column 'metadata'
      vereador: d.metadata?.title || 'Desconhecido', // heuristics
      session_id: d.session_id,
      similaridade: d.similarity
    }))
  };
}

module.exports = { searchTranscription };
