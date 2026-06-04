import { useState, useCallback, useRef, useEffect } from 'react';
import { parseJsonl } from '../lib/parser';

export function useFileHandler(
  addSession: (raw: string, fileName?: string) => void,
  setLoading: (v: boolean) => void,
) {
  const [dragOver, setDragOver] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter(
        (f) => f.name.endsWith('.jsonl') || f.name.endsWith('.json') || f.type === 'text/plain',
      );
      if (valid.length === 0) return;
      let completed = 0;
      const total = valid.length;
      for (const file of valid) {
        const reader = new FileReader();
        reader.onload = () => {
          addSession(reader.result as string, file.name);
          completed++;
          if (completed >= total) setLoading(false);
        };
        reader.onerror = () => {
          console.error('Failed to read file', file.name);
          completed++;
          if (completed >= total) setLoading(false);
        };
        reader.readAsText(file);
      }
      if (valid.length > 0) setLoading(true);
    },
    [addSession, setLoading],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(e.target.files ?? []));
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      addSession(text, 'sample.jsonl');
    } catch (e) {
      console.error('Failed to load sample', e);
      setLoading(false);
    }
  }, [addSession, setLoading]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text || text.trim()[0] !== '{') return;
      const parsed = parseJsonl(text);
      if (parsed.length === 0) return;
      e.preventDefault();
      addSession(text);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 600);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addSession]);

  return {
    dragOver,
    pasteFlash,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileSelect,
    loadSample,
  };
}
