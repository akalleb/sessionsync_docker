import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { MinutesEditor } from '@/components/editor/MinutesEditor';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Sparkles, FileText, Blocks, Copy, Search, ChevronUp, ChevronDown, PlayCircle, Video, RefreshCw, Info, HelpCircle, Users, MessageSquare, Clock } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn, apiCall } from '@/lib/utils';
import { Link, useParams } from 'react-router-dom';
import { TranscriptionBlock } from '@/types/transcription';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { IImageOptions } from 'docx';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ProfileWithPreferences {
  nome: string | null;
  cargo: string | null;
  preferences: {
    vereador?: {
      apelido?: string | null;
    };
  } | null;
}

export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const [blocks, setBlocks] = useState<TranscriptionBlock[]>([]);
  const [minutesContent, setMinutesContent] = useState('');
  const [fullTranscript, setFullTranscript] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [nameHints, setNameHints] = useState<string>('');
  const [nameMap, setNameMap] = useState<Array<{ official: string; aliases: string[] }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [processingBlockId, setProcessingBlockId] = useState<string | null>(null);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [camaraInfo, setCamaraInfo] = useState<{ nome: string; logo_url: string | null } | null>(null);
  const [activeTab, setActiveTab] = useState('blocks');
  const [hasSelection, setHasSelection] = useState(false);
  
  // Speaker Tab State
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // Minutes Generation State
  const [isMinutesModalOpen, setIsMinutesModalOpen] = useState(false);
  const [minutesType, setMinutesType] = useState<'ordinaria' | 'extraordinaria' | 'solene'>('ordinaria');
  const [generationStep, setGenerationStep] = useState<string>('');

  // Helper to extract YouTube ID
  const getYouTubeID = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const searchResult = useMemo(() => {
    if (!transcriptSearch || !fullTranscript) return { parts: [fullTranscript], count: 0 };
    try {
        const escapedSearch = transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = fullTranscript.split(new RegExp(`(${escapedSearch})`, 'gi'));
        const count = Math.floor(parts.length / 2);
        return { parts, count };
    } catch (e) {
        return { parts: [fullTranscript], count: 0 };
    }
  }, [fullTranscript, transcriptSearch]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [transcriptSearch]);

  const scrollToMatch = (index: number) => {
    setTimeout(() => {
        const element = document.getElementById(`match-${index}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 10);
  };

  const handlePrevMatch = () => {
    if (searchResult.count === 0) return;
    const newIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : searchResult.count - 1;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  };

  const handleNextMatch = () => {
    if (searchResult.count === 0) return;
    const newIndex = currentMatchIndex < searchResult.count - 1 ? currentMatchIndex + 1 : 0;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  };

  const fetchSessionData = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        console.warn('Session not found via RLS. Trying backend fetch...');
        toast.error('Sessão não encontrada ou acesso negado.');
        return;
      }

      if (data) {
        setSessionTitle(data.title);
        setSessionDate(data.date);
        setAudioUrl(data.audio_url);
        setYoutubeUrl(data.youtube_url);
        setFullTranscript(data.transcript || '');
        setNameHints('');
        setNameMap([]);
        
        if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
          const rawBlocks = data.blocks as unknown as TranscriptionBlock[];
          const normalizedBlocks = rawBlocks.map((b) => {
            const summary =
              typeof b.summary === 'string' || typeof b.summary === 'undefined' || b.summary === null
                ? b.summary
                : JSON.stringify(b.summary);
            return { ...b, summary };
          });
          setBlocks(normalizedBlocks);
        } else {
          setBlocks([]); 
        }
        
        if (data.final_minutes) {
            setMinutesContent(data.final_minutes);
        }

        if (data.camara_id) {
          fetchNameHintsForCamara(data.camara_id).catch((err) => {
            console.error('Erro ao carregar lista de vereadores:', err);
            toast.warning('Não foi possível carregar lista de vereadores para padronizar nomes.');
          });
          fetchCamaraInfo(data.camara_id).catch((err) => {
            console.error('Erro ao carregar dados da câmara:', err);
          });
        } else {
          setCamaraInfo(null);
        }
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      toast.error('Erro ao carregar dados da sessão');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchSessionData(id);
    }
  }, [id, fetchSessionData]);

  const fetchNameHintsForCamara = async (camaraId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('nome, cargo, preferences')
      .eq('camara_id', camaraId)
      .ilike('cargo', 'Vereador%')
      .eq('ativo', true)
      .order('nome');

    if (error) {
      throw error;
    }

    const lines: string[] = [];
    const nextNameMap: Array<{ official: string; aliases: string[] }> = [];
    const rows = (data || []) as ProfileWithPreferences[];
    for (const row of rows) {
      const prefs = row.preferences || {};
      const vereador = prefs.vereador || {};
      const apelido = typeof vereador.apelido === 'string' ? vereador.apelido.trim() : '';
      const nome = row.nome ? row.nome.trim() : '';
      if (!nome) continue;
      if (apelido) lines.push(`- ${nome} (apelido: ${apelido})`);
      else lines.push(`- ${nome}`);
      if (apelido) nextNameMap.push({ official: nome, aliases: [apelido] });
    }

    setNameHints(lines.join('\n'));
    setNameMap(nextNameMap);
  };

  const fetchCamaraInfo = async (camaraId: string) => {
    const { data, error } = await supabase
      .from('camaras')
      .select('nome, logo_url')
      .eq('id', camaraId)
      .single();

    if (error) {
      throw error;
    }

    setCamaraInfo(data);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  const handleAudioUpdateClick = () => {
    fileInputRef.current?.click();
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    try {
        setIsUploadingAudio(true);
        toast.info('Iniciando upload do novo áudio...');

        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `session_audio/${id}/${Date.now()}-${sanitizedName}`;

        const { uploadUrl, publicUrl } = await apiCall('/generate-upload-url', {
             filename: fileName,
             contentType: file.type
        });

        if (!uploadUrl) throw new Error('Falha ao gerar URL de upload.');

        await fetch(uploadUrl, {
             method: 'PUT',
             headers: { 'Content-Type': file.type },
             body: file
        });
        
        const newAudioUrl = publicUrl;

        const { error: dbError } = await supabase
            .from('sessions')
            .update({ audio_url: newAudioUrl })
            .eq('id', id);

        if (dbError) throw dbError;

        setAudioUrl(newAudioUrl);
        toast.success('Áudio atualizado com sucesso!');

    } catch (error) {
        console.error('Erro ao atualizar áudio:', error);
        toast.error(error instanceof Error ? error.message : 'Erro desconhecido ao atualizar áudio.');
    } finally {
        setIsUploadingAudio(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBlocksChange = (newBlocks: TranscriptionBlock[]) => {
    setBlocks(newBlocks);
  };

  const syncKnowledgeBase = async () => {
    try {
      apiCall('/ingest-session', { sessionId: id })
        .catch(err => console.error('Background sync failed:', err));
    } catch (e) {
      console.error('Error triggering sync:', e);
    }
  };

  const handleOrganizeBlocks = async () => {
    if (!fullTranscript) {
      toast.error('Não há transcrição disponível para organizar.');
      return;
    }

    toast.info('Organizando blocos', { duration: 4000 });
    
    try {
      const gptData = await apiCall('/process-transcript', {
        transcript: fullTranscript
      });

      if (gptData?.blocks) {
        setBlocks(gptData.blocks);
        toast.success('Blocos organizados com sucesso!');
        
        await supabase
        .from('sessions')
        .update({
          blocks: gptData.blocks as unknown as Json,
        })
        .eq('id', id);

        syncKnowledgeBase();
        
      } else {
        toast.warning('A IA não retornou blocos válidos.');
      }
    } catch (error) {
      console.error('Error organizing blocks:', error);
      toast.error('Erro ao organizar blocos. Tente novamente.');
    }
  };

  const generateMinutesContent = (currentBlocks: TranscriptionBlock[]) => {
    const getContent = (type: string) => {
      const block = currentBlocks.find(b => b.type === type);
      return block?.summary || block?.content || '';
    };

    const cabecalho = getContent('cabecalho');
    const abertura = getContent('abertura');
    const expediente = getContent('expediente');
    const pronunciamentos = getContent('explicacoes_pessoais');
    const ordemDia = getContent('ordem_dia');
    const votacoes = getContent('votacao');
    const encerramento = getContent('encerramento');

    return `**ATA DA ${sessionTitle.toUpperCase()}**

# CABEÇALHO
${cabecalho}

# CORPO DA ATA

## ABERTURA
${abertura}

## EXPEDIENTE
**O SENHOR PRESIDENTE DETERMINA O SENHOR 1º SECRETÁRIO A PROCEDER À LEITURA DAS SEGUINTES MATÉRIAS:**
${expediente}
**NÃO HAVENDO MAIS EXPEDIENTE A SER LIDO.**

## PRONUNCIAMENTOS
**O SENHOR PRESIDENTE FACULTA A PALAVRA AOS SENHORES VEREADORES PARA FAZEREM USO DA MESMA SOBRE PRONUNCIAMENTO PÚBLICO OU POLÍTICO PELO TEMPO REGIMENTAL DE 15 MINUTOS.**
${pronunciamentos}

## ORDEM DO DIA
${ordemDia}

## VOTAÇÕES
${votacoes}

# ENCERRAMENTO
${encerramento}`;
  };

  const handleSummarizeBlock = async (blockId: string, customPrompt?: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    setProcessingBlockId(blockId);
    toast.info('Gerando resumo do bloco...', { duration: 2000 });

    try {
      if (!id) {
        throw new Error('Session ID ausente');
      }
      const aiData = await apiCall('/summarize-content', {
          content: block.content,
          prompt: customPrompt,
          blockType: block.type,
          nameHints: nameHints || undefined,
          nameMap: nameMap.length > 0 ? nameMap : undefined
      });

      if (aiData?.summary) {
        const updatedBlocks = blocks.map(b => 
          b.id === blockId ? { ...b, summary: aiData.summary } : b
        );
        setBlocks(updatedBlocks);
        
        const newMinutes = generateMinutesContent(updatedBlocks);
        setMinutesContent(newMinutes);

        const { error } = await supabase
          .from('sessions')
          .update({ 
            blocks: updatedBlocks as unknown as Json,
            final_minutes: newMinutes,
          })
          .eq('id', id);
        if (error) throw error;

        toast.success('Resumo gerado e salvo!');
      }
    } catch (error) {
      console.error('Error summarizing block:', error);
      toast.error('Erro ao gerar resumo.');
    } finally {
      setProcessingBlockId(null);
    }
  };

  const handleGenerateSummaries = async () => {
    if (blocks.length === 0) {
      toast.warning('Não há blocos para resumir.');
      return;
    }

    setIsGenerating(true);
    toast.info('Iniciando geração de resumos em lote. Isso pode levar alguns instantes...', { duration: 4000 });
    
    try {
      const newBlocks = [...blocks];
      let successCount = 0;

      for (let i = 0; i < newBlocks.length; i++) {
        const block = newBlocks[i];
        
        if (!block.content) continue;

        setProcessingBlockId(block.id);

        try {
             const aiData = await apiCall('/summarize-content', {
                  content: block.content,
                  blockType: block.type,
                  nameHints: nameHints || undefined,
                  nameMap: nameMap.length > 0 ? nameMap : undefined
             });

              if (aiData?.summary) {
                newBlocks[i] = { ...block, summary: aiData.summary };
                successCount++;
                setBlocks([...newBlocks]); 
              }
        } catch (err) {
            console.error(`Failed to summarize block ${block.id}`, err);
        }
      }

      setProcessingBlockId(null);
      setBlocks(newBlocks);
      
      if (successCount > 0) {
        toast.success(`${successCount} resumos gerados com sucesso!`);
        
        const newMinutes = generateMinutesContent(newBlocks);
        setMinutesContent(newMinutes);

        if (!id) {
          throw new Error('Session ID ausente');
        }
        const { error } = await supabase
          .from('sessions')
          .update({ 
            blocks: newBlocks as unknown as Json,
            final_minutes: newMinutes,
          })
          .eq('id', id);
        if (error) throw error;
          
      } else {
        toast.warning('Não foi possível gerar os resumos.');
      }

    } catch (error) {
        console.error('Error in batch summary:', error);
        toast.error('Erro ao processar resumos em lote.');
    } finally {
        setIsGenerating(false);
    }
  };

  const confirmGenerateMinutes = async () => {
    if (!id) return;
    
    setIsMinutesModalOpen(false);
    setIsGenerating(true);
    setGenerationStep('Iniciando...');
    
    const steps = [
        "🔍 Analisando estrutura da sessão...",
        minutesType === 'solene' ? "📚 Buscando contexto legal e histórico..." : null,
        `✍️ Gerando ata ${minutesType}...`,
    ].filter(Boolean) as string[];

    let stepIndex = 0;
    const interval = setInterval(() => {
        if (stepIndex < steps.length) {
            toast.info(steps[stepIndex], { duration: 2000 });
            setGenerationStep(steps[stepIndex]);
            stepIndex++;
        }
    }, 2500);

    try {
        const result = await apiCall('/generate-minutes-mcp', {
            sessionId: id,
            minutesType: minutesType
        });

        clearInterval(interval);

        if (result && result.minutes_text) {
            setMinutesContent(result.minutes_text);
            toast.success('✅ Ata gerada com sucesso!');
            
            if (result.used_sources && result.used_sources.length > 0) {
                toast('Fontes utilizadas:', {
                    description: result.used_sources.join(', '),
                    duration: 5000,
                });
            }
            
            syncKnowledgeBase();
        } else {
            throw new Error('Falha ao gerar ata (resposta vazia)');
        }

    } catch (error) {
        clearInterval(interval);
        console.error('Error generating minutes via MCP:', error);
        toast.error('Erro ao gerar ata. Tente novamente.');
    } finally {
        setIsGenerating(false);
        setGenerationStep('');
    }
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!minutesContent) {
      toast.error('Não há conteúdo para exportar.');
      return;
    }

    toast.info(`Gerando arquivo ${format.toUpperCase()}...`);

    try {
      if (format === 'docx') {
        const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun } = await import('docx');
        const { saveAs } = await import('file-saver');

        let logoArrayBuffer: ArrayBuffer | null = null;

        if (camaraInfo?.logo_url) {
          try {
            const response = await fetch(camaraInfo.logo_url);
            if (response.ok) {
              logoArrayBuffer = await response.arrayBuffer();
            }
          } catch (e) {
            console.error('Erro ao carregar logo para Word:', e);
          }
        }

        const paragraphs = minutesContent.split('\n').map(line => {
          const cleanLine = line.trim();
          
          if (cleanLine.startsWith('# ')) {
            return new Paragraph({
              children: [new TextRun({ 
                text: cleanLine.replace('# ', ''), 
                bold: true, 
                size: 32,
                font: "Times New Roman"
              })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 400, after: 200 }
            });
          } 
          else if (cleanLine.startsWith('## ')) {
            return new Paragraph({
              children: [new TextRun({ 
                text: cleanLine.replace('## ', ''), 
                bold: true, 
                size: 28,
                font: "Times New Roman"
              })],
              spacing: { before: 300, after: 150 }
            });
          } 
          else if (cleanLine.startsWith('**') && cleanLine.endsWith('**')) {
             return new Paragraph({
              children: [new TextRun({ 
                text: cleanLine.replace(/\*\*/g, ''), 
                bold: true,
                size: 24,
                font: "Times New Roman"
              })],
              spacing: { before: 200, after: 100 }
            });
          }
          
          const parts = line.split(/(\*\*.*?\*\*)/g);
          const textRuns = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return new TextRun({ 
                text: part.slice(2, -2), 
                bold: true,
                size: 24,
                font: "Times New Roman"
              });
            }
            return new TextRun({ 
              text: part,
              size: 24,
              font: "Times New Roman"
            });
          });

          return new Paragraph({
            children: textRuns,
             spacing: { after: 100 }
          });
        });

        const children = [];

        if (logoArrayBuffer) {
          const imageOptions: IImageOptions = {
            data: logoArrayBuffer,
            transformation: {
              width: 80,
              height: 80,
            },
            type: 'png',
          };
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  ...imageOptions,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            })
          );
        }

        if (camaraInfo?.nome) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: camaraInfo.nome.toUpperCase(),
                  bold: true,
                  size: 26,
                  font: "Times New Roman",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
            })
          );
        }

        children.push(...paragraphs);

        const doc = new Document({
          sections: [{
            properties: {},
            children,
          }],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, `Ata-${sessionTitle.replace(/\s+/g, '-')}.docx`);
        toast.success('Download do Word iniciado!');
      } 
      
      else if (format === 'pdf') {
        const pdfMakeModule = await import('pdfmake/build/pdfmake');
        const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
        
        const pdfMake = pdfMakeModule.default;
        const pdfFonts = pdfFontsModule.default;
        
        interface PdfMakeWithVfs {
            vfs: Record<string, string>;
            createPdf: (docDefinition: unknown) => { download: (filename: string) => void };
        }
        
        const pdfMakeInstance = pdfMake as unknown as PdfMakeWithVfs;
        const pdfFontsAny = pdfFonts as unknown as { vfs?: Record<string, string>; pdfMake?: { vfs: Record<string, string> } };

        if (pdfFontsAny.pdfMake && pdfFontsAny.pdfMake.vfs) {
           pdfMakeInstance.vfs = pdfFontsAny.pdfMake.vfs;
        } else if (pdfFontsAny.vfs) {
           pdfMakeInstance.vfs = pdfFontsAny.vfs;
        }

        let logoDataUrl: string | null = null;

        if (camaraInfo?.logo_url) {
          try {
            const response = await fetch(camaraInfo.logo_url);
            if (response.ok) {
              const blob = await response.blob();
              logoDataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {
            console.error('Erro ao carregar logo para PDF:', e);
          }
        }

        const headerContent: unknown[] = [];

        if (logoDataUrl || camaraInfo?.nome) {
          const columns: unknown[] = [];

          if (logoDataUrl) {
            columns.push({
              image: logoDataUrl,
              width: 60,
              margin: [0, 0, 10, 0],
            });
          }

          columns.push({
            stack: [
              {
                text: camaraInfo?.nome || 'Câmara Municipal',
                style: 'camaraName',
              },
              {
                text: 'Ata de Sessão Legislativa',
                style: 'camaraSubtitle',
              },
            ],
            alignment: 'center',
          });

          headerContent.push({
            columns,
            margin: [0, 0, 0, 12],
          });
        }

        const bodyContent = minutesContent.split('\n').map(line => {
          const cleanLine = line.trim();

          if (cleanLine.startsWith('# ')) {
            return { 
              text: cleanLine.replace('# ', ''), 
              style: 'header1',
              margin: [0, 10, 0, 5] 
            };
          } else if (cleanLine.startsWith('## ')) {
            return { 
              text: cleanLine.replace('## ', ''), 
              style: 'header2',
              margin: [0, 8, 0, 4] 
            };
          }
          
          const parts = line.split(/(\*\*.*?\*\*)/g);
          const textObjects = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return { text: part.slice(2, -2), bold: true };
            }
            return { text: part };
          });

          const validParts = textObjects.filter(p => p.text);

          if (validParts.length === 0) return { text: '\n' };

          return {
            text: validParts,
            margin: [0, 0, 0, 2],
            lineHeight: 1.2
          };
        });

        const docDefinition = {
          content: [...headerContent, ...bodyContent],
          styles: {
            header1: {
              fontSize: 14,
              bold: true,
              alignment: 'center',
              font: 'Roboto'
            },
            header2: {
              fontSize: 12,
              bold: true,
              font: 'Roboto'
            },
            camaraName: {
              fontSize: 12,
              bold: true,
              alignment: 'center',
              font: 'Roboto'
            },
            camaraSubtitle: {
              fontSize: 10,
              alignment: 'center',
              font: 'Roboto'
            }
          },
          defaultStyle: {
            fontSize: 10,
            font: 'Roboto' 
          }
        };

        pdfMakeInstance.createPdf(docDefinition).download(`Ata-${sessionTitle.replace(/\s+/g, '-')}.pdf`);
        toast.success('Download do PDF iniciado!');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erro ao gerar arquivo.');
    }
  };

  const handlePublish = (destination: 'transparency' | 'website') => {
    const name = destination === 'transparency' ? 'Portal da Transparência' : 'Site da Câmara';
    toast.success(`Publicando no ${name}...`);
  };

  const handleSave = async () => {
    if (!id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          title: sessionTitle,
          blocks: blocks as unknown as Json,
          final_minutes: minutesContent,
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Alterações salvas!');
      
      syncKnowledgeBase();

    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(fullTranscript);
    toast.success('Transcrição copiada para a área de transferência');
  };

  const checkSelection = () => {
    const selection = window.getSelection();
    setHasSelection(!!selection && selection.toString().trim().length > 0);
  };

  const handleCreateBlockFromSelection = (targetBlockId?: string) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (!text) {
        toast.warning('Selecione um trecho do texto primeiro.');
        return;
    }

    if (targetBlockId) {
        const updatedBlocks = blocks.map(b => 
            b.id === targetBlockId 
            ? { ...b, content: text } 
            : b
        );
        setBlocks(updatedBlocks);
        setActiveTab('blocks');
        toast.success('Conteúdo do bloco atualizado!');
        
        setTimeout(() => {
            const element = document.getElementById(targetBlockId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('ring-2', 'ring-primary', 'transition-all');
                setTimeout(() => element.classList.remove('ring-2', 'ring-primary'), 2000);
            }
        }, 100);
    } else {
        const newBlock: TranscriptionBlock = {
            id: `block-${Date.now()}`,
            type: 'outros',
            title: 'Novo Bloco Selecionado',
            content: text,
            timestamp: '00:00:00',
            order: blocks.length,
        };

        setBlocks([...blocks, newBlock]);
        setActiveTab('blocks');
        toast.success('Bloco criado a partir da seleção!');

        setTimeout(() => {
            const element = document.getElementById(newBlock.id);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
    }
  };

  const hasUnsummarizedBlocks = useMemo(() => {
    return blocks.some(b => !b.summary && b.content.length > 0);
  }, [blocks]);

  // --- Speaker Logic ---
  const speakersList = useMemo(() => {
      const speakers = new Set<string>();
      blocks.forEach(b => {
          if (b.speaker) speakers.add(b.speaker);
      });
      return Array.from(speakers).sort();
  }, [blocks]);

  const filteredBlocks = useMemo(() => {
      if (!selectedSpeaker) return [];
      return blocks.filter(b => b.speaker === selectedSpeaker);
  }, [blocks, selectedSpeaker]);

  const handleMergeBlocks = () => {
      if (!selectedSpeaker || filteredBlocks.length < 2) return;
      
      const firstBlock = filteredBlocks[0];
      const mergedContent = filteredBlocks.map(b => b.content).join('\n\n');
      
      const newBlock: TranscriptionBlock = {
          ...firstBlock,
          content: mergedContent,
          summary: undefined,
          title: `Fala Completa de ${selectedSpeaker}`,
          type: 'discussao'
      };

      const mergedIds = new Set(filteredBlocks.map(b => b.id));
      const remainingBlocks = blocks.filter(b => !mergedIds.has(b.id));

      const insertIndex = blocks.findIndex(b => b.id === firstBlock.id);
      
      const finalBlocks = [
          ...remainingBlocks.slice(0, insertIndex),
          newBlock,
          ...remainingBlocks.slice(insertIndex)
      ];

      finalBlocks.forEach((b, i) => b.order = i);

      setBlocks(finalBlocks);
      setIsMergeModalOpen(false);
      toast.success(`Blocos de ${selectedSpeaker} mesclados com sucesso!`);
  };

  return (
    <TooltipProvider>
      <MainLayout>
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden -m-4">
          {/* Header */}
          <div className="px-6 py-3 border-b border-border/40 bg-background/60 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/sessions">
                    <Button variant="ghost" size="icon" className="hover:bg-accent/50 transition-colors">
                      <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Voltar para lista de sessões</p>
                </TooltipContent>
              </Tooltip>
              
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground tracking-tight">
                    {sessionTitle}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium uppercase tracking-wider">
                    Editor
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(sessionDate).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{camaraInfo?.nome || 'Câmara Municipal'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleOrganizeBlocks}
                className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-accent/50 border-primary/20 hover:border-primary/40 transition-all duration-300"
              >
                <Blocks className="w-4 h-4 text-blue-500" />
                <span className="hidden sm:inline">Organizar (IA)</span>
              </Button>

              <Dialog open={isMinutesModalOpen} onOpenChange={setIsMinutesModalOpen}>
                  <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="gap-2 bg-background/50 backdrop-blur-sm hover:bg-accent/50 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300"
                      >
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="hidden sm:inline">Gerar Ata</span>
                      </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                          <DialogTitle>Gerar Ata com IA</DialogTitle>
                          <DialogDescription>
                              Selecione o tipo de sessão para gerar uma ata adequada ao protocolo.
                          </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                          <RadioGroup value={minutesType} onValueChange={(v: any) => setMinutesType(v)}>
                              <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                  <RadioGroupItem value="ordinaria" id="r1" />
                                  <Label htmlFor="r1" className="cursor-pointer flex-1">
                                      <div className="font-semibold">Ordinária</div>
                                      <div className="text-xs text-muted-foreground">Sessão comum, com expediente e ordem do dia.</div>
                                  </Label>
                              </div>
                              <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                  <RadioGroupItem value="extraordinaria" id="r2" />
                                  <Label htmlFor="r2" className="cursor-pointer flex-1">
                                      <div className="font-semibold">Extraordinária</div>
                                      <div className="text-xs text-muted-foreground">Pauta específica, sem expediente comum.</div>
                                  </Label>
                              </div>
                              <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                  <RadioGroupItem value="solene" id="r3" />
                                  <Label htmlFor="r3" className="cursor-pointer flex-1">
                                      <div className="font-semibold">Solene</div>
                                      <div className="text-xs text-muted-foreground">Homenagens, datas comemorativas, protocolo formal.</div>
                                  </Label>
                              </div>
                          </RadioGroup>
                      </div>
                      <DialogFooter>
                          <Button variant="outline" onClick={() => setIsMinutesModalOpen(false)}>Cancelar</Button>
                          <Button onClick={confirmGenerateMinutes} className="gap-2">
                              <Sparkles className="w-4 h-4" />
                              Gerar Agora
                          </Button>
                      </DialogFooter>
                  </DialogContent>
              </Dialog>
              
              <Button
                variant="default"
                onClick={handleSave}
                disabled={isSaving || isGenerating || processingBlockId !== null}
                className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300 min-w-[100px]"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>

          {/* Media Player Bar */}
          {(audioUrl || youtubeUrl) && (
            <div className="border-b border-border/40 bg-muted/30 backdrop-blur-sm shrink-0 transition-all duration-300">
               <div className="max-w-5xl mx-auto py-2 px-6">
                  <Collapsible
                    open={isPlayerOpen}
                    onOpenChange={setIsPlayerOpen}
                    className="w-full space-y-2"
                  >
                    <div className="flex items-center justify-between">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-all select-none group py-1">
                              <div className={cn("p-1.5 rounded-full transition-colors", youtubeUrl ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500")}>
                                {youtubeUrl ? <Video className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                              </div>
                              <div className="flex flex-col">
                                <h3 className="text-sm font-medium leading-none group-hover:text-primary transition-colors">Mídia da Sessão</h3>
                                <span className="text-[10px] text-muted-foreground mt-0.5">Clique para {isPlayerOpen ? 'ocultar' : 'visualizar'} o player</span>
                              </div>
                          </div>
                        </CollapsibleTrigger>

                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full hover:bg-background/80">
                          {isPlayerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span className="sr-only">Toggle Player</span>
                        </Button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="space-y-4 animate-slide-down">
                      {youtubeUrl ? (
                        <div className="rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-black max-w-2xl mx-auto ring-1 ring-white/10">
                            <AspectRatio ratio={16 / 9}>
                              <iframe 
                                src={`https://www.youtube.com/embed/${getYouTubeID(youtubeUrl)}`}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                className="w-full h-full"
                              ></iframe>
                            </AspectRatio>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 items-center bg-card/50 backdrop-blur p-4 rounded-xl border border-border/50 shadow-lg max-w-2xl mx-auto">
                            <audio controls className="w-full h-10 focus:outline-none accent-primary" src={audioUrl!} />
                        </div>
                      )}

                      {!youtubeUrl && (
                         <div className="flex justify-center pb-2">
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             onClick={handleAudioUpdateClick} 
                             disabled={isUploadingAudio}
                             className="gap-2 text-xs text-muted-foreground hover:text-foreground"
                           >
                             <RefreshCw className={cn("w-3 h-3", isUploadingAudio && "animate-spin")} />
                             {isUploadingAudio ? 'Enviando...' : 'Substituir arquivo de áudio'}
                           </Button>
                           <input 
                             type="file" 
                             ref={fileInputRef} 
                             className="hidden" 
                             accept="audio/*" 
                             onChange={handleAudioFileSelect} 
                           />
                         </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
               </div>
            </div>
          )}

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden">
          {/* Main Content Area (Tabs) */}
          <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <TabsList className="bg-muted/50 p-1 border border-border/40">
                  <TabsTrigger value="blocks" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                    <Blocks className="w-4 h-4" />
                    Blocos
                  </TabsTrigger>
                  <TabsTrigger value="speakers" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                    <Users className="w-4 h-4" />
                    Por Orador
                  </TabsTrigger>
                  <TabsTrigger value="transcript" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                    <FileText className="w-4 h-4" />
                    Transcrição Completa
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="blocks" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-2 duration-300">
                <div className="h-full overflow-auto pr-2 custom-scrollbar">
                  <BlockEditor
                    blocks={blocks}
                    onBlocksChange={handleBlocksChange}
                    onGenerateSummaries={handleGenerateSummaries}
                    onSummarizeBlock={handleSummarizeBlock}
                    isGenerating={isGenerating}
                    processingBlockId={processingBlockId}
                  />
                </div>
              </TabsContent>

              <TabsContent value="speakers" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-2 duration-300">
                  <div className="flex h-full gap-4">
                      {/* Sidebar List */}
                      <div className="w-64 bg-card/50 border border-border/40 rounded-lg overflow-hidden flex flex-col">
                          <div className="p-3 border-b border-border/40 font-medium text-sm text-muted-foreground bg-muted/20">
                              Oradores Detectados
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 space-y-1">
                              {speakersList.length === 0 && (
                                  <div className="text-xs text-muted-foreground p-4 text-center">Nenhum orador identificado.</div>
                              )}
                              {speakersList.map(speaker => (
                                  <button
                                      key={speaker}
                                      onClick={() => setSelectedSpeaker(speaker)}
                                      className={cn(
                                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                                          selectedSpeaker === speaker 
                                            ? "bg-primary/10 text-primary font-medium" 
                                            : "hover:bg-muted/50 text-foreground/80"
                                      )}
                                  >
                                      <div className={cn("w-2 h-2 rounded-full", selectedSpeaker === speaker ? "bg-primary" : "bg-muted-foreground/30")} />
                                      <span className="truncate">{speaker}</span>
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* Main View */}
                      <div className="flex-1 bg-card/30 border border-border/40 rounded-lg overflow-hidden flex flex-col relative">
                          {selectedSpeaker ? (
                              <>
                                <div className="p-4 border-b border-border/40 bg-muted/20 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-5 h-5 text-primary" />
                                        <h3 className="font-semibold text-lg">{selectedSpeaker}</h3>
                                        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/30">
                                            {filteredBlocks.length} trechos
                                        </span>
                                    </div>
                                    {filteredBlocks.length > 1 && (
                                        <Dialog open={isMergeModalOpen} onOpenChange={setIsMergeModalOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <MessageSquare className="w-4 h-4" />
                                                    Mesclar Trechos em Bloco Único
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Confirmar Mesclagem</DialogTitle>
                                                    <DialogDescription>
                                                        Isso irá combinar todos os {filteredBlocks.length} trechos de <strong>{selectedSpeaker}</strong> em um único bloco de "Discussão". 
                                                        Os blocos originais serão removidos e substituídos pelo novo bloco unificado na posição do primeiro trecho.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => setIsMergeModalOpen(false)}>Cancelar</Button>
                                                    <Button onClick={handleMergeBlocks}>Confirmar e Mesclar</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {filteredBlocks.map((block) => (
                                        <div key={block.id} className="bg-background border border-border/50 rounded-lg p-4 shadow-sm hover:border-primary/20 transition-all">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span className="font-mono">{block.timestamp}</span>
                                                    <span className="w-1 h-1 rounded-full bg-border" />
                                                    <span className="uppercase tracking-wider font-medium text-[10px]">{block.type}</span>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-6 text-xs gap-1 text-primary hover:text-primary/80 hover:bg-primary/5"
                                                    onClick={() => {
                                                        setActiveTab('blocks');
                                                        setTimeout(() => {
                                                            const el = document.getElementById(block.id);
                                                            if (el) {
                                                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                el.classList.add('ring-2', 'ring-primary');
                                                                setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 2000);
                                                            }
                                                        }, 100);
                                                    }}
                                                >
                                                    Ver no Editor
                                                    <ArrowLeft className="w-3 h-3 rotate-180" />
                                                </Button>
                                            </div>
                                            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{block.content}</p>
                                        </div>
                                    ))}
                                </div>
                              </>
                          ) : (
                              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
                                  <Users className="w-12 h-12 opacity-20" />
                                  <p>Selecione um orador para visualizar suas falas</p>
                              </div>
                          )}
                      </div>
                  </div>
              </TabsContent>

              <TabsContent value="transcript" className="flex-1 overflow-hidden mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:slide-in-from-bottom-2 duration-300">
                <div className="h-full flex flex-col bg-card/80 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm overflow-hidden">
                  <div className="p-3 border-b border-border/50 flex items-center justify-between bg-muted/20 gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <FileText className="w-4 h-4" />
                            <h3 className="font-medium text-sm shrink-0">Texto Original</h3>
                        </div>
                        <div className="h-4 w-px bg-border/60" />
                        <div className="flex items-center gap-2 max-w-md w-full">
                           <div className="relative flex-1 group">
                               <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-hover:text-primary transition-colors" />
                               <Input 
                                 placeholder="Buscar na transcrição..." 
                                 value={transcriptSearch}
                                 onChange={(e) => setTranscriptSearch(e.target.value)}
                                 className="pl-9 h-8 bg-background/50 border-border/50 focus:bg-background transition-all"
                               />
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                     <HelpCircle className="w-3 h-3 text-muted-foreground/50 cursor-help" />
                                   </div>
                                 </TooltipTrigger>
                                 <TooltipContent>
                                   <p>Digite para destacar termos no texto</p>
                                 </TooltipContent>
                               </Tooltip>
                           </div>
                           {transcriptSearch && (
                               <div className="flex items-center gap-1 bg-background border border-border/50 rounded-md h-8 px-1.5 shrink-0 shadow-sm animate-in fade-in slide-in-from-left-2">
                                   <span className="text-[10px] text-muted-foreground min-w-[3rem] text-center font-mono">
                                       {searchResult.count > 0 ? `${currentMatchIndex + 1}/${searchResult.count}` : '0/0'}
                                   </span>
                                   <div className="flex gap-0.5 border-l border-border/50 pl-1 ml-1">
                                       <Tooltip>
                                         <TooltipTrigger asChild>
                                           <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={handlePrevMatch} disabled={searchResult.count === 0}>
                                               <ChevronUp className="h-3.5 w-3.5" />
                                           </Button>
                                         </TooltipTrigger>
                                         <TooltipContent><p>Anterior</p></TooltipContent>
                                       </Tooltip>
                                       
                                       <Tooltip>
                                         <TooltipTrigger asChild>
                                           <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted" onClick={handleNextMatch} disabled={searchResult.count === 0}>
                                               <ChevronDown className="h-3.5 w-3.5" />
                                           </Button>
                                         </TooltipTrigger>
                                         <TooltipContent><p>Próximo</p></TooltipContent>
                                       </Tooltip>
                                   </div>
                               </div>
                           )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {hasSelection && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="secondary" className="gap-2 animate-in fade-in zoom-in duration-200 h-8 shadow-sm border border-border/50">
                                        <Blocks className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-xs font-medium">Usar Seleção</span>
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64 max-h-[300px] overflow-y-auto">
                                    <DropdownMenuItem onClick={() => handleCreateBlockFromSelection()} className="gap-2 py-2.5 cursor-pointer">
                                        <div className="bg-primary/10 p-1 rounded-md text-primary">
                                          <Blocks className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                          <span className="font-medium">Criar Novo Bloco</span>
                                          <span className="text-[10px] text-muted-foreground">Adiciona um novo bloco ao final</span>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal uppercase tracking-wider">Substituir conteúdo de:</DropdownMenuLabel>
                                    {blocks.length > 0 ? (
                                        blocks.map(block => (
                                            <DropdownMenuItem key={block.id} onClick={() => handleCreateBlockFromSelection(block.id)} className="cursor-pointer">
                                                <span className="truncate text-sm">{block.title || block.type}</span>
                                            </DropdownMenuItem>
                                        ))
                                    ) : (
                                        <div className="px-2 py-2 text-xs text-muted-foreground italic text-center">Nenhum bloco existente</div>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        
                        <Button variant="ghost" size="sm" onClick={handleCopyTranscript} className="gap-2 h-8 text-muted-foreground hover:text-foreground">
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-xs">Copiar</span>
                            </Button>
                    </div>
                  </div>
                  <div 
                    className="flex-1 p-6 overflow-auto font-mono text-sm leading-relaxed whitespace-pre-wrap selection:bg-primary/20 selection:text-primary-foreground text-foreground/80"
                    onMouseUp={checkSelection}
                    onKeyUp={checkSelection}
                  >
                    {fullTranscript ? (
                        searchResult.parts.map((part, i) => {
                            if (part.toLowerCase() === transcriptSearch.toLowerCase() && transcriptSearch) {
                                const matchIndex = Math.floor((i - 1) / 2);
                                const isCurrent = matchIndex === currentMatchIndex;
                                
                                return (
                                    <mark 
                                        key={i} 
                                        id={`match-${matchIndex}`}
                                        className={cn(
                                            "rounded px-1 font-bold shadow-sm transition-all duration-300",
                                            isCurrent 
                                                ? "bg-primary text-primary-foreground ring-4 ring-primary/20 scroll-mt-32" 
                                                : "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100"
                                        )}
                                    >
                                        {part}
                                    </mark>
                                );
                            }
                            return <span key={i}>{part}</span>;
                        })
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 opacity-50">
                        <FileText className="w-8 h-8" />
                        <p>Nenhuma transcrição disponível.</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Minutes Panel */}
          <div className="w-[480px] border-l border-border/40 bg-card/30 flex flex-col overflow-hidden min-h-0 backdrop-blur-sm shadow-xl z-10">
            <MinutesEditor
              content={minutesContent}
              onChange={setMinutesContent}
              onExport={handleExport}
              onPublish={handlePublish}
              camaraName={camaraInfo?.nome || null}
              camaraLogoUrl={camaraInfo?.logo_url || null}
              hasUnsummarizedBlocks={hasUnsummarizedBlocks}
            />
          </div>
        </div>
      </div>
    </MainLayout>
    </TooltipProvider>
  );
}
