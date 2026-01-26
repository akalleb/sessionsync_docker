export type AgendaEventType = 'meeting' | 'deadline' | 'sanction' | 'budget';

export type AgendaEventStatus = 'pending' | 'completed' | 'expired';

export interface AgendaEvent {
  id: string;
  camara_id: string;
  title: string;
  description?: string;
  event_date: string; // ISO string
  event_type: AgendaEventType;
  status: AgendaEventStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAgendaEventDTO {
  title: string;
  description?: string;
  event_date: Date;
  event_type: AgendaEventType;
  metadata?: Record<string, unknown>;
}
