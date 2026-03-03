import { useState, useEffect, useMemo, useCallback } from 'react';

interface TranscriptSearchResult {
    parts: string[];
    count: number;
}

export interface TranscriptSearch {
    transcriptSearch: string;
    setTranscriptSearch: (value: string) => void;
    currentMatchIndex: number;
    searchResult: TranscriptSearchResult;
    scrollToMatch: (index: number) => void;
    handlePrevMatch: () => void;
    handleNextMatch: () => void;
}

export function useTranscriptSearch(fullTranscript: string): TranscriptSearch {
    const [transcriptSearch, setTranscriptSearch] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    const searchResult = useMemo(() => {
        if (!transcriptSearch || !fullTranscript) return { parts: [fullTranscript], count: 0 };
        try {
            const escapedSearch = transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const parts = fullTranscript.split(new RegExp(`(${escapedSearch})`, 'gi'));
            const count = Math.floor(parts.length / 2);
            return { parts, count };
        } catch {
            return { parts: [fullTranscript], count: 0 };
        }
    }, [fullTranscript, transcriptSearch]);

    useEffect(() => {
        setCurrentMatchIndex(0);
    }, [transcriptSearch]);

    const scrollToMatch = useCallback((index: number) => {
        setTimeout(() => {
            const element = document.getElementById(`match-${index}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 10);
    }, []);

    const handlePrevMatch = useCallback(() => {
        if (searchResult.count === 0) return;
        const newIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : searchResult.count - 1;
        setCurrentMatchIndex(newIndex);
        scrollToMatch(newIndex);
    }, [searchResult.count, currentMatchIndex, scrollToMatch]);

    const handleNextMatch = useCallback(() => {
        if (searchResult.count === 0) return;
        const newIndex = currentMatchIndex < searchResult.count - 1 ? currentMatchIndex + 1 : 0;
        setCurrentMatchIndex(newIndex);
        scrollToMatch(newIndex);
    }, [searchResult.count, currentMatchIndex, scrollToMatch]);

    return {
        transcriptSearch,
        setTranscriptSearch,
        currentMatchIndex,
        searchResult,
        scrollToMatch,
        handlePrevMatch,
        handleNextMatch,
    };
}
