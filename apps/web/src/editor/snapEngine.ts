/**
 * Motor de Snapping Magnético e Guias Inteligentes (Adaptado de OpenMotion Studio — Apache-2.0)
 * Origem: /home/higorlino/openmotion/studio/src/components/editor/snapEngine.ts
 * Modificado para suportar Safe Areas 9:16 (Reels/Shorts), coordenadas 720×1280 e guias de equidistância.
 */

export const SNAP_THRESHOLD_PX = 8;
const SNAP_ENGAGE_TRAVEL_PX = 3;
const EQUIDISTANCE_TOLERANCE_PX = 2;

export function snapEngagedForTravel(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SNAP_ENGAGE_TRAVEL_PX;
}

export interface SnapEdge {
  position: number;
  source: 'grid' | 'safe-area';
  id: string;
}

export interface SnapTarget {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  id: string;
  label?: string;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
  label?: string;
  kind?: 'center' | 'safe-area' | 'element' | 'edge';
}

export interface SpacingGuide {
  axis: 'x' | 'y';
  position: number;
  size: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  spacingGuides: SpacingGuide[];
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectRight(r: Rect): number {
  return r.left + r.width;
}
function rectBottom(r: Rect): number {
  return r.top + r.height;
}
function rectCenterX(r: Rect): number {
  return r.left + r.width / 2;
}
function rectCenterY(r: Rect): number {
  return r.top + r.height / 2;
}

export function extractSnapTargets(entries: Array<{ rect: Rect; id: string; label?: string }>): SnapTarget[] {
  return entries.map(({ rect: r, id, label }) => ({
    left: r.left,
    top: r.top,
    right: rectRight(r),
    bottom: rectBottom(r),
    centerX: rectCenterX(r),
    centerY: rectCenterY(r),
    id,
    label,
  }));
}

export function buildCompositionSnapTarget(rect: Rect): SnapTarget {
  return {
    left: rect.left,
    top: rect.top,
    right: rectRight(rect),
    bottom: rectBottom(rect),
    centerX: rectCenterX(rect),
    centerY: rectCenterY(rect),
    id: 'composition',
    label: 'Canvas 9:16',
  };
}

export function buildSafeAreaSnapTarget(
  safeArea: { topPx: number; bottomPx: number; leftPx: number; rightPx: number },
  compWidth = 720,
  compHeight = 1280
): SnapTarget {
  const left = safeArea.leftPx;
  const top = safeArea.topPx;
  const right = compWidth - safeArea.rightPx;
  const bottom = compHeight - safeArea.bottomPx;
  return {
    left,
    top,
    right,
    bottom,
    centerX: compWidth / 2,
    centerY: compHeight / 2,
    id: 'safe-area',
    label: 'Safe Area 9:16',
  };
}

interface EdgeCandidate {
  adjustment: number;
  distance: number;
  guidePosition: number;
  source: 'element' | 'composition' | 'safe-area' | 'grid';
  targetId: string;
  kind: 'center' | 'safe-area' | 'element' | 'edge';
}

function collectCandidates(
  movingEdges: number[],
  targets: SnapTarget[],
  targetEdgeExtractor: (t: SnapTarget) => Array<{ pos: number; kind: 'center' | 'safe-area' | 'element' | 'edge' }>,
  threshold: number
): EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];
  for (const target of targets) {
    const tEdges = targetEdgeExtractor(target);
    for (const mEdge of movingEdges) {
      for (const tEdge of tEdges) {
        const adjustment = tEdge.pos - mEdge;
        const distance = Math.abs(adjustment);
        if (distance <= threshold) {
          candidates.push({
            adjustment,
            distance,
            guidePosition: tEdge.pos,
            source:
              target.id === 'composition'
                ? 'composition'
                : target.id === 'safe-area'
                  ? 'safe-area'
                  : 'element',
            targetId: target.id,
            kind: tEdge.kind,
          });
        }
      }
    }
  }
  return candidates;
}

function pickBest(candidates: EdgeCandidate[]): {
  adjustment: number;
  matches: EdgeCandidate[];
} | null {
  if (candidates.length === 0) return null;
  const minDist = Math.min(...candidates.map((c) => c.distance));
  const winners = candidates.filter((c) => c.distance === minDist);
  const adjustment = winners[0].adjustment;
  const matches = candidates.filter((c) => Math.abs(c.adjustment - adjustment) < 0.5);
  return { adjustment, matches };
}

