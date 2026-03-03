# PROMPT COMPLETO — Implementar Arquitetura Agent + Tools (estilo OpenClaw)

---

## CONTEXTO DO SISTEMA ATUAL

Você está trabalhando em um sistema Node.js de assistente para Câmaras Municipais brasileiras.

O sistema atual:
- Tem uma rota `/ask` que recebe perguntas dos usuários sobre sessões, vereadores, votações e discursos
- Usa RAG clássico (busca vetorial com embeddings) para responder perguntas
- Tem lógica manual com if/else e regex para perguntas específicas (ex: "quem discursou mais", "próxima sessão", etc.)
- Backend: Node.js + Express
- Banco: Supabase (PostgreSQL + pgvector para vetores)
- LLM: OpenAI (GPT-4o ou similar) via API

**O problema:** toda pergunta nova importante exige mais código manual. O sistema não generaliza.

---

## O QUE VOCÊ VAI IMPLEMENTAR

Uma arquitetura **Agent + Tools** onde:

1. O LLM recebe a pergunta do usuário
2. O LLM decide quais ferramentas chamar (SQL, RAG, ou combinação)
3. As ferramentas executam e retornam dados reais do banco
4. O LLM monta a resposta final em linguagem natural
5. O ciclo se repete até a resposta estar completa

Isso elimina a necessidade de escrever código para cada tipo de pergunta nova.

---

## ESTRUTURA DE ARQUIVOS A CRIAR

```
/routes
  ask.js              ← REFATORAR (agent loop aqui)

/agent
  index.js            ← CRIAR (orquestrador do agente)
  tools/
    definitions.js    ← CRIAR (definição das tools para o LLM)
    executor.js       ← CRIAR (executa a tool certa)
    sessions.js       ← CRIAR (queries de sessões)
    speeches.js       ← CRIAR (queries de discursos)
    votes.js          ← CRIAR (queries de votações)
    transcription.js  ← CRIAR (busca vetorial RAG)
    councilmen.js     ← CRIAR (queries de vereadores)
```

---

## PASSO 1 — Criar `/agent/tools/definitions.js`

Este arquivo define as ferramentas que o LLM pode usar. As descrições são CRÍTICAS — o modelo decide qual tool chamar baseado nelas.

