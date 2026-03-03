export type SessionType = 'ordinaria' | 'extraordinaria' | 'solene';

export interface TranscriptionBlock {
  id: string;
  type: BlockType;
  title: string;
  content: string;
  summary?: string;
  timestamp?: string;
  timestamp_ms?: number;
  timestamp_estimated?: boolean;
  speaker?: string;
  order: number;
}

export type BlockType =
  // Sessão
  | 'abertura'
  | 'encerramento'
  | 'intervalo'
  | 'verificacao_quorum' // Mantido para retrocompatibilidade
  // Expediente
  | 'pequeno_expediente'
  | 'grande_expediente'
  | 'expediente' // Mantido
  | 'leitura_ata' // Mantido
  // Deliberações
  | 'ordem_dia'
  | 'ordem_dia_item'
  | 'votacao'
  | 'apartes'
  | 'discussao' // Mantido
  // Pronunciamentos
  | 'explicacoes_pessoais'
  | 'comunicacoes'
  // Outros
  | 'outros'
  | 'cabecalho'; // Mantido

export const blockTypeLabels: Record<BlockType, string> = {
  abertura: 'Abertura',
  encerramento: 'Encerramento',
  intervalo: 'Intervalo',
  verificacao_quorum: 'Verificação de Quórum',
  pequeno_expediente: 'Pequeno Expediente',
  grande_expediente: 'Grande Expediente',
  expediente: 'Expediente',
  leitura_ata: 'Leitura da Ata Anterior',
  ordem_dia: 'Ordem do Dia',
  ordem_dia_item: 'Ordem do Dia (Item)',
  votacao: 'Votação',
  apartes: 'Apartes',
  discussao: 'Discussão',
  explicacoes_pessoais: 'Explicações Pessoais',
  comunicacoes: 'Comunicações',
  outros: 'Outros',
  cabecalho: 'Cabeçalho',
};

export interface BlockTypeCategory {
  label: string;
  types: BlockType[];
}

export const blockTypeCategories: BlockTypeCategory[] = [
  {
    label: 'Sessão',
    types: ['abertura', 'verificacao_quorum', 'leitura_ata', 'intervalo', 'encerramento'],
  },
  {
    label: 'Expediente',
    types: ['pequeno_expediente', 'grande_expediente', 'expediente'],
  },
  {
    label: 'Deliberações',
    types: ['ordem_dia', 'ordem_dia_item', 'discussao', 'votacao', 'apartes'],
  },
  {
    label: 'Pronunciamentos',
    types: ['explicacoes_pessoais', 'comunicacoes'],
  },
  {
    label: 'Outros',
    types: ['outros', 'cabecalho'],
  },
];

export const sessionTypeLabels: Record<SessionType, string> = {
  ordinaria: 'Ordinária',
  extraordinaria: 'Extraordinária',
  solene: 'Solene',
};

export interface Session {
  id: string;
  title: string;
  date: string;
  status: 'pending' | 'transcribing' | 'organizing' | 'reviewing' | 'completed';
  camaraId?: string;
  camaraName?: string;
  duration?: string;
  audioUrl?: string;
  youtubeUrl?: string;
  blocks: TranscriptionBlock[];
  finalMinutes?: string;
  createdAt: string;
  updatedAt: string;
}

export type UploadMethod = 'file' | 'youtube';
