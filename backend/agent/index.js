
const { openai, LLM_MODEL } = require('./openai.js');
const { TOOLS_DEFINITION } = require('./tools/definitions.js');
const { executeTool } = require('./tools/executor.js');

const MAX_ITERATIONS = 10;

async function runAgent({ pergunta, camaraId, contextoExtra = '' }) {
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.toLocaleString('pt-BR', { month: 'long' });

  const messages = [
    {
      role: 'system',
      content: `
Você é um assistente especializado em informações de Câmaras Municipais brasileiras.

REFERÊNCIA TEMPORAL — MUITO IMPORTANTE:
- Hoje é: ${dataFormatada}
- Ano atual: ${anoAtual}
- Mês atual: ${mesAtual}
- SEMPRE use essas datas como referência quando o usuário disser "esse ano", "esse mês", "agora", "recente", "último", "atual".
- NUNCA assuma anos passados como 2023 ou 2024 para perguntas sobre o presente.

Você tem acesso a ferramentas para consultar dados reais da câmara.

REGRAS GERAIS:
1. SEMPRE use as ferramentas para buscar dados antes de responder. Nunca invente dados.
2. Se precisar de informações de múltiplas fontes, chame múltiplas ferramentas.
3. Combine os resultados das ferramentas para dar uma resposta completa.
4. Responda sempre em português, de forma clara e organizada.
5. Se a pergunta não puder ser respondida com as ferramentas disponíveis, diga claramente.
6. Quando retornar listas, formate de forma legível.

REGRAS ESPECÍFICAS:
- Se a pergunta mencionar "vereador X" ou "vereadora X" e pedir
  "o que ele(a) falou", "o que disse", "quais foram as falas",
  PREFIRA usar a tool buscar_discursos (e NÃO apenas listar_vereadores).
- Use listar_vereadores principalmente para compor listas de vereadores
  ou consultar dados cadastrais, não para saber o conteúdo dos discursos.
- Para perguntas sobre temas discutidos (ex: saúde, educação),
  use primeiro buscar_discursos quando houver vereador específico,
  ou buscar_transcricao quando o foco for só o tema.
- Quando a pergunta falar em "última sessão" ou "sessão de tal data",
  primeiro chame listar_sessoes para descobrir a sessão correta e o session_id,
  depois use buscar_discursos, buscar_votacoes ou buscar_presenca com esse session_id.

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

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`[Agent] Iteração ${iterations}`);

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages,
      tools: TOOLS_DEFINITION,
      tool_choice: 'auto',
      temperature: 0.3
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    messages.push(assistantMessage);

    if (choice.finish_reason === 'tool_calls' && assistantMessage.tool_calls?.length) {
      console.log(`[Agent] Model quer chamar ${assistantMessage.tool_calls.length} tool(s)`);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (toolCall) => {
          const args = JSON.parse(toolCall.function.arguments);
          args.camaraId = camaraId; // inject camaraId

          const result = await executeTool(toolCall.function.name, args);

          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          };
        })
      );

      messages.push(...toolResults);
      continue;
    }

    if (choice.finish_reason === 'stop') {
      console.log(`[Agent] Concluído em ${iterations} iterações`);
      return {
        resposta: assistantMessage.content,
        iteracoes: iterations
      };
    }

    break;
  }

  return {
    resposta: 'Não foi possível processar sua pergunta. Tente novamente.',
    iteracoes: iterations
  };
}

module.exports = { runAgent };
