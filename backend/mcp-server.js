const { createClient } = require('@supabase/supabase-js');

// Tool Definitions
const TOOLS = {
  get_session_detail: {
    description: "Recupera detalhes completos de uma sessão legislativa, incluindo transcrição e blocos.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" }
      },
      required: ["session_id"]
    }
  },
  get_session_structure: {
    description: "Analisa a sessão para determinar seu tipo (Ordinária, Extraordinária, Solene) e estrutura sugerida.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" }
      },
      required: ["session_id"]
    }
  },
  get_camara_context: {
    description: "Recupera informações sobre a Câmara Municipal (nome, cidade, configurações).",
    parameters: {
      type: "object",
      properties: {
        camara_id: { type: "string" }
      },
      required: ["camara_id"]
    }
  },
  get_legal_context: {
    description: "Busca trechos relevantes na base legal (Lei Orgânica, Regimento Interno) usando busca semântica.",
    parameters: {
      type: "object",
      properties: {
        camara_id: { type: "string" },
        query: { type: "string" }
      },
      required: ["camara_id", "query"]
    }
  },
  list_councilors: {
    description: "Lista os vereadores cadastrados de uma câmara, incluindo partido e cargo.",
    parameters: {
      type: "object",
      properties: {
        camara_id: { type: "string" }
      },
      required: ["camara_id"]
    }
  },
  get_councilor_details: {
    description: "Obtém detalhes específicos de um vereador pelo seu ID.",
    parameters: {
      type: "object",
      properties: {
        councilor_id: { type: "string" }
      },
      required: ["councilor_id"]
    }
  },
  list_sessions: {
    description: "Lista sessões recentes, permitindo filtrar por data ou tipo.",
    parameters: {
      type: "object",
      properties: {
        camara_id: { type: "string" },
        limit: { type: "number", description: "Limite de registros (padrão 10)" },
        offset: { type: "number", description: "Pular registros (padrão 0)" }
      },
      required: ["camara_id"]
    }
  },
  search_sessions: {
    description: "Busca textual em transcrições, resumos e títulos de sessões.",
    parameters: {
      type: "object",
      properties: {
        camara_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: ["camara_id", "query"]
    }
  },
  generate_minutes: {
    description: "Gera o texto completo de uma ata legislativa com base nos dados da sessão e contexto.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        minutes_type: { type: "string", enum: ["ordinaria", "extraordinaria", "solene"] },
        style_options: { type: "object" }
      },
      required: ["session_id", "minutes_type"]
    }
  }
};