export function resolveSnapAdjustment(input: {
  movingRect: Rect;
  proposedDx: number;
  proposedDy: number;
  targets: SnapTarget[];
  threshold?: number;
  disabled?: boolean;
  compWidth?: number;
  compHeight?: number;
}): SnapResult {
  const threshold = input.threshold ?? SNAP_THRESHOLD_PX;
  const compW = input.compWidth ?? 720;
  const compH = input.compHeight ?? 1280;

  if (input.disabled || !snapEngagedForTravel(input.proposedDx, input.proposedDy)) {
    return {
      dx: input.proposedDx,
      dy: input.proposedDy,
      guides: [],
      spacingGuides: [],
    };
  }

  const mr = input.movingRect;
  const proposed: Rect = {
    left: mr.left + input.proposedDx,
    top: mr.top + input.proposedDy,
    width: mr.width,
    height: mr.height,
  };

  const xCandidates = collectCandidates(
    [proposed.left, rectCenterX(proposed), rectRight(proposed)],
    input.targets,
    (t) => [
      { pos: t.left, kind: t.id === 'safe-area' ? 'safe-area' : t.id === 'composition' ? 'edge' : 'element' },
      { pos: t.centerX, kind: t.id === 'composition' || t.id === 'safe-area' ? 'center' : 'element' },
      { pos: t.right, kind: t.id === 'safe-area' ? 'safe-area' : t.id === 'composition' ? 'edge' : 'element' },
    ],
    threshold
  );

  const yCandidates = collectCandidates(
    [proposed.top, rectCenterY(proposed), rectBottom(proposed)],
    input.targets,
    (t) => [
      { pos: t.top, kind: t.id === 'safe-area' ? 'safe-area' : t.id === 'composition' ? 'edge' : 'element' },
      { pos: t.centerY, kind: t.id === 'composition' || t.id === 'safe-area' ? 'center' : 'element' },
      { pos: t.bottom, kind: t.id === 'safe-area' ? 'safe-area' : t.id === 'composition' ? 'edge' : 'element' },
    ],
    threshold
  );

  const bestX = pickBest(xCandidates);
  const bestY = pickBest(yCandidates);

  const adjustedDx = input.proposedDx + (bestX?.adjustment ?? 0);
  const adjustedDy = input.proposedDy + (bestY?.adjustment ?? 0);

  const adjustedRect: Rect = {
    left: mr.left + adjustedDx,
    top: mr.top + adjustedDy,
    width: mr.width,
    height: mr.height,
  };

  const guides: SnapGuide[] = [];
  if (bestX) {
    const pos = Math.round(bestX.matches[0].guidePosition);
    guides.push({
      axis: 'x',
      position: pos,
      from: 0,
      to: compH,
      kind: bestX.matches[0].kind,
      label: pos === Math.round(compW / 2) ? 'CENTRO X (360px)' : `${pos}px`,
    });
  }
  if (bestY) {
    const pos = Math.round(bestY.matches[0].guidePosition);
    guides.push({
      axis: 'y',
      position: pos,
      from: 0,
      to: compW,
      kind: bestY.matches[0].kind,
      label: pos === Math.round(compH / 2) ? 'CENTRO Y (640px)' : `${pos}px`,
    });
  }

  const spacingGuides = resolveEquidistanceGuides({
    movingRect: adjustedRect,
    targets: input.targets.filter((t) => t.id !== 'composition' && t.id !== 'safe-area'),
    threshold,
  });

  return {
    dx: adjustedDx,
    dy: adjustedDy,
    guides,
    spacingGuides,
  };
}

export function resolveEquidistanceGuides(input: {
  movingRect: Rect;
  targets: SnapTarget[];
  threshold: number;
}): SpacingGuide[] {
  const guides: SpacingGuide[] = [];
  const mr = input.movingRect;
  const movingTarget: SnapTarget = {
    left: mr.left,
    top: mr.top,
    right: rectRight(mr),
    bottom: rectBottom(mr),
    centerX: rectCenterX(mr),
    centerY: rectCenterY(mr),
    id: '__moving__',
  };
  const allTargets = [...input.targets, movingTarget];

  const sortedY = [...allTargets].sort((a, b) => a.centerY - b.centerY);
  for (let i = 0; i < sortedY.length - 2; i++) {
    const a = sortedY[i];
    const b = sortedY[i + 1];
    const c = sortedY[i + 2];
    const gapAB = b.top - a.bottom;
    const gapBC = c.top - b.bottom;
    if (gapAB < 0 || gapBC < 0) continue;
    const involvesMoving = a.id === '__moving__' || b.id === '__moving__' || c.id === '__moving__';
    if (!involvesMoving) continue;
    if (Math.abs(gapAB - gapBC) <= EQUIDISTANCE_TOLERANCE_PX) {
      const crossMin = Math.min(a.left, b.left, c.left);
      const crossMax = Math.max(a.right, b.right, c.right);
      guides.push({ axis: 'y', position: a.bottom, size: Math.round(gapAB), from: crossMin, to: crossMax });
      guides.push({ axis: 'y', position: b.bottom, size: Math.round(gapBC), from: crossMin, to: crossMax });
    }
  }
  return guides;
}