```javascript
// /agent/tools/definitions.js

export const TOOLS_DEFINITION = [
  {
    type: "function",
    function: {
      name: "listar_sessoes",
      description: `
        Lista sessões da câmara municipal com filtros opcionais.
        Use esta tool quando o usuário perguntar sobre:
        - Sessões realizadas em um período
        - Próximas sessões agendadas
        - Sessões de um tipo específico (ordinária, extraordinária, solene)
        - Quantas sessões aconteceram
        - Detalhes de uma sessão por data
      `,
      parameters: {
        type: "object",
        properties: {
          data_inicial: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD. Use para filtrar sessões a partir de uma data."
          },
          data_final: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD. Use para filtrar sessões até uma data."
          },
          tipo: {
            type: "string",
            enum: ["ordinaria", "extraordinaria", "solene", "todas"],
            description: "Tipo da sessão. Padrão: todas."
          },
          status: {
            type: "string",
            enum: ["realizada", "agendada", "cancelada"],
            description: "Status da sessão."
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados. Padrão: 10."
          },
          ordenar_por: {
            type: "string",
            enum: ["data_asc", "data_desc"],
            description: "Ordenação dos resultados. Padrão: data_desc (mais recentes primeiro)."
          }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "buscar_discursos",
      description: `
        Busca e analisa discursos/falas de vereadores nas sessões.
        Use esta tool quando o usuário perguntar sobre:
        - Quem discursou mais (use agrupar_por_vereador: true)
        - O que um vereador específico falou
        - Discursos em uma sessão específica
        - Quantas vezes um vereador usou a palavra
        - Ranking de participação dos vereadores
        Importante: pode ser combinada com listar_sessoes para primeiro encontrar a sessão e depois buscar discursos.
      `,
      parameters: {
        type: "object",
        properties: {
          vereador: {
            type: "string",
            description: "Nome do vereador (busca parcial, ex: 'Silva' encontra 'João Silva')."
          },
          session_id: {
            type: "string",
            description: "ID de uma sessão específica. Use quando souber a sessão exata."
          },
          data_inicial: {
            type: "string",
            description: "Filtrar discursos a partir desta data (YYYY-MM-DD)."
          },
          data_final: {
            type: "string",
            description: "Filtrar discursos até esta data (YYYY-MM-DD)."
          },
          agrupar_por_vereador: {
            type: "boolean",
            description: "Se true, retorna contagem de discursos agrupada por vereador (ranking). Use para 'quem falou mais'."
          },
          limit: {
            type: "number",
            description: "Número máximo de discursos retornados. Padrão: 10."
          }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "buscar_votacoes",
      description: `
        Busca votações e projetos de lei votados nas sessões.
        Use esta tool quando o usuário perguntar sobre:
        - Projetos aprovados ou rejeitados
        - Como um vereador votou em determinado projeto
        - Votações de um período específico
        - Resultado de uma votação
        - Placar de uma votação (quantos a favor, quantos contra)
      `,
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "ID de uma sessão específica."
          },
          vereador: {
            type: "string",
            description: "Nome do vereador para filtrar como ele votou."
          },
          resultado: {
            type: "string",
            enum: ["aprovado", "rejeitado", "todos"],
            description: "Filtrar por resultado da votação."
          },
          projeto: {
            type: "string",
            description: "Número ou nome do projeto de lei para buscar."
          },
          data_inicial: {
            type: "string",
            description: "Data inicial do período (YYYY-MM-DD)."
          },
          data_final: {
            type: "string",
            description: "Data final do período (YYYY-MM-DD)."
          }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "buscar_transcricao",
      description: `
        Busca semanticamente dentro das transcrições completas das sessões usando IA (RAG vetorial).
        Use esta tool quando o usuário perguntar sobre:
        - O que foi DITO sobre um assunto específico (saúde, educação, orçamento, etc.)
        - Discussões sobre um tema nas sessões
        - Trechos específicos de falas sobre um contexto
        ATENÇÃO: Esta tool é lenta. Prefira as outras tools para perguntas estruturadas.
        Use esta quando a pergunta for sobre conteúdo/tema do que foi discutido.
      `,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "O que buscar semanticamente nas transcrições. Seja específico."
          },
          session_id: {
            type: "string",
            description: "Opcional: limitar busca a uma sessão específica."
          },
          limit: {
            type: "number",
            description: "Número de trechos relevantes a retornar. Padrão: 5."
          }
        },
        required: ["query"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "listar_vereadores",
      description: `
        Lista vereadores da câmara com informações de partido, presença e status.
        Use esta tool quando o usuário perguntar sobre:
        - Quais vereadores compõem a câmara
        - Vereadores de um partido específico
        - Presença/ausência de vereadores
        - Informações sobre um vereador específico
      `,
      parameters: {
        type: "object",
        properties: {
          partido: {
            type: "string",
            description: "Filtrar por partido político."
          },
          nome: {
            type: "string",
            description: "Buscar por nome (parcial)."
          },
          ativo: {
            type: "boolean",
            description: "true para apenas vereadores ativos. Padrão: true."
          }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "buscar_presenca",
      description: `
        Busca registro de presença e ausência dos vereadores nas sessões.
        Use esta tool quando o usuário perguntar sobre:
        - Quem faltou a uma sessão
        - Taxa de presença de um vereador
        - Vereador com mais faltas
        - Presença em um período específico
      `,
      parameters: {
        type: "object",
        properties: {
          vereador: {
            type: "string",
            description: "Nome do vereador."
          },
          session_id: {
            type: "string",
            description: "ID de sessão específica."
          },
          data_inicial: {
            type: "string",
            description: "Data inicial (YYYY-MM-DD)."
          },
          data_final: {
            type: "string",
            description: "Data final (YYYY-MM-DD)."
          },
          agrupar_por_vereador: {
            type: "boolean",
            description: "Se true, retorna ranking de presença por vereador."
          }
        }
      }
    }
  }
];
```

---

## PASSO 2 — Criar `/agent/tools/sessions.js`

