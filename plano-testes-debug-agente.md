# PLANO DE TESTES & DEBUG — Agente OpenClaw
> Foco: Chat Web da Câmara | Problema conhecido: "O que vereador X falou"

---

## COMO USAR ESTE PLANO

1. Execute cada pergunta no chat
2. Anote o resultado em cada linha (✅ OK / ❌ Falhou / ⚠️ Parcial)
3. Para cada ❌, vá direto à seção de DEBUG correspondente

---

## BLOCO 1 — Testes de Aquecimento (deve funcionar fácil)

Esses validam que o agente está vivo e conectado ao banco.

| # | Pergunta para digitar no chat | O que esperar |
|---|---|---|
| 1.1 | `Olá, o que você pode me dizer?` | Apresentação do assistente |
| 1.2 | `Quais vereadores fazem parte da câmara?` | Lista com nomes e partidos |
| 1.3 | `Quantas sessões aconteceram esse ano?` | Número + lista ou resumo |
| 1.4 | `Qual foi a última sessão realizada?` | Data, tipo e pauta da última sessão |

**Se 1.2, 1.3 ou 1.4 falharem** → o problema é na conexão básica com o banco. Veja DEBUG-A.

---

## BLOCO 2 — Testes de Discursos (seu problema principal)

### 2A — Variações de "o que o vereador X falou"

Troque `[NOME]` por um vereador real que você sabe que tem discursos no banco.

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 2.1 | `O que o vereador [NOME] falou?` | Resumo dos últimos discursos |  |
| 2.2 | `O que [NOME] disse na última sessão?` | Discursos da sessão mais recente |  |
| 2.3 | `Quais foram as falas do vereador [NOME] em junho?` | Discursos filtrados por mês |  |
| 2.4 | `Mostre os discursos de [NOME] na sessão ordinária mais recente` | Discursos da última ordinária |  |
| 2.5 | `[NOME] falou sobre saúde em alguma sessão?` | Combina busca por vereador + tema |  |

### 2B — Ranking de discursos

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 2.6 | `Quem discursou mais esse mês?` | Ranking de vereadores por nº de falas |  |
| 2.7 | `Qual vereador mais usou a palavra nos últimos 3 meses?` | Ranking com contagem |  |
| 2.8 | `Quem participou mais das sessões?` | Ranking de participação |  |

**Se 2.1–2.5 falharem** → veja DEBUG-B (o mais comum).
**Se 2.6–2.8 falharem** → veja DEBUG-C.

---

## BLOCO 3 — Testes de Sessões

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 3.1 | `Quais sessões aconteceram em junho?` | Lista de sessões do mês |  |
| 3.2 | `Houve sessão solene esse ano?` | Sessões do tipo solene |  |
| 3.3 | `Qual a pauta da próxima sessão?` | Sessão agendada + pauta |  |
| 3.4 | `Me fale sobre a sessão do dia [DATA]` | Detalhes da sessão daquela data |  |

---

## BLOCO 4 — Testes de Votações

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 4.1 | `Quais projetos foram votados esse mês?` | Lista de projetos + resultado |  |
| 4.2 | `O projeto [NÚMERO] foi aprovado?` | Resultado da votação |  |
| 4.3 | `Como o vereador [NOME] votou no projeto [NÚMERO]?` | Voto individual do vereador |  |
| 4.4 | `Quais projetos foram rejeitados esse ano?` | Lista filtrada por resultado |  |

---

## BLOCO 5 — Testes de Presença

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 5.1 | `Quem faltou na última sessão?` | Lista de ausentes |  |
| 5.2 | `Qual vereador tem mais faltas esse ano?` | Ranking de faltas |  |
| 5.3 | `O vereador [NOME] esteve na sessão do dia [DATA]?` | Presença/ausência confirmada |  |

---

## BLOCO 6 — Testes de Busca Temática (RAG)

| # | Pergunta | O que esperar | Resultado |
|---|---|---|---|
| 6.1 | `O que foi discutido sobre saúde nas sessões?` | Trechos relevantes de falas |  |
| 6.2 | `Alguém falou sobre educação recentemente?` | Falas sobre o tema |  |
| 6.3 | `Quais assuntos foram mais debatidos?` | Pode combinar RAG + resumo |  |

---

## BLOCO 7 — Testes de Perguntas Complexas (combinação de tools)

Aqui o agente deve chamar 2+ ferramentas em sequência.

| # | Pergunta | Tools esperadas | Resultado |
|---|---|---|---|
| 7.1 | `Na última sessão, quem falou e o que foi votado?` | listar_sessoes + buscar_discursos + buscar_votacoes |  |
| 7.2 | `O vereador [NOME] falou sobre saúde em alguma sessão de março?` | listar_sessoes + buscar_transcricao |  |
| 7.3 | `Qual vereador falou mais E tem menos faltas?` | buscar_discursos + buscar_presenca |  |

