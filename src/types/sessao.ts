export interface Sessao {
  id: string;
  camara_id?: string;
  titulo: string;
  tipo: 'ordinaria' | 'extraordinaria' | 'solene' | 'audiencia';
  data_sessao: string;
  hora_inicio?: string;
  hora_fim?: string;
  status: 'agendada' | 'em_andamento' | 'pausada' | 'encerrada';
  fase_atual:
    | 'abertura'
    | 'expediente'
    | 'ordem_do_dia'
    | 'tribuna_livre'
    | 'tribuna_livre_2'
    | 'votacao'
    | 'encerramento';
  item_atual?: string;
  created_at: string;
  updated_at: string;
  camara?: {
    nome: string;
    logo_url: string;
  };
}

export interface SessaoPresenca {
  id: string;
  sessao_id: string;
  vereador_id: string;
  presente: boolean;
  hora_chegada?: string;
  hora_saida?: string;
  justificativa?: string;
  created_at: string;
  vereador?: {
    id: string;
    nome: string;
    nome_parlamentar?: string;
    cargo_mesa?: string | null;
    foto_url?: string;
    partido?: {
      sigla: string;
      cor?: string;
    };
  };
}

export interface Votacao {
  id: string;
  sessao_id: string;
  titulo: string;
  descricao?: string;
  tipo: 'simples' | 'nominal' | 'secreta';
  status: 'pendente' | 'em_andamento' | 'encerrada';
  resultado?: 'aprovada' | 'rejeitada' | 'empate';
  votos_favor: number;
  votos_contra: number;
  abstencoes: number;
  created_at: string;
  encerrada_at?: string;
}

export interface Voto {
  id: string;
  votacao_id: string;
  vereador_id: string;
  voto: 'favor' | 'contra' | 'abstencao';
  registrado_por?: string;
  created_at: string;
  vereador?: {
    id: string;
    nome: string;
    nome_parlamentar?: string;
    foto_url?: string;
    partido?: {
      sigla: string;
      cor?: string;
    };
  };
}

export interface SessaoPauta {
  id: string;
  sessao_id: string;
  fase: 'abertura' | 'expediente' | 'ordem_do_dia' | 'tribuna_livre' | 'tribuna_livre_2';
  ordem: number;
  titulo: string;
  descricao?: string;
  tipo?: string;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'adiado';
  tempo_previsto?: number;
  tempo_utilizado: number;
  created_at: string;
}

export interface TempoFala {
  id: string;
  sessao_id: string;
  vereador_id: string;
  item_pauta_id?: string;
  tipo: 'discussao' | 'aparte' | 'ordem' | 'tribuna' | 'pequeno_expediente' | 'grande_expediente';
  tempo_concedido: number;
  tempo_utilizado: number;
  inicio?: string;
  fim?: string;
  created_at: string;
  vereador?: {
    id: string;
    nome: string;
    nome_parlamentar?: string;
    foto_url?: string;
    partido?: {
      sigla: string;
      cor?: string;
    };
  };
}

export interface SolicitacaoFala {
  id: string;
  sessao_id: string;
  vereador_id: string;
  tipo: 'discussao' | 'aparte' | 'ordem' | 'tribuna' | 'pequeno_expediente' | 'grande_expediente';
  status: 'pendente' | 'atendida' | 'cancelada';
  created_at: string;
  vereador?: {
    id: string;
    nome: string;
    nome_parlamentar?: string;
    foto_url?: string;
    partido?: {
      sigla: string;
      cor?: string;
    };
  };
}

export interface SessaoManchete {
  id: string;
  sessao_id: string;
  texto: string;
  ativa: boolean;
  ordem: number;
  created_at: string;
}

export const FASES_SESSAO = [
  { id: 'abertura', nome: 'Abertura', icone: 'PlayCircle' },
  { id: 'expediente', nome: 'Expediente', icone: 'FileText' },
  { id: 'tribuna_livre', nome: 'Tribuna Livre', icone: 'Mic' },
  { id: 'ordem_do_dia', nome: 'Ordem do Dia', icone: 'ListOrdered' },
  { id: 'tribuna_livre_2', nome: 'Tribuna Livre', icone: 'Mic' },
  { id: 'votacao', nome: 'Votação', icone: 'Vote' },
  { id: 'encerramento', nome: 'Encerramento', icone: 'CheckCircle2' },
] as const;

export const TIPOS_SESSAO = [
  { id: 'ordinaria', nome: 'Ordinária' },
  { id: 'extraordinaria', nome: 'Extraordinária' },
  { id: 'solene', nome: 'Solene' },
  { id: 'audiencia', nome: 'Audiência Pública' },
] as const;
