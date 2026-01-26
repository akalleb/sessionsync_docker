import { Link } from 'react-router-dom';
import { Upload, Youtube, FileAudio, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const actions = [
  {
    title: 'Upload de Áudio',
    description: 'Envie um arquivo de áudio MP3, WAV ou M4A',
    icon: FileAudio,
    path: '/upload?method=file',
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Link do YouTube',
    description: 'Transcreva diretamente de uma live ou vídeo',
    icon: Youtube,
    path: '/upload?method=youtube',
    color: 'bg-destructive/10 text-destructive',
  },
  {
    title: 'Importar Sessão',
    description: 'Importe uma sessão anterior para edição',
    icon: Upload,
    path: '/import',
    color: 'bg-success/10 text-success',
  },
  {
    title: 'Gerar com IA',
    description: 'Use IA para resumir e formatar atas',
    icon: Sparkles,
    path: '/ai-assistant',
    color: 'bg-accent/10 text-accent-foreground',
  },
];

export function QuickActions() {
  return (
    <div className="bg-card rounded-xl shadow-card border border-border/50 p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">Ações Rápidas</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <Link
            key={action.path}
            to={action.path}
            className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:shadow-soft transition-all duration-200"
          >
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
              action.color
            )}>
              <action.icon className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
              {action.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {action.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
