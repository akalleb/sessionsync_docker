import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { agendaService } from '@/services/agendaService';
import { AgendaEvent, CreateAgendaEventDTO } from '@/types/agenda';
import { toast } from 'sonner';
import { differenceInDays, isAfter, isBefore, addDays } from 'date-fns';

export interface SmartAlert {
  id: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'sanction' | 'budget' | 'deadline';
}

export function useSmartAgenda() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!profile?.camara_id) return;
    try {
      setLoading(true);
      const data = await agendaService.listEvents(profile.camara_id);
      setEvents(data);
      generateAlerts(data);
    } catch (error) {
      console.error('Failed to fetch agenda events', error);
      toast.error('Erro ao carregar agenda');
    } finally {
      setLoading(false);
    }
  }, [profile?.camara_id]);

  const generateAlerts = (currentEvents: AgendaEvent[]) => {
    const newAlerts: SmartAlert[] = [];
    const today = new Date();

    // 1. Sanção Tácita Logic
    // Find pending sanctions that are overdue or due soon
    const sanctions = currentEvents.filter(e => e.event_type === 'sanction' && e.status === 'pending');
    
    sanctions.forEach(sanction => {
      const deadline = new Date(sanction.event_date);
      if (isAfter(today, deadline)) {
        newAlerts.push({
          id: `alert-${sanction.id}`,
          title: '⚠️ Sanção Tácita - PRAZO EXPIRADO',
          message: `O prazo do Prefeito para o item "${sanction.title}" expirou. O Sr. Presidente tem a obrigação constitucional de promulgar esta lei em 48h.`,
          severity: 'critical',
          type: 'sanction'
        });
      } else if (differenceInDays(deadline, today) <= 3) {
        newAlerts.push({
          id: `alert-warn-${sanction.id}`,
          title: 'Sanção Tácita - Prazo Próximo',
          message: `Faltam ${differenceInDays(deadline, today)} dias para o fim do prazo de sanção de "${sanction.title}".`,
          severity: 'high',
          type: 'sanction'
        });
      }
    });

    // 2. Budget Calendar (LDO/LOA) Logic
    // Brazilian Standard: LDO deadline usually mid-July (before recess).
    // Let's assume July 17th is the deadline for LDO vote to allow recess.
    const currentYear = today.getFullYear();
    const ldoDeadline = new Date(currentYear, 6, 17); // Month is 0-indexed: 6 = July
    const daysToLdoDeadline = differenceInDays(ldoDeadline, today);

    // Check if LDO is voted
    const ldoVoted = currentEvents.some(
      e => (e.title.toUpperCase().includes('LDO') || e.event_type === 'budget') 
           && e.status === 'completed' 
           && new Date(e.event_date).getFullYear() === currentYear
    );

    if (!ldoVoted && daysToLdoDeadline <= 30 && daysToLdoDeadline >= 0) {
       // Warning window: 30 days before deadline
       const severity = daysToLdoDeadline <= 10 ? 'critical' : 'medium';
       newAlerts.push({
         id: 'alert-ldo',
         title: 'Calendário Orçamentário - LDO',
         message: `Faltam ${daysToLdoDeadline} dias para o recesso. A LDO ainda não foi votada. O recesso parlamentar está bloqueado até a votação.`,
         severity: severity,
         type: 'budget'
       });
    }

    setAlerts(newAlerts);
  };

  const addEvent = async (event: CreateAgendaEventDTO) => {
    if (!profile?.camara_id) return;
    try {
      const newEvent = await agendaService.createEvent(event, profile.camara_id);
      setEvents(prev => [...prev, newEvent]);
      generateAlerts([...events, newEvent]);
      toast.success('Evento adicionado');
      return newEvent;
    } catch (error) {
      console.error(error);
      toast.error('Erro ao adicionar evento');
      throw error;
    }
  };

  const completeEvent = async (id: string) => {
    try {
      await agendaService.updateEventStatus(id, 'completed');
      setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'completed' } : e));
      // Re-generate alerts to remove resolved ones
      generateAlerts(events.map(e => e.id === id ? { ...e, status: 'completed' } : e));
      toast.success('Evento marcado como concluído');
    } catch (error) {
        toast.error('Erro ao atualizar evento');
    }
  };

  const deleteEvent = async (id: string) => {
      try {
          await agendaService.deleteEvent(id);
          const newEvents = events.filter(e => e.id !== id);
          setEvents(newEvents);
          generateAlerts(newEvents);
          toast.success('Evento removido');
      } catch (error) {
          toast.error('Erro ao remover evento');
      }
  }

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    alerts,
    loading,
    addEvent,
    completeEvent,
    deleteEvent,
    refresh: fetchEvents
  };
}
