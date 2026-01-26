import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Phone, MapPin, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface DemoRequest {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  camara_nome: string;
  cidade: string;
  estado: string;
  mensagem: string | null;
  created_at: string;
  status?: 'pending' | 'contacted' | 'rejected'; // Assuming status exists or we default to pending
}

export function DemoRequestsList() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('demo_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching demo requests:', error);
      toast.error('Erro ao carregar solicitações de demo.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: DemoRequest['status']) => {
    // This assumes there is a 'status' column. If not, this might fail or need a schema update.
    // For now, we'll try to update it. If it fails, we catch it.
    try {
      const { error } = await supabase
        .from('demo_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
          // If column doesn't exist, we might just simulate it locally or warn
          console.warn("Status update might have failed if column doesn't exist", error);
          if (error.code === '42703') { // Undefined column
             toast.error("Coluna 'status' não existe na tabela.");
             return;
          }
          throw error;
      }

      setRequests(prev =>
        prev.map(req =>
          req.id === id ? { ...req, status: newStatus } : req
        )
      );
      toast.success('Status atualizado!');
    } catch (error) {
      toast.error('Erro ao atualizar status.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Solicitações de Demonstração
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma solicitação encontrada.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome / Contato</TableHead>
                  <TableHead>Câmara / Local</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{request.nome}</div>
                      <div className="flex flex-col text-xs text-muted-foreground gap-1 mt-1">
                        <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {request.email}
                        </div>
                        {request.telefone && (
                            <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {request.telefone}
                            </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{request.camara_nome}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3" /> {request.cidade} - {request.estado}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate text-sm" title={request.mensagem || ''}>
                        {request.mensagem || <span className="italic text-muted-foreground">Sem mensagem</span>}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => window.location.href = `mailto:${request.email}`}>
                                <Mail className="h-4 w-4" />
                            </Button>
                             {request.telefone && (
                                <Button variant="outline" size="sm" onClick={() => window.open(`https://wa.me/55${request.telefone.replace(/\D/g, '')}`, '_blank')}>
                                    <Phone className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
