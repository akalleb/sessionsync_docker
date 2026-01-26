import React, { useState } from 'react';
import { useSmartAgenda, SmartAlert } from '@/hooks/use-smart-agenda';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Calendar as CalendarIcon, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { CreateAgendaEventDTO, AgendaEventType } from '@/types/agenda';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function SmartAgenda() {
  const { events, alerts, loading, addEvent, completeEvent, deleteEvent } = useSmartAgenda();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<CreateAgendaEventDTO>>({
    event_type: 'meeting',
    title: '',
    description: ''
  });

  const handleAddEvent = async () => {
    if (!newEvent.title || !date || !newEvent.event_type) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    try {
      await addEvent({
        title: newEvent.title,
        description: newEvent.description,
        event_date: date,
        event_type: newEvent.event_type as AgendaEventType
      });
      setIsDialogOpen(false);
      setNewEvent({ event_type: 'meeting', title: '', description: '' });
    } catch (e) {
      // handled in hook
    }
  };

  const getSeverityColor = (severity: SmartAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const selectedDateEvents = events.filter(e => 
    date && new Date(e.event_date).toDateString() === date.toDateString()
  );

  const upcomingEvents = events
    .filter(e => e.status === 'pending' && new Date(e.event_date) >= new Date())
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <div key={alert.id} className={cn("p-4 rounded-lg border flex items-start gap-3", getSeverityColor(alert.severity))}>
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold">{alert.title}</h4>
                <p className="text-sm opacity-90">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Calendar Column (Maior) */}
        <div className="md:col-span-8">
          <Card className="h-full border shadow-sm">
            <CardHeader className="py-4 px-6 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Calendário Legislativo</CardTitle>
                    <CardDescription className="text-xs">
                        Prazos e sessões.
                    </CardDescription>
                  </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex justify-center items-start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                locale={ptBR}
                className="rounded-md w-full max-w-2xl"
                classNames={{
                  months: "w-full flex flex-col",
                  month: "space-y-3 w-full",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full justify-between mb-2",
                  head_cell: "text-muted-foreground rounded-md w-full font-normal text-[0.8rem]",
                  row: "flex w-full mt-1 justify-between gap-1",
                  cell: "h-10 w-full text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-10 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md flex items-center justify-center text-sm transition-all hover:scale-105",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground shadow-md",
                  day_today: "bg-accent/50 text-accent-foreground font-semibold border border-primary/20",
                  day_outside: "text-muted-foreground opacity-30",
                  day_disabled: "text-muted-foreground opacity-50",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                  caption: "flex justify-center pt-1 relative items-center text-base font-semibold mb-4 text-primary",
                  nav_button: "border hover:bg-accent hover:text-accent-foreground rounded-md h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                }}
                modifiers={{
                    hasEvent: (date) => events.some(e => new Date(e.event_date).toDateString() === date.toDateString())
                }}
                modifiersStyles={{
                    hasEvent: { fontWeight: '900', color: 'var(--primary)', position: 'relative' }
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Details Column (Menor) */}
        <div className="md:col-span-4">
          <Card className="h-[450px] flex flex-col border shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-medium">Agenda do Dia</CardTitle>
                <CardDescription className="text-xs">
                  {date ? format(date, "d 'de' MMMM", { locale: ptBR }) : 'Hoje'}
                </CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="outline" className="h-7 w-7 rounded-full shadow-sm">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Adicionar Evento</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Título</Label>
                      <Input 
                        placeholder="Ex: Reunião de Comissão" 
                        value={newEvent.title}
                        onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select 
                        value={newEvent.event_type} 
                        onValueChange={v => setNewEvent({...newEvent, event_type: v as AgendaEventType})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting">Reunião</SelectItem>
                          <SelectItem value="deadline">Prazo Geral</SelectItem>
                          <SelectItem value="sanction">Prazo de Sanção (Prefeito)</SelectItem>
                          <SelectItem value="budget">Orçamento (LDO/LOA)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição (Opcional)</Label>
                      <Textarea 
                        placeholder="Detalhes adicionais..."
                        value={newEvent.description}
                        onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                      />
                    </div>
                    <Button className="w-full" onClick={handleAddEvent}>Salvar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-3 space-y-3 custom-scrollbar">
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground flex flex-col items-center justify-center h-full opacity-60">
                  <CalendarIcon className="w-8 h-8 mb-2" />
                  <p className="text-sm">Sem eventos.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map(event => (
                    <div key={event.id} className="group flex flex-col gap-1 p-3 rounded-md border bg-card hover:bg-accent/5 transition-all shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5 min-w-0">
                          <h4 className={cn("font-medium text-sm leading-tight truncate pr-2", event.status === 'completed' && "line-through text-muted-foreground")}>
                            {event.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 rounded">
                              {format(new Date(event.event_date), "HH:mm")}
                            </span>
                            {event.event_type === 'sanction' && <Badge variant="destructive" className="text-[9px] h-4 px-1 py-0">Sanção</Badge>}
                            {event.event_type === 'budget' && <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0">LDO</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {event.status !== 'completed' && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-green-50 hover:text-green-600" onClick={() => completeEvent(event.id)} title="Concluir">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-50 hover:text-red-600" onClick={() => deleteEvent(event.id)} title="Remover">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                      </div>
                      
                      {event.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 pl-1 border-l-2 border-muted">
                          {event.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            
            <div className="p-3 border-t bg-muted/10">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2 px-1">Próximos</p>
                <div className="space-y-1">
                {upcomingEvents.slice(0, 2).map(event => (
                  <div key={event.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2 truncate">
                        <div className={cn("w-1.5 h-1.5 rounded-full", event.event_type === 'sanction' ? "bg-red-400" : "bg-primary/60")} />
                        <span className="truncate max-w-[140px]">{event.title}</span>
                    </div>
                    <span className="text-muted-foreground font-mono text-[10px]">{format(new Date(event.event_date), "dd/MM")}</span>
                  </div>
                ))}
                {upcomingEvents.length === 0 && <p className="text-[10px] text-muted-foreground px-2">Nada previsto.</p>}
                </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
