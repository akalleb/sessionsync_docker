export interface TranscriptionBlock {
  id: string;
  type: BlockType;
  title: string;
  content: string;
  summary?: string;
  timestamp?: string;
  speaker?: string;
  order: number;
}

export type BlockType = 
  | 'cabecalho'
  | 'abertura'
  | 'verificacao_quorum'
  | 'leitura_ata'
  | 'expediente'
  | 'ordem_dia'
  | 'discussao'
  | 'votacao'
  | 'explicacoes_pessoais'
  | 'comunicacoes'
  | 'encerramento'
  | 'outros';

export const blockTypeLabels: Record<BlockType, string> = {
  cabecalho: 'Cabeçalho',
  abertura: 'Abertura e Expediente Inicial',
  verificacao_quorum: 'Verificação de Quórum',
  leitura_ata: 'Leitura da Ata Anterior',
  expediente: 'Expediente',
  ordem_dia: 'Ordem do Dia',
  discussao: 'Discussão',
  votacao: 'Votação',
  explicacoes_pessoais: 'Explicações Pessoais',
  comunicacoes: 'Comunicações',
  encerramento: 'Encerramento',
  outros: 'Outros',
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