```javascript
// /agent/tools/sessions.js
import { supabase } from '../../lib/supabase.js'; // ajuste o caminho

export async function getSessions({ camaraId, data_inicial, data_final, tipo, status, limit = 10, ordenar_por = 'data_desc' }) {
  let query = supabase
    .from('sessions') // ajuste para o nome real da sua tabela
    .select('id, data, tipo, status, pauta, local, created_at')
    .eq('camara_id', camaraId);

  if (data_inicial) query = query.gte('data', data_inicial);
  if (data_final)   query = query.lte('data', data_final);
  if (tipo && tipo !== 'todas') query = query.eq('tipo', tipo);
  if (status) query = query.eq('status', status);

  query = query
    .order('data', { ascending: ordenar_por === 'data_asc' })
    .limit(limit);

  const { data, error } = await query;
  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhuma sessão encontrada com esses filtros.' };

  return { sessoes: data, total: data.length };
}
```

---

## PASSO 3 — Criar `/agent/tools/speeches.js`

```javascript
// /agent/tools/speeches.js
import { supabase } from '../../lib/supabase.js';

export async function getSpeeches({ camaraId, vereador, session_id, data_inicial, data_final, agrupar_por_vereador, limit = 10 }) {

  // Modo ranking: agrupa por vereador
  if (agrupar_por_vereador) {
    const { data, error } = await supabase.rpc('count_speeches_by_councilman', {
      p_camara_id: camaraId,
      p_data_inicial: data_inicial || null,
      p_data_final: data_final || null
    });
    if (error) return { erro: error.message };
    return { ranking: data };
  }

  // Modo listagem normal
  let query = supabase
    .from('blocks') // ajuste para o nome real da sua tabela de blocos/discursos
    .select('id, vereador, conteudo, session_id, tipo, created_at')
    .eq('camara_id', camaraId)
    .in('tipo', ['discurso', 'aparteamento', 'fala']); // ajuste para os tipos reais

  if (vereador)     query = query.ilike('vereador', `%${vereador}%`);
  if (session_id)   query = query.eq('session_id', session_id);
  if (data_inicial) query = query.gte('created_at', data_inicial);
  if (data_final)   query = query.lte('created_at', data_final);

  const { data, error } = await query.limit(limit).order('created_at', { ascending: false });
  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhum discurso encontrado.' };

  return { discursos: data, total: data.length };
}
```

> **IMPORTANTE:** Criar também a função SQL no Supabase para o agrupamento:
> ```sql
> CREATE OR REPLACE FUNCTION count_speeches_by_councilman(
>   p_camara_id TEXT,
>   p_data_inicial DATE DEFAULT NULL,
>   p_data_final DATE DEFAULT NULL
> )
> RETURNS TABLE(vereador TEXT, total BIGINT)
> LANGUAGE sql AS $$
>   SELECT vereador, COUNT(*) as total
>   FROM blocks
>   WHERE camara_id = p_camara_id
>     AND tipo IN ('discurso', 'fala', 'aparteamento')
>     AND (p_data_inicial IS NULL OR created_at::date >= p_data_inicial)
>     AND (p_data_final IS NULL OR created_at::date <= p_data_final)
>   GROUP BY vereador
>   ORDER BY total DESC;
> $$;
> ```

---

## PASSO 4 — Criar `/agent/tools/votes.js`

```javascript
// /agent/tools/votes.js
import { supabase } from '../../lib/supabase.js';

export async function getVotes({ camaraId, session_id, vereador, resultado, projeto, data_inicial, data_final }) {
  let query = supabase
    .from('votes') // ajuste para o nome real da sua tabela de votações
    .select('id, projeto, resultado, votos_favor, votos_contra, session_id, data')
    .eq('camara_id', camaraId);

  if (session_id) query = query.eq('session_id', session_id);
  if (resultado && resultado !== 'todos') query = query.eq('resultado', resultado);
  if (projeto)    query = query.ilike('projeto', `%${projeto}%`);
  if (data_inicial) query = query.gte('data', data_inicial);
  if (data_final)   query = query.lte('data', data_final);

  const { data, error } = await query.limit(20).order('data', { ascending: false });
  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhuma votação encontrada.' };

  return { votacoes: data };
}
```

---

## PASSO 5 — Criar `/agent/tools/transcription.js`

