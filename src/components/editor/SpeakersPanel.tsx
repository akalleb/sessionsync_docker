import { useState, useMemo } from 'react';
import { TranscriptionBlock } from '@/types/transcription';
import { useSpeakerDetection } from '@/hooks/useSpeakerDetection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Search, MessageSquare, ArrowLeft, Clock, Edit2, Merge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SpeakersPanelProps {
  blocks: TranscriptionBlock[];
  fullTranscript: string;
  onBlocksChange: (blocks: TranscriptionBlock[]) => void;
  onNavigateToBlock: (blockId: string) => void;
}

export function SpeakersPanel({ blocks, fullTranscript, onBlocksChange, onNavigateToBlock }: SpeakersPanelProps) {
  const {
    speakersList,
    selectedSpeaker,
    setSelectedSpeaker,
    filteredBlocks,
    handleMergeSpeakers,
    handleRenameSpeaker
  } = useSpeakerDetection(blocks, fullTranscript, onBlocksChange);

  const [searchQuery, setSearchQuery] = useState('');
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [speakersToMerge, setSpeakersToMerge] = useState<string[]>([]);
  const [targetMergeName, setTargetMergeName] = useState('');

  const filteredSpeakers = useMemo(() => {
    return speakersList.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [speakersList, searchQuery]);

  const handleMergeClick = () => {
    if (selectedSpeaker) {
        setTargetMergeName(selectedSpeaker);
        setSpeakersToMerge([selectedSpeaker]);
    }
    setIsMergeModalOpen(true);
  };

  const executeMerge = () => {
      if (targetMergeName && speakersToMerge.length > 0) {
          handleMergeSpeakers(targetMergeName, speakersToMerge);
          setIsMergeModalOpen(false);
          setSpeakersToMerge([]);
          setTargetMergeName('');
      }
  };

  const executeRename = () => {
      if (selectedSpeaker && newName) {
          handleRenameSpeaker(selectedSpeaker, newName);
          setIsRenameModalOpen(false);
          setNewName('');
      }
  };

  const handleMergeBlocksInOne = () => {
      // Logic to merge filtered blocks content into one block
      if (!selectedSpeaker || filteredBlocks.length < 2) return;
      
      const firstBlock = filteredBlocks[0];
      const mergedContent = filteredBlocks.map(b => b.content).join('\n\n');
      
      const newBlock: TranscriptionBlock = {
          ...firstBlock,
          content: mergedContent,
          summary: undefined,
          title: `Fala Completa de ${selectedSpeaker}`,
          type: 'discussao' // Default to discussao
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
      onBlocksChange(finalBlocks);
  };

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar List */}
      <div className="w-72 bg-card/50 border border-border/40 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border/40 bg-muted/20 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Users className="w-4 h-4" />
                Oradores Detectados ({speakersList.length})
            </div>
            <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar oradores..."
                    className="h-8 pl-8 text-xs bg-background/50"
                />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filteredSpeakers.length === 0 && (
            <div className="text-xs text-muted-foreground p-4 text-center">Nenhum orador encontrado.</div>
          )}
          {filteredSpeakers.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => setSelectedSpeaker(name)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group",
                selectedSpeaker === name
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/50 text-foreground/80"
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <div className={cn("w-2 h-2 rounded-full shrink-0", selectedSpeaker === name ? "bg-primary" : "bg-muted-foreground/30")} />
                <span className="truncate" title={name}>{name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded border border-border/20 group-hover:border-border/40">
                  {count}
              </span>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-border/40 bg-muted/10">
            <Button variant="outline" size="sm" className="w-full text-xs gap-2" onClick={handleMergeClick} disabled={!selectedSpeaker}>
                <Merge className="w-3.5 h-3.5" />
                Mesclar Oradores
            </Button>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 bg-card/30 border border-border/40 rounded-lg overflow-hidden flex flex-col relative">
        {selectedSpeaker ? (
          <>
            <div className="p-4 border-b border-border/40 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UserIcon />
                </div>
                <div>
                    <h3 className="font-semibold text-lg leading-none">{selectedSpeaker}</h3>
                    <span className="text-xs text-muted-foreground">
                    {filteredBlocks.length} trechos de fala identificados
                    </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
                      <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setNewName(selectedSpeaker)}>
                              <Edit2 className="w-3.5 h-3.5" />
                              Renomear
                          </Button>
                      </DialogTrigger>
                      <DialogContent>
                          <DialogHeader>
                              <DialogTitle>Renomear Orador</DialogTitle>
                              <DialogDescription>Isso atualizará o nome do orador em todos os blocos associados.</DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                              <Label>Novo Nome</Label>
                              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: VEREADOR JOÃO" />
                          </div>
                          <DialogFooter>
                              <Button variant="outline" onClick={() => setIsRenameModalOpen(false)}>Cancelar</Button>
                              <Button onClick={executeRename}>Salvar</Button>
                          </DialogFooter>
                      </DialogContent>
                  </Dialog>

                  {filteredBlocks.length > 1 && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleMergeBlocksInOne}>
                      <MessageSquare className="w-4 h-4" />
                      Unificar Falas em Bloco Único
                    </Button>
                  )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {filteredBlocks.map((block) => (
                <div key={block.id} className="bg-background border border-border/50 rounded-lg p-4 shadow-sm hover:border-primary/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-mono">{block.timestamp || '00:00:00'}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span className="uppercase tracking-wider font-medium text-[10px] bg-muted/50 px-1.5 py-0.5 rounded">{block.type}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1 text-primary hover:text-primary/80 hover:bg-primary/5"
                      onClick={() => onNavigateToBlock(block.id)}
                    >
                      Ver no Editor
                      <ArrowLeft className="w-3 h-3 rotate-180" />
                    </Button>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed border-l-2 border-primary/20 pl-3">
                    {block.content}
                  </p>
                </div>
              ))}
              {filteredBlocks.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2 py-10">
                      <MessageSquare className="w-8 h-8 opacity-20" />
                      <p>Este orador foi detectado na transcrição mas não possui blocos atribuídos ainda.</p>
                  </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
            <Users className="w-12 h-12 opacity-20" />
            <p>Selecione um orador para visualizar suas falas</p>
          </div>
        )}
      </div>

      {/* Merge Speakers Modal */}
      <Dialog open={isMergeModalOpen} onOpenChange={setIsMergeModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle>Mesclar Oradores</DialogTitle>
                <DialogDescription>
                    Selecione os oradores que deseja unificar sob um único nome. Isso é útil para corrigir variações (ex: "JOÃO" e "VEREADOR JOÃO").
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label>Nome Final (Destino)</Label>
                    <Input 
                        value={targetMergeName} 
                        onChange={(e) => setTargetMergeName(e.target.value)} 
                        placeholder="Nome que será mantido..."
                    />
                </div>
                <div className="space-y-2">
                    <Label>Oradores para mesclar (Origem)</Label>
                    <div className="border rounded-md max-h-[200px] overflow-y-auto p-2 space-y-1">
                        {speakersList.map(s => (
                            <div key={s.name} className="flex items-center space-x-2 hover:bg-muted/50 p-1.5 rounded cursor-pointer" onClick={() => {
                                if (speakersToMerge.includes(s.name)) {
                                    setSpeakersToMerge(speakersToMerge.filter(n => n !== s.name));
                                } else {
                                    setSpeakersToMerge([...speakersToMerge, s.name]);
                                }
                            }}>
                                <Checkbox 
                                    checked={speakersToMerge.includes(s.name)} 
                                    onCheckedChange={(checked) => {
                                        if (checked) setSpeakersToMerge([...speakersToMerge, s.name]);
                                        else setSpeakersToMerge(speakersToMerge.filter(n => n !== s.name));
                                    }}
                                />
                                <span className="text-sm flex-1">{s.name}</span>
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded">{s.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsMergeModalOpen(false)}>Cancelar</Button>
                <Button onClick={executeMerge} disabled={!targetMergeName || speakersToMerge.length === 0}>Confirmar Mesclagem</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    );
}
