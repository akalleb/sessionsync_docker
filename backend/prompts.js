const buildCabecalhoPrompt = (src) => {
    const exemplo =
        'ATA DA 1ª REUNIÃO DO 1º PERÍODO DA 1ª SESSÃO LEGISLATIVA DA 21ª LEGISLATURA ' +
        'DA CÂMARA MUNICIPAL DE ANGICOS/RN, REALIZADA NO DIA 10 DE OUTUBRO DE 2023.\n' +
        'SOB A PRESIDÊNCIA DOS SENHORES VEREADORES: MARCOS ANTONIO CRUZ ARAÚJO, JOSÉ MARIO SOARES FILHO.\n' +
        'ÀS 10:00, PRESENTES OS SENHORES VEREADORES: LISTA COMPLETA DE PRESENTES. CONSULTADO O LIVRO DE PRESENÇA DOS SENHORES VEREADORES, QUE ACUSA O COMPARECIMENTO DE 7 VEREADORES, FOI ABERTA A SESSÃO. (Ausentes: LISTA DE AUSENTES).';

    return `Gere o parágrafo de cabeçalho da ATA FINAL do bloco "Cabeçalho".
Texto 100% formal, em português, sem resumir nem cortar informações relevantes.

Use o seguinte exemplo apenas como referência de estilo e estrutura, mas NÃO copie literalmente:

${exemplo}

Regras:
- Use CAIXA ALTA onde for usual em atas (ATA, CÂMARA MUNICIPAL, SENHOR PRESIDENTE, etc.).
- Preencha data, hora, nomes, quantidades e ausentes apenas se essas informações estiverem presentes no texto-fonte.
- Se alguma informação não existir no texto-fonte, omita essa parte em vez de inventar dados ou usar marcadores.
- Produza um texto único e contínuo, pronto para ser usado diretamente como cabeçalho da ata.

RETORNE SOMENTE JSON VÁLIDO no formato:
{"texto": "..."}

TEXTO-FONTE (linha base local):
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildAberturaPrompt = (src) => {
    return `Condense o bloco "Abertura" em uma lista numerada formal.
Estrutura desejada:
1. O SENHOR PRESIDENTE PROCEDE À CHAMADA NOMINAL DOS SENHORES VEREADORES PRESENTES.
2. O SENHOR PRESIDENTE CONVOCA O SENHOR 1º SECRETÁRIO A PROCEDER À LEITURA DO EXPEDIENTE.
3. O SENHOR PRESIDENTE DETERMINA O SENHOR 2º SECRETÁRIO A PROCEDER À LEITURA DA ATA DA SESSÃO ANTERIOR. A ata da [X]ª Reunião, realizada em [Data], foi submetida a votação e [Resultado].

Ajuste conforme o que realmente aconteceu no texto fonte. Mantenha o tom formal e impessoal.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildExpedientePrompt = (src) => {
    return `Gere uma lista das matérias do "Expediente".
Formato desejado:
    • [Tipo] Nº [Número]/[Ano]: [Ementa/Resumo]. (Autor: [Nome]).
        ◦ Pareceres Favoráveis: [Comissão] (Rel. [Nome]) e [Comissão] (Rel. [Nome]). (Se houver)

Regras:
- Use "• " para o item principal.
- Use "    ◦ " (com recuo) para Pareceres ou detalhes secundários importantes.
- Mantenha a autoria entre parênteses.
- Seja preciso nos números e nomes.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE (limpo de rótulos de participante):
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildPronunciamentosPrompt = (src) => {
    return `Para CADA VEREADOR que fez uso da palavra, gere um resumo EXTENSO e DETALHADO.
Formato OBRIGATÓRIO:
    • O VEREADOR [NOME] fez uso da palavra para:
        ◦ [Tópico 1 - Ação, agradecimento, cobrança, opinião, etc. - COM DETALHES COMPLETOS]
        ◦ [Tópico 2]
        ◦ [Tópico 3]

Regras CRÍTICAS (A VIOLAÇÃO PREJUDICA O REGISTRO):
- Use "• " para o nome do vereador (Caixa Alta).
- Use "        ◦ " (recuo) para os tópicos do discurso.
- SEJA EXAUSTIVO: Inclua TODOS os valores, nomes de ruas, bairros, pessoas citadas, obras e solicitações específicas.
- NÃO OMITE NENHUMA INFORMAÇÃO: O objetivo é documentar tudo o que foi dito, não apenas um resumo vago.
- APARTES SÃO CRICIAIS: Se houver interrupção ou aparte, DEVE ser registrado explicitamente como:
  "        ◦ APARTE DO VEREADOR [NOME]: [Conteúdo detalhado do aparte]".
- Se o discurso for longo, gere quantos tópicos forem necessários para cobrir todo o conteúdo. Não simplifique demais.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "...", "apartes": [{"autor":"...","conteudo":"..."}]}

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildOrdemDiaPrompt = (src) => {
    return `Liste DETALHADAMENTE os destaques, votações e despachos da "Ordem do Dia".
Se houver falas de vereadores (discussão de matérias, justificativa de voto, questões de ordem), use o formato:
    • O VEREADOR [NOME] destacou/discutiu [Matéria/Assunto]:
      ◦ [Argumentos e posicionamento detalhados]
      ◦ [Outros pontos levantados]
      (Se houver aparte: "   ◦ APARTE DO VEREADOR [Nome]: [Conteúdo]")

Se houver despachos de projetos para comissões:
Despachos na Ordem do Dia:
O [Matéria] foi despachado para:
    1. [Comissão A].
    2. [Comissão B].

Use APENAS o bloco-fonte. NÃO OMITE AS DISCUSSÕES, DÚVIDAS E DEBATES DOS VEREADORES.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildDiscussaoPautaPrompt = (src) => {
    return `Relate DETALHADAMENTE a Discussão da Pauta (se houver seção específica).
Se houver falas individuais, siga o padrão ESTRITO de Pronunciamentos (não omita nada):
    • O VEREADOR [NOME] argumentou que...
      ◦ [Detalhes dos argumentos]
      ◦ [Apartes recebidos: "APARTE DO VEREADOR..."]

Ou texto corrido se for uma discussão geral, mas SEMPRE citando quem falou o quê.
Se estiver vazio ou incluso na Ordem do Dia, retorne texto vazio ou breve resumo.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildVotacoesPrompt = (src) => {
    return `Gere a lista de Votações em formato narrativo formal (Caixa Alta para o comando do Presidente).
Formato:
    • O SENHOR PRESIDENTE SUBMETE EM ÚNICA VOTAÇÃO O [TIPO] Nº [NÚMERO]/[ANO] ([Assunto Resumido]), [RESULTADO] ([Placar Detalhado]).

Exemplos de Resultado/Placar:
- APROVADO POR UNANIMIDADE DE VOTOS (7 votos favoráveis).
- APROVADO POR MAIORIA DE VOTOS (6 votos favoráveis e 1 abstenção do Vereador [Nome]).
- REJEITADO (...).

SE ALGUM VEREADOR JUSTIFICAR O VOTO (fala breve durante a votação):
    ◦ O Vereador [Nome] justificou seu voto dizendo que...

Liste todas as matérias votadas. NÃO OMITE o placar nem justificativas.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildEncerramentoPrompt = (src) => {
    return `Gere o parágrafo de encerramento em Caixa Alta.
Formato:
NÃO HAVENDO MAIS NADA A DELIBERAR, O SENHOR PRESIDENTE ENCERRA A SESSÃO E CONVOCA A PRÓXIMA PARA O DIA [DATA], NO HORÁRIO REGIMENTAL. (Ou conforme transcrição).

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildOrdemDiaItemPrompt = (src) => {
    return `Resuma este item específico da Ordem do Dia de forma detalhada.
Inclua:
- Tipo e número da matéria (Projeto de Lei, Requerimento, etc.)
- Ementa/assunto
- Autor(a)
- Discussão relevante (quem falou e o que disse)
- Resultado da votação (se houve)

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildApartesPrompt = (src) => {
    return `Registre DETALHADAMENTE os apartes (interrupções) ocorridos neste trecho.
Formato OBRIGATÓRIO:
    • APARTE DO VEREADOR [NOME]:
        ◦ [Conteúdo detalhado do aparte]
        ◦ [Resposta do orador original, se houver]

Regras:
- Cite TODOS os apartes na ordem em que ocorreram.
- Inclua quem foi interrompido e o contexto da interrupção.
- Mantenha o tom formal.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const buildIntervaloPrompt = (src) => {
    return `Registre a suspensão/intervalo da sessão.
Inclua: motivo da suspensão, horário (se informado), e horário de retomada dos trabalhos.
Seja breve e formal.

RETORNE SOMENTE JSON VÁLIDO: {"texto": "..."}.

BLOCO-FONTE:
${src || ''}

INSTRUÇÕES DO USUÁRIO:
`;
};

const PROMPTS = {
    // Legacy / existing types
    cabecalho: buildCabecalhoPrompt,
    abertura: buildAberturaPrompt,
    expediente: buildExpedientePrompt,
    ordem_dia: buildOrdemDiaPrompt,
    discussao: buildDiscussaoPautaPrompt,
    votacao: buildVotacoesPrompt,
    explicacoes_pessoais: buildPronunciamentosPrompt,
    comunicacoes: buildPronunciamentosPrompt,
    encerramento: buildEncerramentoPrompt,
    verificacao_quorum: buildAberturaPrompt,
    leitura_ata: buildAberturaPrompt,
    // New types (aliases mapping to existing or new builders)
    pequeno_expediente: buildExpedientePrompt,
    grande_expediente: buildPronunciamentosPrompt,
    ordem_dia_item: buildOrdemDiaItemPrompt,
    apartes: buildApartesPrompt,
    intervalo: buildIntervaloPrompt,
    // Fallback
    default: (src) => `Resuma o seguinte texto de uma sessão parlamentar. 
                Seja conciso, capture os pontos principais, decisões e nomes citados.
                Mantenha um tom formal.
                
                Texto: "${src}"`
};

module.exports = {
    PROMPTS,
    buildCabecalhoPrompt,
    buildAberturaPrompt,
    buildExpedientePrompt,
    buildOrdemDiaPrompt,
    buildDiscussaoPautaPrompt,
    buildVotacoesPrompt,
    buildPronunciamentosPrompt,
    buildEncerramentoPrompt,
    buildOrdemDiaItemPrompt,
    buildApartesPrompt,
    buildIntervaloPrompt
};