---

---

# SEÇÕES DE DEBUG

---

## DEBUG-A — Agente não retorna dados básicos (vereadores, sessões)

**Sintoma:** Perguntas 1.2, 1.3, 1.4 retornam vazio ou erro.

**Passo 1 — Verifique os logs do backend:**
```bash
# No terminal do servidor, procure por:
[Agent] Executando tool: listar_sessoes
[Agent] Executando tool: listar_vereadores
```

Se esses logs não aparecem, o agente não está chamando as tools. Vá para o Passo 2.
Se aparecem mas retornam vazio, vá para o Passo 3.

**Passo 2 — O LLM não está chamando as tools:**
Verifique no `agent/index.js` se as tools estão sendo passadas corretamente:
```javascript
// Confirme que isso existe na chamada do OpenAI:
tools: TOOLS_DEFINITION,
tool_choice: "auto"
```
Adicione um log temporário:
```javascript
console.log('[DEBUG] Tools enviadas:', TOOLS_DEFINITION.length);
// Deve mostrar 6 (ou o número de tools que você tem)
```

**Passo 3 — Tools chamadas mas retornam vazio:**
Teste a query diretamente no Supabase SQL Editor:
```sql
-- Substitua 'SEU_CAMARA_ID' pelo ID real
SELECT * FROM sessions WHERE camara_id = 'SEU_CAMARA_ID' LIMIT 5;
SELECT * FROM vereadores WHERE camara_id = 'SEU_CAMARA_ID' LIMIT 5;
```
Se retornar dados aqui mas não pelo agente, o problema é no nome da tabela ou coluna no código da tool.

---

## DEBUG-B — "O que vereador X falou" não funciona ⚠️ CRÍTICO

Este é o problema mais comum. Pode ter 3 causas diferentes.

### Causa B1 — O LLM não consegue encontrar o vereador pelo nome

**Sintoma:** Pergunta "O que o vereador Silva falou?" retorna "Nenhum discurso encontrado" mesmo tendo dados.

**Por que acontece:** O nome na pergunta pode ser diferente do nome no banco.
- Usuário digita: "Silva"
- Banco tem: "JOÃO SILVA" ou "João da Silva"

**Solução — adicione log para ver o que está chegando na tool:**
```javascript
// Em agent/tools/speeches.js
export async function getSpeeches({ camaraId, vereador, ... }) {
  console.log('[DEBUG speeches] vereador recebido:', vereador);
  
  // A busca já usa ilike com %, então "Silva" deveria encontrar "João Silva"
  // Se não está funcionando, teste direto no Supabase:
}
```

**Teste no Supabase SQL Editor:**
```sql
-- Substitua 'silva' e 'SEU_CAMARA_ID'
SELECT vereador, COUNT(*) 
FROM blocks 
WHERE camara_id = 'SEU_CAMARA_ID'
  AND vereador ILIKE '%silva%'
GROUP BY vereador;
```

Se retornar resultados aqui, o problema é outra coisa (veja B2).
Se não retornar, seus blocos podem não ter o campo `vereador` preenchido.

**Verifique a estrutura real dos seus blocos:**
```sql
SELECT * FROM blocks WHERE camara_id = 'SEU_CAMARA_ID' LIMIT 3;
```
Olhe quais colunas existem e qual tem o nome do vereador. Pode ser `speaker`, `autor`, `nome_vereador`, etc.
Atualize o arquivo `speeches.js` com o nome correto da coluna.

---

### Causa B2 — O agente está chamando a tool errada

**Sintoma:** Para "o que Silva falou", o agente chama `buscar_transcricao` em vez de `buscar_discursos`.

**Como identificar:** Olhe os logs:
```bash
[Agent] Executando tool: buscar_transcricao  # ← errado para essa pergunta
```

**Solução — melhore a descrição da tool em `definitions.js`:**
```javascript
// buscar_discursos — torne mais explícito:
description: `
  Busca discursos e falas de vereadores específicos.
  PREFIRA esta tool quando a pergunta mencionar o nome de um vereador.
  Use para: "o que [vereador] falou", "discursos de [vereador]", 
  "o que [vereador] disse", "falas de [vereador]".
  NÃO use buscar_transcricao quando o nome do vereador for mencionado.
`,
```

---

### Causa B3 — A sessão não está sendo resolvida antes do discurso

**Sintoma:** "O que Silva falou NA ÚLTIMA SESSÃO?" falha, mas "O que Silva falou?" funciona.

**Por que acontece:** O agente precisa primeiro descobrir qual é a última sessão, depois buscar discursos nela. Às vezes o agente tenta chamar as duas coisas de uma vez.

