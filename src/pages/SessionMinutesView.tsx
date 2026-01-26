import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type SessionMinutesData = {
  title: string;
  date: string;
  final_minutes: string | null;
};

export default function SessionMinutesView() {
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<SessionMinutesData | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('sessions')
          .select('title, date, final_minutes')
          .eq('id', id)
          .single();
        if (error) throw error;
        setSession(data);
      } catch (e) {
        toast.error('Erro ao carregar ata da sessão');
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  return (
    <MainLayout>
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="px-8 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/sessions">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Ata da Sessão
              </h1>
              <p className="text-sm text-muted-foreground">
                Visualização somente leitura
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !session ? (
            <div className="max-w-4xl mx-auto">
              <Card className="p-6">
                <p className="text-sm text-muted-foreground">
                  Não foi possível carregar a ata.
                </p>
              </Card>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              <Card className="p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold text-foreground">{session.title}</h2>
                  <p className="text-sm text-muted-foreground">{new Date(session.date).toLocaleDateString()}</p>
                </div>
              </Card>

              <Card className="p-6">
                {session.final_minutes ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{session.final_minutes}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta sessão ainda não possui ata final gerada.
                  </p>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
