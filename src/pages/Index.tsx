import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentSessions } from '@/components/dashboard/RecentSessions';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { SmartAgenda } from '@/components/dashboard/SmartAgenda';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useRecentSessions } from '@/hooks/use-recent-sessions';
import { FileText, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
 
export default function Dashboard() {
  const { totalSessions, transcribedHours, publishedMinutes, averageTime } = useDashboardStats();
  const { sessions: recentSessions, loading: loadingSessions } = useRecentSessions(5);

  const stats = [
    {
      title: 'Total de Sessões',
      value: totalSessions,
      subtitle: 'Registradas',
      icon: FileText,
      trend: { value: 12, positive: true },
    },
    {
      title: 'Horas Transcritas',
      value: `${transcribedHours}h`,
      subtitle: 'Total acumulado',
      icon: Clock,
      trend: { value: 8, positive: true },
    },
    {
      title: 'Sessões Concluídas',
      value: publishedMinutes,
      subtitle: 'Processadas',
      icon: CheckCircle2,
      trend: { value: 15, positive: true },
    },
    {
      title: 'Tempo Médio',
      value: averageTime,
      subtitle: 'Por sessão',
      icon: TrendingUp,
      trend: { value: 20, positive: true },
    },
  ];

  return (
    <MainLayout>
      <div className="flex-1 space-y-8 p-8 pt-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <div key={stat.title} className="animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
              <StatsCard {...stat} />
            </div>
          ))}
        </div>

        {/* Smart Agenda */}
        <div className="animate-slide-up" style={{ animationDelay: '300ms' }}>
          <SmartAgenda />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 animate-slide-up" style={{ animationDelay: '400ms' }}>
            <RecentSessions sessions={recentSessions} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: '500ms' }}>
            <QuickActions />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