**Solução — adicione instrução no system prompt do agente (`agent/index.js`):**
```javascript
content: `
  ...suas instruções atuais...
  
  ESTRATÉGIA PARA PERGUNTAS SOBRE SESSÕES ESPECÍFICAS:
  1. Primeiro chame listar_sessoes para encontrar a sessão (por data, tipo, ou "última")
  2. Pegue o session_id retornado
  3. Depois chame buscar_discursos passando esse session_id
  Nunca tente adivinhar o session_id.
`
```

---

## DEBUG-C — Ranking de discursos não funciona

**Sintoma:** "Quem discursou mais?" retorna erro ou lista sem agrupamento.

**Verifique se a função SQL existe no Supabase:**
```sql
-- Execute no SQL Editor do Supabase
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'count_speeches_by_councilman';
```

Se não retornar nada, a função não foi criada. Execute:
```sql
CREATE OR REPLACE FUNCTION count_speeches_by_councilman(
  p_camara_id TEXT,
  p_data_inicial DATE DEFAULT NULL,
  p_data_final DATE DEFAULT NULL
)
RETURNS TABLE(vereador TEXT, total BIGINT)
LANGUAGE sql AS $$
  SELECT vereador, COUNT(*) as total
  FROM blocks
  WHERE camara_id = p_camara_id
    AND tipo IN ('discurso', 'fala', 'aparteamento')
    AND (p_data_inicial IS NULL OR created_at::date >= p_data_inicial)
    AND (p_data_final IS NULL OR created_at::date <= p_data_final)
  GROUP BY vereador
  ORDER BY total DESC;
$$;
```

**Ajuste os valores de `tipo`** para os valores reais na sua tabela:
```sql
-- Veja quais tipos existem:
SELECT DISTINCT tipo FROM blocks WHERE camara_id = 'SEU_CAMARA_ID';
```

---

## DEBUG-D — Agente entra em loop ou demora muito

**Sintoma:** O chat trava ou demora mais de 30 segundos.

**Causa mais comum:** O agente está chamando muitas tools desnecessariamente.

**Adicione timeout no agent loop (`agent/index.js`):**
```javascript
const MAX_ITERATIONS = 5; // reduza de 10 para 5
```

**Adicione log de tempo:**
```javascript
// No início do runAgent:
const startTime = Date.now();

// No final de cada iteração:
console.log(`[Agent] Iteração ${iterations} — ${Date.now() - startTime}ms`);
```

Se uma tool específica está demorando, provavelmente é `buscar_transcricao` (RAG). Adicione na descrição dela:
```javascript
description: `
  ...descrição atual...
  ATENÇÃO: Esta tool é lenta. Só use quando a pergunta for 
  explicitamente sobre o CONTEÚDO/TEMA do que foi discutido,
  não sobre quem falou o quê.
`
```

---

## DEBUG-E — Resposta genérica sem dados reais

**Sintoma:** O agente responde algo como "Não tenho acesso a esses dados" mesmo tendo tools.

**Causa:** O LLM pode estar ignorando as tools se achar que não precisa.

**Solução — force o uso de tools no system prompt:**
```javascript
content: `
  REGRA CRÍTICA: Você NUNCA deve responder sobre dados da câmara 
  sem antes consultar pelo menos uma ferramenta. 
  Se não tiver certeza de qual tool usar, use listar_sessoes 
  como ponto de partida.
  NUNCA invente ou assuma dados.
`
```

---

## CHECKLIST FINAL DE VALIDAÇÃO

Depois de corrigir os problemas encontrados, valide estes 5 casos obrigatórios:

```
[ ] 1. Listar vereadores                    → retorna dados reais
[ ] 2. O que [VEREADOR REAL] falou?         → retorna discursos reais  
[ ] 3. Quem discursou mais esse mês?        → retorna ranking com números
[ ] 4. O que foi discutido sobre [TEMA]?    → retorna trechos relevantes
[ ] 5. Quem faltou na última sessão?        → retorna lista de ausentes
```

Se todos os 5 passarem, o agente está funcionando corretamente para os casos principais.

---

## DICA: Como monitorar o agente em tempo real

Adicione este middleware temporário no `ask.js` para ver tudo que acontece:

```javascript
// Adicione no início do runAgent, em agent/index.js
console.log('\n========== NOVA PERGUNTA ==========');
console.log('Pergunta:', pergunta);
console.log('CamaraId:', camaraId);
console.log('====================================\n');

// E em cada iteração do loop:
console.log(`\n--- Iteração ${iterations} ---`);
console.log('finish_reason:', choice.finish_reason);
if (choice.message.tool_calls) {
  choice.message.tool_calls.forEach(tc => {
    console.log(`  → Tool: ${tc.function.name}`);
    console.log(`  → Args: ${tc.function.arguments}`);
  });
}
```

Isso vai mostrar exatamente o que o agente está pensando em cada pergunta.
