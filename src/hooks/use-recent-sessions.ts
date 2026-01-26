import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Session, TranscriptionBlock } from '@/types/transcription';

export function useRecentSessions(limit = 5) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      if (!profile?.camara_id) {
          setLoading(false);
          return;
      }

      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('camara_id', profile.camara_id)
          .order('date', { ascending: false })
          .limit(limit);

        if (error) throw error;

        // Map database result to Session type
        const mappedSessions: Session[] = (data || []).map(s => ({
          id: s.id,
          title: s.title,
          date: s.date, // Assuming date is stored as YYYY-MM-DD or similar string compatible
          status: s.status as Session['status'],
          camaraId: s.camara_id || undefined,
          duration: s.duration || undefined,
          audioUrl: s.audio_url || undefined,
          youtubeUrl: s.youtube_url || undefined,
          blocks: (s.blocks as unknown as TranscriptionBlock[]) || [],
          finalMinutes: s.final_minutes || undefined,
          createdAt: s.created_at,
          updatedAt: s.updated_at
        }));

        setSessions(mappedSessions);
      } catch (error) {
        console.error('Error fetching recent sessions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [profile?.camara_id, limit]);

  return { sessions, loading };
}
