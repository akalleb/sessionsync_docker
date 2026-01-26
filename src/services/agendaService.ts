import { supabase } from "@/integrations/supabase/client";
import { AgendaEvent, CreateAgendaEventDTO } from "@/types/agenda";

const TABLE_NAME = 'agenda_events';

export const agendaService = {
  async listEvents(camaraId: string) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('camara_id', camaraId)
      .order('event_date', { ascending: true });

    if (error) throw error;
    return data as unknown as AgendaEvent[];
  },

  async createEvent(event: CreateAgendaEventDTO, camaraId: string) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        ...event,
        camara_id: camaraId,
        event_date: event.event_date.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data as unknown as AgendaEvent;
  },

  async updateEventStatus(id: string, status: AgendaEvent['status']) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as AgendaEvent;
  },

  async deleteEvent(id: string) {
      const { error } = await supabase
          .from(TABLE_NAME)
          .delete()
          .eq('id', id);
      if (error) throw error;
  }
};