// Tool Implementations
const TOOL_IMPLEMENTATIONS = {
  get_session_detail: async ({ session_id }, { supabase, user }) => {
    // Validate access via RLS (handled by the passed supabase client) or explicit check
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, date, status, duration, transcript, blocks, final_minutes, camara_id, user_id')
      .eq('id', session_id)
      .single();

    if (error) throw new Error(`Erro ao buscar sessão: ${error.message}`);
    if (!data) throw new Error("Sessão não encontrada");

    return data;
  },

  get_session_structure: async ({ session_id }, { supabase }) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('title')
      .eq('id', session_id)
      .single();

    if (error) throw new Error(`Erro ao buscar sessão: ${error.message}`);

    let tipo = 'ordinaria';
    if (data && data.title) {
      const titleLower = data.title.toLowerCase();
      if (titleLower.includes('solene')) tipo = 'solene';
      else if (titleLower.includes('extraordinária') || titleLower.includes('extraordinaria')) tipo = 'extraordinaria';
    }

    const structures = {
      ordinaria: "1. Abertura/Pequeno Expediente; 2. Grande Expediente; 3. Ordem do Dia; 4. Explicações Pessoais; 5. Encerramento.",
      extraordinaria: "1. Abertura; 2. Ordem do Dia (Pauta Específica); 3. Encerramento.",
      solene: "1. Abertura; 2. Composição da Mesa; 3. Hinos; 4. Discursos/Homenagens; 5. Encerramento."
    };

    return {
      tipo,
      estrutura_sugerida: structures[tipo] || structures['ordinaria']
    };
  },

  get_camara_context: async ({ camara_id }, { supabase }) => {
    // Usually public or readable by authenticated users
    const { data, error } = await supabase
      .from('camaras')
      .select('*')
      .eq('id', camara_id)
      .single();

    if (error) throw new Error(`Erro ao buscar câmara: ${error.message}`);
    return data;
  },

  get_legal_context: async ({ camara_id, query }, { serviceSupabase, openai }) => {
    // Embedding search requires service role usually if accessing embeddings table directly,
    // or RLS must permit. Assuming service role for embeddings search to be safe/consistent.

    if (!openai) throw new Error("OpenAI client not available");

    const embeddingResponse = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
      input: query,
    });
    const embedding = embeddingResponse.data[0].embedding;

    const { data: chunks, error } = await serviceSupabase.rpc('match_legal_docs', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      filter_camara_id: camara_id
    });

    if (error) {
      // Fallback: try without RPC if not exists or fails, though usually RPC is best for vector search
      console.error("Vector search error:", error);
      return [];
    }

    if (!chunks || !Array.isArray(chunks)) return [];

    return chunks.map(chunk => ({
      source: chunk.source_doc,
      reference: chunk.article_ref,
      content: chunk.content
    }));
  },

  list_councilors: async ({ camara_id }, { supabase }) => {
    const { data, error } = await supabase
      .from('vereadores')
      .select('*, partidos(sigla, nome)')
      .eq('camara_id', camara_id);

    if (error) throw new Error(`Erro ao listar vereadores: ${error.message}`);
    return data;
  },

  get_councilor_details: async ({ councilor_id }, { supabase }) => {
    const { data, error } = await supabase
      .from('vereadores')
      .select('*, partidos(sigla, nome), profiles(preferences)')
      .eq('id', councilor_id)
      .single();

    if (error) throw new Error(`Erro ao buscar vereador: ${error.message}`);
    return data;
  },

  list_sessions: async ({ camara_id, limit = 10, offset = 0 }, { supabase }) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, date, status')
      .eq('camara_id', camara_id)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Erro ao listar sessões: ${error.message}`);
    return data;
  },

  search_sessions: async ({ camara_id, query, limit = 5 }, { supabase }) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, date')
      .eq('camara_id', camara_id)
      .or(`title.ilike.%${query}%,transcript.ilike.%${query}%,final_minutes.ilike.%${query}%`)
      .limit(limit);

    if (error) throw new Error(`Erro na busca: ${error.message}`);
    return data;
  },

  generate_minutes: async ({ session_id, minutes_type, style_options }, context) => {
    const { supabase, serviceSupabase, openai } = context;

    // 1. Get Session Detail
    const session = await TOOL_IMPLEMENTATIONS.get_session_detail({ session_id }, context);

    // 2. Get Structure
    const structure = await TOOL_IMPLEMENTATIONS.get_session_structure({ session_id }, context);

    // 3. Get Camara Context
    let camara = null;
    if (session.camara_id) {
      camara = await TOOL_IMPLEMENTATIONS.get_camara_context({ camara_id: session.camara_id }, context);
    }

    // 4. Get Legal Context (only if Solene or requested)
    let legalContext = [];
    if (minutes_type === 'solene' && session.camara_id) {
      legalContext = await TOOL_IMPLEMENTATIONS.get_legal_context({
        camara_id: session.camara_id,
        query: "sessão solene protocolo homenagens"
      }, context);
    }

    // 5. Build Prompt
    const systemPrompt = `Você é um assistente legislativo especializado em redigir atas oficiais de Câmaras Municipais.
