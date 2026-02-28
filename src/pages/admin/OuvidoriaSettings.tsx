import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Save, BookOpen, Settings } from 'lucide-react';
import { apiCall } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useNavigate } from 'react-router-dom';

export default function OuvidoriaSettings() {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [conteudo, setConteudo] = useState('');

    useEffect(() => {
        fetchKnowledgeBase();
    }, [profile]);

    const fetchKnowledgeBase = async () => {
        if (!profile?.camara_id) return;
        try {
            setFetching(true);
            // Faremos uma chamada para buscar o conhcimento base da camara logada
            const resp = await apiCall(`/ouvidoria/knowledge-base?camara_id=${profile.camara_id}`, undefined, 'GET');
            if (resp?.success && resp.data) {
                setConteudo(resp.data.conteudo || '');
            }
        } catch (error) {
            console.error('Failed to fetch knowledge base:', error);
        } finally {
            setFetching(false);
        }
    };

    const handleSave = async () => {
        if (!profile?.camara_id) return;
        setLoading(true);
        try {
            const resp = await apiCall('/ouvidoria/knowledge-base', {
                camara_id: profile.camara_id,
                conteudo: conteudo
            }, 'POST');

            if (resp?.success) {
                toast.success('Base de conhecimento salva com sucesso!');
            } else {
                toast.error('Ocorreu um erro ao salvar a base de conhecimento.');
            }
        } catch (error) {
            console.error('Error saving knowledge base:', error);
            toast.error('Erro ao conectar com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <Settings className="w-6 h-6" />
                            Configurações da Ouvidoria (IA)
                        </h1>
                        <p className="text-muted-foreground">
                            Gerencie a base de conhecimento utilizada pelo Assistente Virtual no WhatsApp.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/admin/ouvidoria')}>
                        Voltar para Ouvidoria
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            Base de Conhecimento Institucional
                        </CardTitle>
                        <CardDescription>
                            Insira abaixo as informações que o Assistente de IA usará para responder dúvidas dos cidadãos.
                            Inclua horários de funcionamento, nomes e contatos úteis, regras para envio de manifestações e links.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fetching ? (
                            <div className="h-64 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Textarea
                                    value={conteudo}
                                    onChange={(e) => setConteudo(e.target.value)}
                                    placeholder="Ex: A Câmara Municipal funciona de segunda a sexta, das 08h às 17h. Para registrar um ofício, é necessário vir presencialmente portando o RG..."
                                    className="min-h-[300px] font-mono text-sm"
                                />

                                <div className="bg-muted p-4 rounded-md text-sm border">
                                    <strong>Dicas para a IA:</strong>
                                    <ul className="list-disc ml-5 mt-2 space-y-1 text-muted-foreground">
                                        <li>Seja direto e claro (ex: "Vereador X: (11) 9999-9999").</li>
                                        <li>O modelo lerá todo esse texto antes de responder o usuário no WhatsApp.</li>
                                        <li>Não insira dados sigilosos, pois a IA pode repassá-los se perguntada.</li>
                                    </ul>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button onClick={handleSave} disabled={loading || fetching}>
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" />
                                                Salvar Base de Conhecimento
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}