```javascript
// /agent/tools/transcription.js
import { supabase } from '../../lib/supabase.js';
import { getEmbedding } from '../../lib/openai.js'; // sua função de embedding

export async function searchTranscription({ camaraId, query, session_id, limit = 5 }) {
  // Gera embedding da query
  const embedding = await getEmbedding(query);

  // Busca vetorial no Supabase (pgvector)
  const { data, error } = await supabase.rpc('match_session_blocks', {
    query_embedding: embedding,
    p_camara_id: camaraId,
    p_session_id: session_id || null,
    match_count: limit,
    match_threshold: 0.7
  });

  if (error) return { erro: error.message };
  if (!data?.length) return { resultado: 'Nenhum trecho relevante encontrado.' };

  return {
    trechos: data.map(d => ({
      conteudo: d.content,
      vereador: d.vereador,
      session_id: d.session_id,
      similaridade: d.similarity
    }))
  };
}
```

---

## PASSO 6 — Criar `/agent/tools/executor.js`

```javascript
// /agent/tools/executor.js
import { getSessions }        from './sessions.js';
import { getSpeeches }        from './speeches.js';
import { getVotes }           from './votes.js';
import { searchTranscription } from './transcription.js';
import { getCouncilmen }      from './councilmen.js';
import { getAttendance }      from './attendance.js';

export async function executeTool(toolName, args) {
  console.log(`[Agent] Executando tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case 'listar_sessoes':
        return await getSessions(args);

      case 'buscar_discursos':
        return await getSpeeches(args);

      case 'buscar_votacoes':
        return await getVotes(args);

      case 'buscar_transcricao':
        return await searchTranscription(args);

      case 'listar_vereadores':
        return await getCouncilmen(args);

      case 'buscar_presenca':
        return await getAttendance(args);

      default:
        return { erro: `Tool desconhecida: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Agent] Erro na tool ${toolName}:`, err);
    return { erro: `Erro ao executar ${toolName}: ${err.message}` };
  }
}
```

---

## PASSO 7 — Criar `/agent/index.js` (O Orquestrador)

Este é o coração do sistema. Implementa o loop do agente.

```javascript
// /agent/index.js
import OpenAI from 'openai';
import { TOOLS_DEFINITION } from './tools/definitions.js';
import { executeTool }       from './tools/executor.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_ITERATIONS = 10; // segurança contra loops infinitos

export async function runAgent({ pergunta, camaraId, contextoExtra = '' }) {
  const messages = [
    {
      role: 'system',
      content: `
Você é um assistente especializado em informações de Câmaras Municipais brasileiras.
Você tem acesso a ferramentas para consultar dados reais da câmara.

REGRAS:
1. SEMPRE use as ferramentas para buscar dados antes de responder. Nunca invente dados.
2. Se precisar de informações de múltiplas fontes, chame múltiplas ferramentas.
3. Combine os resultados das ferramentas para dar uma resposta completa.
4. Responda sempre em português, de forma clara e organizada.
5. Se a pergunta não puder ser respondida com as ferramentas disponíveis, diga claramente.
6. Quando retornar listas, formate de forma legível.

CONTEXTO ADICIONAL:
${contextoExtra}

ID da Câmara atual: ${camaraId}
      `.trim()
    },
    {
      role: 'user',
      content: pergunta
    }
  ];

  let iterations = 0;

  // Loop do agente
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`[Agent] Iteração ${iterations}`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: TOOLS_DEFINITION,
      tool_choice: 'auto',
      temperature: 0.3 // mais determinístico para dados estruturados
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Adiciona a resposta do assistente ao histórico
    messages.push(assistantMessage);

    // Se o modelo quer chamar tools
    if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls?.length) {
      console.log(`[Agent] Model quer chamar ${assistantMessage.tool_calls.length} tool(s)`);

      // Executa todas as tools solicitadas (em paralelo para eficiência)
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (toolCall) => {
          const args = JSON.parse(toolCall.function.arguments);
          args.camaraId = camaraId; // injeta sempre o camaraId

          const result = await executeTool(toolCall.function.name, args);

          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          };
        })
      );

      // Adiciona resultados das tools ao histórico
      messages.push(...toolResults);

      // Continua o loop para o modelo processar os resultados
      continue;
    }

    // Se chegou aqui, o modelo terminou
    if (choice.finish_reason === 'stop') {
      console.log(`[Agent] Concluído em ${iterations} iterações`);
      return {
        resposta: assistantMessage.content,
        iteracoes: iterations
      };
    }

    // Caso inesperado
    break;
  }

  return {
    resposta: 'Não foi possível processar sua pergunta. Tente novamente.',
    iteracoes: iterations
  };
}
```

---

## PASSO 8 — Refatorar `/routes/ask.js`

O arquivo de rota fica simples. Apenas recebe a pergunta e chama o agente.

```javascript
// /routes/ask.js
import express from 'express';
import { runAgent } from '../agent/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { pergunta, camaraId } = req.body;

  if (!pergunta || !camaraId) {
    return res.status(400).json({ erro: 'Campos obrigatórios: pergunta, camaraId' });
  }

  try {
    console.log(`[Ask] Câmara: ${camaraId} | Pergunta: ${pergunta}`);

    const resultado = await runAgent({
      pergunta,
      camaraId,
      contextoExtra: '' // adicione contexto institucional se precisar
    });

    return res.json({
      resposta: resultado.resposta,
      debug: {
        iteracoes: resultado.iteracoes
      }
    });

  } catch (error) {
    console.error('[Ask] Erro:', error);
    return res.status(500).json({ erro: 'Erro interno ao processar pergunta.' });
  }
});

