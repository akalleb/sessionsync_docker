import { useState, useMemo, useCallback } from 'react';
import { TranscriptionBlock } from '@/types/transcription';

interface SpeakerStats {
  name: string;
  count: number;
}

export function useSpeakerDetection(
  blocks: TranscriptionBlock[], 
  fullTranscript: string,
  onBlocksChange: (blocks: TranscriptionBlock[]) => void
) {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  // Detect speakers from blocks and transcript patterns
  const speakersList = useMemo(() => {
    const speakerCounts = new Map<string, number>();
    
    // 1. From existing blocks metadata
    blocks.forEach(b => {
      if (b.speaker) {
        const name = b.speaker.trim().toUpperCase();
        speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1);
      }
    });

    // 2. From Transcript Patterns (Regex)
    // Matches: "VEREADOR X:", "PRESIDENTE:", "SR. Y:", "[NOME]:"
    const patterns = [
      /(?:VEREADOR|PRESIDENTE|SR\.|SRA\.|DR\.|DRA\.)\s+([A-ZÀ-Ú\s]+):/gi,
      /\[([A-ZÀ-Ú\s]+)\]:/gi,
      /^([A-ZÀ-Ú\s]{3,20}):/gm // Start of line uppercase name
    ];

    patterns.forEach(regex => {
      let match;
      while ((match = regex.exec(fullTranscript)) !== null) {
        const name = match[1].trim().toUpperCase();
        if (name.length > 2 && name.length < 30 && !['ATA', 'SESSÃO', 'VOTAÇÃO'].includes(name)) {
             // Only add if not already present from blocks (to avoid double counting context, though here we just want discovery)
             // We give a small weight or just ensure it exists
             if (!speakerCounts.has(name)) {
                 speakerCounts.set(name, 0); // Found in text but not assigned to blocks yet
             }
        }
      }
    });

    return Array.from(speakerCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [blocks, fullTranscript]);

  const filteredBlocks = useMemo(() => {
    if (!selectedSpeaker) return [];
    return blocks.filter(b => b.speaker?.toUpperCase() === selectedSpeaker);
  }, [blocks, selectedSpeaker]);

  const handleMergeSpeakers = useCallback((targetName: string, sourceNames: string[]) => {
    const newBlocks = blocks.map(b => {
      if (b.speaker && sourceNames.includes(b.speaker.toUpperCase())) {
        return { ...b, speaker: targetName };
      }
      return b;
    });
    onBlocksChange(newBlocks);
    setSelectedSpeaker(targetName);
  }, [blocks, onBlocksChange]);

  const handleRenameSpeaker = useCallback((oldName: string, newName: string) => {
    const newBlocks = blocks.map(b => {
        if (b.speaker?.toUpperCase() === oldName.toUpperCase()) {
            return { ...b, speaker: newName };
        }
        return b;
    });
    onBlocksChange(newBlocks);
    if (selectedSpeaker === oldName) setSelectedSpeaker(newName);
  }, [blocks, onBlocksChange, selectedSpeaker]);

  return {
    speakersList,
    selectedSpeaker,
    setSelectedSpeaker,
    filteredBlocks,
    handleMergeSpeakers,
    handleRenameSpeaker
  };
}
