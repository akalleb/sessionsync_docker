import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useDashboardStats() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalSessions: 0,
    transcribedHours: 0,
    publishedMinutes: 0,
    averageTime: '0min'
  });

  useEffect(() => {
    async function fetchStats() {
      if (!profile?.camara_id) return;

      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('status, duration')
        .eq('camara_id', profile.camara_id);

      if (error || !sessions) return;

      const totalSessions = sessions.length;
      // Assuming 'completed' or 'exported' implies published/finished for now, or just check if transcript exists
      const publishedMinutes = sessions.filter(s => s.status === 'completed' || s.status === 'exported').length;
      
      // Parse duration "HH:MM:SS" or similar
      let totalSeconds = 0;
      sessions.forEach(s => {
          if (s.duration) {
              const parts = s.duration.split(':').map(Number);
              if (parts.length === 3) totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
              else if (parts.length === 2) totalSeconds += parts[0] * 60 + parts[1];
          }
      });
      
      const transcribedHours = Math.round(totalSeconds / 3600);

      setStats({
        totalSessions,
        transcribedHours,
        publishedMinutes,
        averageTime: totalSessions > 0 ? `${Math.round(totalSeconds / 60 / totalSessions)}min` : '0min'
      });
    }

    fetchStats();
  }, [profile?.camara_id]);

  return stats;
}
