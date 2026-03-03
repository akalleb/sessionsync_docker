
const TOOLS_DEFINITION = [
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
        - "o que o vereador X falou", "o que X disse", "falas de X"
        - Quem discursou mais (use agrupar_por_vereador: true)
        - Discursos em uma sessão específica
        - Quantas vezes um vereador usou a palavra
        - Ranking de participação dos vereadores
        
        PREFIRA esta tool sempre que a pergunta mencionar explicitamente
        um vereador ou vereadora pelo nome.
        Pode ser combinada com listar_sessoes para primeiro encontrar a sessão
        (por data/tipo) e depois buscar os discursos nela.
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
        - Quais vereadores compõem a câmara (lista geral)
        - Vereadores de um partido específico
        - Dados cadastrais de um vereador (nome, partido, cargo)
        
        NÃO use esta tool para saber "o que o vereador X falou"
        ou "em quais sessões X discursou". Para isso, use buscar_discursos.
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

module.exports = { TOOLS_DEFINITION };
