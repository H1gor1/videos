/**
 * Pilha Transacional de Undo/Redo para Edições do Projeto (Adaptado de OpenMotion Studio — Apache-2.0)
 * Origem: /home/higorlino/openmotion/studio/src/hooks/usePersistentEditHistory.ts
 */
import { useCallback, useRef, useState } from 'react';
import type { Project } from '@kinema/core';

export interface EditHistoryEntry<T = Project> {
  id: string;
  label: string;
  timestamp: number;
  before: T;
  after: T;
}

export class EditHistoryManager<T = Project> {
  private past: EditHistoryEntry<T>[] = [];
  private future: EditHistoryEntry<T>[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  public record(label: string, before: T, after: T): EditHistoryEntry<T> {
    const entry: EditHistoryEntry<T> = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: Date.now(),
      before: structuredClone(before),
      after: structuredClone(after),
    };
    this.past.push(entry);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future = [];
    return entry;
  }

  public undo(): EditHistoryEntry<T> | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return entry;
  }

  public redo(): EditHistoryEntry<T> | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    return entry;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public getPast(): ReadonlyArray<EditHistoryEntry<T>> {
    return this.past;
  }

  public getFuture(): ReadonlyArray<EditHistoryEntry<T>> {
    return this.future;
  }

  public clear(): void {
    this.past = [];
    this.future = [];
  }
}

export function useEditHistory(onApplyProjectState: (nextProject: Project, actionLabel: string) => Promise<void> | void) {
  const managerRef = useRef(new EditHistoryManager<Project>(50));
  const [, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const recordEdit = useCallback(
    (label: string, before: Project, after: Project) => {
      managerRef.current.record(label, before, after);
      bump();
    },
    [bump]
  );

  const undo = useCallback(async () => {
    const entry = managerRef.current.undo();
    bump();
    if (!entry) return null;
    await onApplyProjectState(entry.before, `Desfazer: ${entry.label}`);
    return entry;
  }, [bump, onApplyProjectState]);

  const redo = useCallback(async () => {
    const entry = managerRef.current.redo();
    bump();
    if (!entry) return null;
    await onApplyProjectState(entry.after, `Refazer: ${entry.label}`);
    return entry;
  }, [bump, onApplyProjectState]);

  const clearHistory = useCallback(() => {
    managerRef.current.clear();
    bump();
  }, [bump]);

  return {
    recordEdit,
    undo,
    redo,
    clearHistory,
    canUndo: managerRef.current.canUndo(),
    canRedo: managerRef.current.canRedo(),
    pastEntries: managerRef.current.getPast(),
    futureEntries: managerRef.current.getFuture(),
  };
}
