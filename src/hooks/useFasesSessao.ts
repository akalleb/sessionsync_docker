import { useState, useEffect } from 'react';
import { FASES_SESSAO } from '@/types/sessao';

export interface FaseSessao {
  id: string;
  camara_id: string;
  codigo: string;
  nome: string;
  icone: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export function useFasesSessao(camaraId?: string) {
  const [fases, setFases] = useState<FaseSessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mapped = FASES_SESSAO.map((f, index) => ({
      id: f.id,
      camara_id: '',
      codigo: f.id,
      nome: f.nome,
      icone: f.icone,
      ordem: index + 1,
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    setFases(mapped);
    setError(null);
    setLoading(false);
  }, []);

  return {
    fases,
    loading,
    error,
    refetch: () => {},
    addFase: async (fase: Omit<FaseSessao, 'id' | 'created_at' | 'updated_at'>) => {
      throw new Error('Configuração de rito desativada');
    },
    updateFase: async (id: string, updates: Partial<FaseSessao>) => {
      throw new Error('Configuração de rito desativada');
    },
    deleteFase: async (id: string) => {
      throw new Error('Configuração de rito desativada');
    },
    reorderFases: async (fases: { id: string; ordem: number }[]) => {
      throw new Error('Configuração de rito desativada');
    },
  };
}