export default router;
```

---

## PASSO 9 — Ajustes nas tabelas do Supabase

Verifique e ajuste os nomes das tabelas e colunas em cada arquivo de tool conforme seu banco real. As suposições aqui são:

| Tabela suposta | O que guarda |
|---|---|
| `sessions` | Sessões da câmara (data, tipo, status, pauta) |
| `blocks` | Blocos/discursos extraídos das sessões (vereador, conteudo, tipo) |
| `votes` | Votações e projetos votados (projeto, resultado, placares) |
| `vereadores` | Cadastro dos vereadores (nome, partido, status) |
| `presenca` | Registro de presença por sessão |

**Se seus nomes forem diferentes**, atualize cada arquivo de tool correspondente.

---

## PASSO 10 — Testar

Teste com perguntas variadas para validar que o agente generaliza:

```bash
# Teste 1: pergunta analítica
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"pergunta": "Quem discursou mais nos últimos 3 meses?", "camaraId": "SEU_ID"}'

# Teste 2: combinação de dados
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"pergunta": "O que o vereador Silva falou na última sessão ordinária?", "camaraId": "SEU_ID"}'

# Teste 3: busca por tema (RAG)
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"pergunta": "O que foi discutido sobre saúde pública nas sessões de 2024?", "camaraId": "SEU_ID"}'

# Teste 4: votações
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"pergunta": "Quais projetos foram aprovados no último mês?", "camaraId": "SEU_ID"}'
```

---

## RESUMO DO QUE FOI IMPLEMENTADO

```
ANTES                          DEPOIS
─────────────────────────────────────────────────────────
/ask com 300+ linhas           /ask com ~30 linhas
if/else para cada pergunta     Agente decide sozinho
Regex manuais                  LLM interpreta a pergunta
RAG puro (só busca vetorial)   RAG + SQL + combinação
Nova pergunta = novo código    Nova pergunta = funciona
```

**Quando adicionar nova funcionalidade:**
- Novo tipo de dado no banco → crie uma nova tool + adicione no executor
- Nova complexidade de pergunta → geralmente funciona com as tools existentes
- Nunca mais precisar escrever regex para perguntas novas

---

## NOTAS FINAIS

1. **Nomes de tabelas:** Ajuste `sessions`, `blocks`, `votes` para os nomes reais do seu banco
2. **Colunas:** Ajuste os campos SELECT em cada tool para as colunas reais
3. **camaraId:** O campo que identifica cada câmara — ajuste o nome se for diferente
4. **Modelo:** Você pode substituir `gpt-4o` por `gpt-4o-mini` para economizar em perguntas simples
5. **Logs:** Os `console.log` com `[Agent]` ajudam a debugar quais tools o modelo está chamando

