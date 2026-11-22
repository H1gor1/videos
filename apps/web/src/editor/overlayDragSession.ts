export interface Rect720 {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeHandleKind = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type OverlayGestureKind = 'move' | 'rotate' | ResizeHandleKind;

export const ALL_RESIZE_HANDLES: readonly ResizeHandleKind[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const;

/**
 * Calcula o novo retângulo (720×1280) ao arrastar qualquer um dos 8 handles de redimensionamento,
 * preservando tamanho mínimo e mantendo âncora oposta fixa.
 */
export function computeResizedRect720(
  initial: Rect720,
  handle: ResizeHandleKind,
  dx720: number,
  dy720: number,
  minWidth = 96,
  minHeight = 36
): Rect720 {
  let left = initial.left;
  let top = initial.top;
  let width = initial.width;
  let height = initial.height;

  const hasW = handle === 'nw' || handle === 'w' || handle === 'sw';
  const hasE = handle === 'ne' || handle === 'e' || handle === 'se';
  const hasN = handle === 'nw' || handle === 'n' || handle === 'ne';
  const hasS = handle === 'sw' || handle === 's' || handle === 'se';

  if (hasW) {
    const maxLeft = initial.left + initial.width - minWidth;
    left = Math.round(Math.min(maxLeft, initial.left + dx720));
    width = Math.round(initial.left + initial.width - left);
  } else if (hasE) {
    width = Math.round(Math.max(minWidth, initial.width + dx720));
  }

  if (hasN) {
    const maxTop = initial.top + initial.height - minHeight;
    top = Math.round(Math.min(maxTop, initial.top + dy720));
    height = Math.round(initial.top + initial.height - top);
  } else if (hasS) {
    height = Math.round(Math.max(minHeight, initial.height + dy720));
  }

  return { left, top, width, height };
}

/**
 * Controlador determinístico de sessão de arraste/transformação.
 * Garante:
 * - atualizações ao vivo via `onLiveUpdate` durante `pointermove` sem disparar `onCommit`;
 * - no máximo UM commit no `pointerup` (`finish()`);
 * - cancelamento limpo via Esc (`cancel()`) sem gerar entrada no histórico.
 */
export class DragCommitSession<TPatch> {
  private latestPatch: TPatch | null = null;
  private cancelled = false;
  private committed = false;

  constructor(
    private readonly callbacks: {
      onLiveUpdate: (patch: TPatch) => void;
      onCommit: (patch: TPatch) => void;
      onCancel: () => void;
    }
  ) {}

  public update(patch: TPatch): void {
    if (this.cancelled || this.committed) return;
    this.latestPatch = patch;
    this.callbacks.onLiveUpdate(patch);
  }

  public cancel(): void {
    if (this.cancelled || this.committed) return;
    this.cancelled = true;
    this.latestPatch = null;
    this.callbacks.onCancel();
  }

  public finish(): boolean {
    if (this.cancelled || this.committed) return false;
    this.committed = true;
    const patch = this.latestPatch;
    this.latestPatch = null;
    if (patch !== null) {
      this.callbacks.onCommit(patch);
      return true;
    }
    this.callbacks.onCancel();
    return false;
  }

  public isActive(): boolean {
    return !this.cancelled && !this.committed;
  }
}