Sua tarefa é gerar uma ata completa, formal e bem estruturada para uma sessão ${minutes_type.toUpperCase()}.
Use linguagem culta, impessoal e estritamente fiel aos fatos apresentados nos blocos.
Siga a estrutura fornecida e as regras de redação oficial.`;

    const userPrompt = `
DADOS DA CÂMARA:
Nome: ${camara?.nome || 'Câmara Municipal'}
Cidade/Estado: ${camara?.cidade || ''}/${camara?.estado || ''}

DADOS DA SESSÃO:
Título: ${session.title}
Data: ${new Date(session.date).toLocaleDateString('pt-BR')}
Duração: ${session.duration || 'Não informada'}

ESTRUTURA SUGERIDA:
${structure.estrutura_sugerida}

BLOCOS DA TRANSCRIÇÃO (Matéria-prima):
${JSON.stringify(session.blocks.map(b => ({
    tipo: b.type, // (abertura, expediente, ordem_dia, votacao, etc.)
    titulo: b.title,
    orador: b.speaker,
    conteudo: b.summary || b.content // Prefira o resumo se existir
})), null, 2)}

CONTEXTO LEGAL (Use se relevante para fundamentar ritos):
${legalContext.map(l => `- ${l.source} (${l.reference}): ${l.content}`).join('\n')}

REGRAS DE REDAÇÃO:
1. Cabeçalho: Use o nome da câmara e dados da sessão.
2. Abertura: Mencione quem presidiu e a verificação de quórum (se houver).
3. Expediente: Liste leituras de ofícios, projetos e requerimentos de forma resumida.
4. Ordem do Dia: Detalhe as discussões e, PRINCIPALMENTE, o resultado das votações (Aprovado/Rejeitado/Adiado).
5. Explicações Pessoais/Grande Expediente: Resuma os discursos dos vereadores, citando o nome de cada orador.
6. Encerramento: Mencione o horário e a convocação para a próxima sessão.
7. Estilo: Use marcadores Markdown (# para Títulos, ## para Seções, **negrito** para destaques).
8. Fidelidade: Não invente informações. Se algo não foi dito, não mencione.

Gere a ata completa agora:
`;

    // 6. Call LLM
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL_MINI || 'openai/gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
    });

    const minutesText = completion.choices[0].message.content;

    // 7. Save result (using Service Role to bypass RLS write check if needed, though usually user should have write access)
    // We use serviceSupabase here to ensure it saves even if RLS is tricky, but strictly we should use 'supabase' if the user has permission.
    // Given the requirements "Salvar resultado em sessions.final_minutes via Service Role", we use serviceSupabase.

    await serviceSupabase
      .from('sessions')
      .update({ final_minutes: minutesText })
      .eq('id', session_id);

    return {
      minutes_text: minutesText,
      used_sources: legalContext.map(l => l.source)
    };
  }
};

async function executeTool(toolName, args, context) {
  const tool = TOOL_IMPLEMENTATIONS[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not found`);
  return await tool(args, context);
}

function setupMcpServer(app, { getSupabaseClient, getServiceSupabase, openai }) {
  // MCP Protocol Endpoint (Simplified HTTP JSON-RPC style)
  app.post('/mcp', async (req, res) => {
    const { method, params, id } = req.body;

    // Auth Check
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getSupabaseClient(authHeader);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return res.status(401).json({ error: "Invalid token" });

    const context = {
      supabase,
      serviceSupabase: getServiceSupabase(),
      openai,
      user
    };

    try {
      if (method === 'tools/list') {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: Object.entries(TOOLS).map(([name, def]) => ({
              name,
              ...def
            }))
          }
        });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        const result = await executeTool(name, args, context);
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result) }] }
        });
      }

      return res.status(400).json({ error: "Method not supported" });

    } catch (e) {
      console.error("MCP Error:", e);
      return res.status(500).json({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: e.message }
      });
    }
  });

  console.log("MCP Server initialized at /mcp");
}

module.exports = { setupMcpServer, executeTool, TOOLS };
