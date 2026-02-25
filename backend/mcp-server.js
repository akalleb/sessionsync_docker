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
      .select('id, title, date, status, duration, transcript, blocks, final_minutes, camara_id, tipo, user_id')
      .eq('id', session_id)
      .single();

    if (error) throw new Error(`Erro ao buscar sessão: ${error.message}`);
    if (!data) throw new Error("Sessão não encontrada");

    return data;
  },

  get_session_structure: async ({ session_id }, { supabase }) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('title, tipo')
      .eq('id', session_id)
      .single();

    if (error) throw new Error(`Erro ao buscar sessão: ${error.message}`);

    let tipo = 'ordinaria';
    if (data.tipo) {
      tipo = data.tipo.toLowerCase();
    } else if (data.title) {
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
      model: 'text-embedding-3-small',
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
    const systemPrompt = `Você é um assistente legislativo especializado em redigir atas oficiais.
Sua tarefa é gerar uma ata completa e formal para uma sessão ${minutes_type.toUpperCase()}.
Use linguagem formal, culta e impessoal.
Siga a estrutura fornecida.`;

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

BLOCOS DA TRANSCRIÇÃO (Use estes conteúdos para preencher a ata):
${JSON.stringify(session.blocks.map(b => ({
    tipo: b.type,
    titulo: b.title,
    orador: b.speaker,
    conteudo: b.summary || b.content
})), null, 2)}

CONTEXTO LEGAL (Use se relevante):
${legalContext.map(l => `- ${l.source} (${l.reference}): ${l.content}`).join('\n')}

INSTRUÇÕES:
- Redija a ata completa.
- Se houver oradores identificados, cite-os corretamente.
- Para votações, mencione o resultado se estiver claro no texto.
- Não invente informações não presentes nos blocos.
- Use marcadores Markdown (# para títulos, ## para seções).
`;

    // 6. Call LLM
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Or gpt-4o if available/affordable
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
