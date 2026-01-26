import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileText, Download, Wand2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { apiCall } from '@/lib/utils';
import { saveAs } from 'file-saver';

type ProfileWithCamara = {
  camara?: {
    nome?: string | null;
  } | null;
  camara_id?: string | null;
};

export default function LegislativeFactory() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatedLaw, setGeneratedLaw] = useState<{ text: string; docx: string } | null>(null);

  const [formData, setFormData] = useState({
    type: 'Ordinária',
    object: '', // Ex: Dia do Ciclista
    date: '',   // Ex: 25 de Agosto
    objectives: '', // Ex: Incentivar uso de bicicleta
  });

  const handleGenerate = async () => {
    if (!formData.object || !formData.objectives) {
      toast.error('Preencha o objeto e os objetivos da lei.');
      return;
    }

    setLoading(true);
    const camaraProfile = profile as ProfileWithCamara | null;
    try {
      const data = await apiCall('/generate-law', {
        ...formData,
        camaraCity: camaraProfile?.camara?.nome?.replace('Câmara Municipal de ', '') || 'Município',
        camaraId: camaraProfile?.camara_id ?? null,
      });

      setGeneratedLaw(data);
      setStep(3); // Vai para o passo de review/download
      toast.success('Minuta gerada com sucesso!');
    } catch (error) {
      toast.error('Erro ao gerar lei: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!generatedLaw?.docx) return;
    
    // Convert Base64 to Blob
    const byteCharacters = atob(generatedLaw.docx);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    
    saveAs(blob, `Projeto_Lei_${formData.object.replace(/\s+/g, '_')}.docx`);
  };

  return (
    <MainLayout>
      <div className="flex-1 space-y-8 p-8 pt-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Wand2 className="w-8 h-8 text-primary" />
            Fábrica Legislativa
          </h1>
          <p className="text-muted-foreground mt-2">
            Crie minutas de projetos de lei em segundos usando Inteligência Artificial.
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-between relative mb-8">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary -z-10" />
          {[1, 2, 3].map((s) => (
            <div 
              key={s}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                step >= s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Passo 1: Definição Básica'}
              {step === 2 && 'Passo 2: Detalhes e Justificativa'}
              {step === 3 && 'Passo 3: Revisão e Exportação'}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'O que você deseja criar hoje?'}
              {step === 2 && 'Forneça insumos para a IA escrever a justificativa.'}
              {step === 3 && 'Sua minuta está pronta. Baixe o arquivo editável.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Proposição</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(v) => setFormData({...formData, type: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ordinária">Projeto de Lei Ordinária</SelectItem>
                      <SelectItem value="Complementar">Projeto de Lei Complementar</SelectItem>
                      <SelectItem value="Resolução">Projeto de Resolução</SelectItem>
                      <SelectItem value="Decreto">Decreto Legislativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Objeto da Lei (Título Curto)</Label>
                  <Input 
                    placeholder="Ex: Dia do Ciclista, Programa Menor Aprendiz..."
                    value={formData.object}
                    onChange={(e) => setFormData({...formData, object: e.target.value})}
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={() => setStep(2)}>Próximo</Button>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Regras Específicas ou Data Comemorativa (Opcional)</Label>
                  <Input 
                    placeholder="Ex: Todo dia 25 de agosto; Obrigatório em prédios públicos..."
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se deixar em branco, a IA criará regras padrão. A data do documento será a de hoje.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Objetivos e Argumentos (Para a Justificativa)</Label>
                  <Textarea 
                    placeholder="Liste 2 ou 3 motivos para criar essa lei. A IA usará isso para escrever a justificativa completa."
                    className="h-32"
                    value={formData.objectives}
                    onChange={(e) => setFormData({...formData, objectives: e.target.value})}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                  <Button onClick={handleGenerate} disabled={loading} variant="gradient">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Escrevendo Minuta...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Gerar Documento
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && generatedLaw && (
              <div className="space-y-6">
                <div className="bg-muted p-4 rounded-md h-64 overflow-y-auto whitespace-pre-wrap font-mono text-sm border border-border">
                  {generatedLaw.text}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                   <Button variant="outline" onClick={() => setStep(2)}>
                    Refazer
                   </Button>
                   <Button onClick={handleDownload} size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Download className="w-5 h-5" />
                    Baixar Word (.docx)
                   </Button>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 items-start">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-800">Pronto para editar!</h4>
                    <p className="text-sm text-green-700">
                      O arquivo baixado já vem formatado com as margens e fontes padrão. 
                      Lembre-se de revisar os artigos antes de protocolar.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
