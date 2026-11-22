import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CameraKeyframeOverride,
  CaptionStyle,
  Character,
  CharacterPose,
  DesignKit,
  OverlayItem,
  Scene,
  SceneObjectOverride,
} from '@kinema/core';
import { createScene3DEngine } from '@kinema/scenes';
import {
  buildWordCaptionGroups,
  computeOverlayLayoutZones,
  estimateProportionalWordTimestamps,
} from '@kinema/overlays';
import {
  buildCompositionSnapTarget,
  buildSafeAreaSnapTarget,
  extractSnapTargets,
  resolveSnapAdjustment,
  type Rect,
  type SnapGuide,
  type SpacingGuide,
} from '../editor/snapEngine.ts';

export interface Scene3DObjectDescriptor {
  id: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  hidden: boolean;
}

export interface ScenePreviewProps {
  mode: 'scene';
  scene: Scene;
  character: Character;
  secondaryCharacters?: Character[];
  captionStyle?: CaptionStyle;
  designKit?: DesignKit;
  isPlaying?: boolean;
  currentTime?: number;
  // Edição visual 2D + 3D estilo Figma
  interactive?: boolean;
  canvasTool?: '2d' | '3d' | 'camera';
  gizmoMode?: 'translate' | 'rotate' | 'scale';
  showSafeAreas?: boolean;
  snapEnabled?: boolean;
  selectedOverlayIndices?: number[];
  onSelectOverlays?: (indices: number[]) => void;
  onOverlayCommit?: (index: number, patch: Partial<OverlayItem>, label: string) => void;
  onOverlaysBatchCommit?: (nextOverlays: OverlayItem[], label: string) => void;
  selectedObject3DId?: string | null;
  onSelectObject3D?: (objectId: string | null) => void;
  onObject3DCommit?: (objectId: string, override: SceneObjectOverride, label: string) => void;
  onCatalogObjects3D?: (objects: Scene3DObjectDescriptor[]) => void;
  onCameraKeyframeCommit?: (cameraOverride: CameraKeyframeOverride | undefined, label: string) => void;
  onCaptionPositionCommit?: (positionY: number) => void;
}

export interface CharacterOrbitProps {
  mode: 'character';
  character: Character;
  pose: CharacterPose;
}

export type ThreeViewportProps = ScenePreviewProps | CharacterOrbitProps;

// Coordenadas lógicas do vídeo são 720×1280; o viewport renderiza em 360×640 (escala 0.5)
const COMP_W = 720;
const COMP_H = 1280;
const VIEW_W = 360;
const VIEW_H = 640;
const SCALE = VIEW_W / COMP_W; // 0.5

function defaultOverlayRect720(
  ov: OverlayItem,
  idx: number,
  zones: ReturnType<typeof computeOverlayLayoutZones>
): Rect {
  if (ov.x !== undefined && ov.y !== undefined) {
    return {
      left: ov.x,
      top: ov.y,
      width: ov.width || (ov.type === 'title' ? 620 : ov.type === 'badge' ? 320 : 340),
      height: ov.height || (ov.type === 'title' ? 110 : ov.type === 'badge' ? 48 : 84),
    };
  }
  if (ov.type === 'title') {
    const top = ov.position === 'center' ? Math.round(COMP_H * 0.34) : 96;
    return { left: 50, top, width: ov.width || 620, height: ov.height || 110 };
  }
  if (ov.type === 'badge') {
    return { left: 200, top: 224 + idx * 14, width: ov.width || 320, height: ov.height || 48 };
  }
  if (ov.type === 'lower-third') {
    const top = COMP_H - zones.lowerMiddle.cssBottomPx * 2 - 84;
    return { left: 36, top: Math.max(600, top), width: ov.width || 360, height: ov.height || 86 };
  }
  if (ov.type === 'role-banner') {
    return { left: 60, top: 120, width: ov.width || 600, height: ov.height || 92 };
  }
  if (ov.type === 'counter') {
    return { left: 410, top: 112, width: ov.width || 274, height: ov.height || 126 };
  }
  if (ov.type === 'watermark') {
    return { left: 480, top: 48, width: ov.width || 200, height: ov.height || 42 };
  }
  return { left: 60, top: 120 + idx * 70, width: 320, height: 64 };
}

export const ThreeViewport: React.FC<ThreeViewportProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [orbit, setOrbit] = useState({ yaw: 0.25, pitch: 0.12, distance: 4.8 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; yaw0: number; pitch0: number }>({
    active: false,
    startX: 0,
    startY: 0,
    yaw0: 0,
    pitch0: 0,
  });
  const [localTime, setLocalTime] = useState(0);

  // Estado de drag/resize/rotate 2D no canvas
  const [draftOverlayRects, setDraftOverlayRects] = useState<Record<number, Partial<OverlayItem>>>({});
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([]);
  const [inlineEditIdx, setInlineEditIdx] = useState<number | null>(null);
  const [inlineEditText, setInlineEditText] = useState<string>('');
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  // Estado 3D (TransformControls + câmera interativa + projeção 2D do pivô do objeto selecionado)
  const [gizmoScreenPos, setGizmoScreenPos] = useState<{
    x: number;
    y: number;
    objectId: string;
    label: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  } | null>(null);
  const [liveCameraState, setLiveCameraState] = useState<{
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  } | null>(null);

  const stageControllerRef = useRef<any>(null);

  // ==========================================================================
  // MODO 1: PREVIEW 3D AO VIVO + RAYCAST + TRANSFORMCONTROLS + ORBITCONTROLS
  // ==========================================================================
  useEffect(() => {
    if (props.mode !== 'scene') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createScene3DEngine(THREE);
    const controller = engine.mountScene3DCanvas(canvas, VIEW_W, VIEW_H, [
      {
        id: props.scene.id,
        startTime: 0,
        duration: props.scene.duration || 4.0,
        template: props.scene.template,
        templateProps: props.scene.templateProps || {},
        character: props.character,
        secondaryCharacters: props.secondaryCharacters || [],
        pose: props.scene.pose,
        camera: props.scene.camera,
        objectOverrides: props.scene.objectOverrides || {},
        cameraOverride: props.scene.cameraOverride,
        designKit: props.designKit,
      },
    ]);
    stageControllerRef.current = controller;

    const built = controller.builtScenes?.[0];
    if (built && props.onCatalogObjects3D) {
      const catalog: Scene3DObjectDescriptor[] = (built.selectableList || []).map((item: any) => {
        const ov = props.scene.objectOverrides?.[item.id];
        const obj = item.object;
        return {
          id: item.id,
          label: ov?.label || item.label,
          position: ov?.position || [
            Number(obj.position.x.toFixed(2)),
            Number(obj.position.y.toFixed(2)),
            Number(obj.position.z.toFixed(2)),
          ],
          rotation: ov?.rotation || [
            Number(obj.rotation.x.toFixed(2)),
            Number(obj.rotation.y.toFixed(2)),
            Number(obj.rotation.z.toFixed(2)),
          ],
          scale: ov?.scale || [
            Number(obj.scale.x.toFixed(2)),
            Number(obj.scale.y.toFixed(2)),
            Number(obj.scale.z.toFixed(2)),
          ],
          hidden: Boolean(ov?.hidden),
        };
      });
      props.onCatalogObjects3D(catalog);
    }

    // Configura TransformControls de three/examples/jsm quando um objeto 3D está selecionado
    let transformControls: TransformControls | null = null;
    let transformHelper: THREE.Object3D | null = null;
    let orbitControls: OrbitControls | null = null;
    let isDraggingGizmo = false;

    if (props.interactive && built) {
      if (props.canvasTool === '3d' && props.selectedObject3DId) {
        const targetObj = built.selectableMap?.get(props.selectedObject3DId);
        if (targetObj) {
          transformControls = new TransformControls(controller.camera, canvas);
          transformControls.setMode(props.gizmoMode || 'translate');
          transformControls.setSize(1.1);
          transformControls.attach(targetObj);
          transformHelper = transformControls.getHelper();
          built.threeScene.add(transformHelper);

          transformControls.addEventListener('dragging-changed', (event: any) => {
            isDraggingGizmo = Boolean(event.value);
            if (!event.value && targetObj && props.onObject3DCommit && props.selectedObject3DId) {
              const nextOv: SceneObjectOverride = {
                ...(props.scene.objectOverrides?.[props.selectedObject3DId] || {}),
                position: [
                  Number(targetObj.position.x.toFixed(2)),
                  Number(targetObj.position.y.toFixed(2)),
                  Number(targetObj.position.z.toFixed(2)),
                ],
                rotation: [
                  Number(targetObj.rotation.x.toFixed(2)),
                  Number(targetObj.rotation.y.toFixed(2)),
                  Number(targetObj.rotation.z.toFixed(2)),
                ],
                scale: [
                  Number(targetObj.scale.x.toFixed(2)),
                  Number(targetObj.scale.y.toFixed(2)),
                  Number(targetObj.scale.z.toFixed(2)),
                ],
              };
              props.onObject3DCommit(
                props.selectedObject3DId,
                nextOv,
                `Mover/Transformar Objeto 3D (${props.selectedObject3DId})`
              );
            }
          });
        }
      }

      if (props.canvasTool === 'camera') {
        orbitControls = new OrbitControls(controller.camera, canvas);
        orbitControls.enableDamping = false;
        const f = built.framing;
        if (props.scene.cameraOverride) {
          controller.camera.position.set(...props.scene.cameraOverride.position);
          orbitControls.target.set(...props.scene.cameraOverride.target);
        } else if (f) {
          orbitControls.target.set(f.lookX, f.lookY, f.lookZ);
        }
        orbitControls.update();
        orbitControls.addEventListener('change', () => {
          setLiveCameraState({
            position: [
              Number(controller.camera.position.x.toFixed(2)),
              Number(controller.camera.position.y.toFixed(2)),
              Number(controller.camera.position.z.toFixed(2)),
            ],
            target: [
              Number(orbitControls!.target.x.toFixed(2)),
              Number(orbitControls!.target.y.toFixed(2)),
              Number(orbitControls!.target.z.toFixed(2)),
            ],
            fov: controller.camera.fov,
          });
        });
      }
    }

    let rafId = 0;
    const startMs = performance.now();
    const dur = Math.max(1, props.scene.duration || 4.0);

    const updateSelectedGizmoProjection = () => {
      if (!built || !props.selectedObject3DId) {
        setGizmoScreenPos(null);
        return;
      }
      const targetObj = built.selectableMap?.get(props.selectedObject3DId);
      if (!targetObj) {
        setGizmoScreenPos(null);
        return;
      }
      const box = new THREE.Box3().setFromObject(targetObj);
      const center = new THREE.Vector3();
      if (!box.isEmpty()) {
        box.getCenter(center);
      } else {
        targetObj.getWorldPosition(center);
      }
      const projected = center.clone().project(controller.camera);
      const sx = ((projected.x + 1) / 2) * VIEW_W;
      const sy = ((-projected.y + 1) / 2) * VIEW_H;
      setGizmoScreenPos({
        x: Math.max(24, Math.min(VIEW_W - 24, sx)),
        y: Math.max(24, Math.min(VIEW_H - 24, sy)),
        objectId: props.selectedObject3DId,
        label: targetObj.userData?.objectLabel || props.selectedObject3DId,
        position: [
          Number(targetObj.position.x.toFixed(2)),
          Number(targetObj.position.y.toFixed(2)),
          Number(targetObj.position.z.toFixed(2)),
        ],
        rotation: [
          Number(targetObj.rotation.x.toFixed(2)),
          Number(targetObj.rotation.y.toFixed(2)),
          Number(targetObj.rotation.z.toFixed(2)),
        ],
        scale: [
          Number(targetObj.scale.x.toFixed(2)),
          Number(targetObj.scale.y.toFixed(2)),
          Number(targetObj.scale.z.toFixed(2)),
        ],
      });
    };

    const tick = () => {
      const t =
        props.currentTime !== undefined
          ? Math.max(0, Math.min(dur - 0.01, props.currentTime))
          : ((performance.now() - startMs) / 1000) % dur;
      setLocalTime(t);

      if (!isDraggingGizmo && props.canvasTool !== 'camera') {
        controller.renderAtTime(t);
      } else if (built) {
        if (orbitControls) orbitControls.update();
        controller.renderer.render(built.threeScene, controller.camera);
      }

      updateSelectedGizmoProjection();

      if (
        (props.isPlaying !== false && props.currentTime === undefined) ||
        props.canvasTool === '3d' ||
        props.canvasTool === 'camera'
      ) {
        rafId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      cancelAnimationFrame(rafId);
      if (transformControls) {
        transformControls.detach();
        transformControls.dispose();
      }
      if (transformHelper && built) {
        built.threeScene.remove(transformHelper);
      }
      if (orbitControls) {
        orbitControls.dispose();
      }
      controller.dispose();
    };
  }, [
    props.mode,
    props.mode === 'scene' ? JSON.stringify(props.scene) : '',
    props.mode === 'scene' ? JSON.stringify(props.character) : '',
    props.mode === 'scene' ? JSON.stringify(props.designKit) : '',
    props.mode === 'scene' ? props.currentTime : 0,
    props.mode === 'scene' ? props.isPlaying : true,
    props.mode === 'scene' ? props.canvasTool : '2d',
    props.mode === 'scene' ? props.gizmoMode : 'translate',
    props.mode === 'scene' ? props.selectedObject3DId : null,
  ]);

  // ==========================================================================
  // MODO 2: EDITOR DE PERSONAGEM 3D ORBITÁVEL (360° + ZOOM)
  // ==========================================================================
  useEffect(() => {
    if (props.mode !== 'character') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createScene3DEngine(THREE);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(360, 560, false);
    renderer.shadowMap.enabled = true;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color('#0f172a');

    const grid = new THREE.GridHelper(10, 10, '#f5c518', '#1e293b');
    threeScene.add(grid);

    const ambient = new THREE.AmbientLight('#ffffff', 1.4);
    threeScene.add(ambient);
    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.9);
    keyLight.position.set(4, 7, 5);
    threeScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.8);
    rimLight.position.set(-4, 3, -4);
    threeScene.add(rimLight);

    const charGroup = engine.createBlockyCharacter(props.character);
    threeScene.add(charGroup);

    const camera = new THREE.PerspectiveCamera(40, 360 / 560, 0.1, 100);
    let rafId = 0;
    const startMs = performance.now();

    const animate = () => {
      const t = (performance.now() - startMs) / 1000;
      engine.applyCharacterPose(charGroup, props.pose, t);

      const cx = Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.distance;
      const cy = 1.55 + Math.sin(orbit.pitch) * orbit.distance;
      const cz = Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.distance;
      camera.position.set(cx, Math.max(0.4, cy), cz);
      camera.lookAt(0, 1.45, 0);

      renderer.render(threeScene, camera);
      rafId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  }, [
    props.mode,
    props.mode === 'character' ? JSON.stringify(props.character) : '',
    props.mode === 'character' ? props.pose : 'idle',
    orbit.yaw,
    orbit.pitch,
    orbit.distance,
  ]);

  if (props.mode === 'character') {
    return (
      <div
        style={{
          position: 'relative',
          width: 360,
          height: 560,
          borderRadius: 16,
          overflow: 'hidden',
          border: '2px solid var(--motion-border-strong)',
          cursor: 'grab',
        }}
        onPointerDown={(e) => {
          dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            yaw0: orbit.yaw,
            pitch0: orbit.pitch,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = (e.clientX - dragRef.current.startX) * 0.012;
          const dy = (e.clientY - dragRef.current.startY) * 0.008;
          setOrbit((prev) => ({
            ...prev,
            yaw: dragRef.current.yaw0 - dx,
            pitch: Math.max(-0.35, Math.min(0.75, dragRef.current.pitch0 + dy)),
          }));
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerLeave={() => {
          dragRef.current.active = false;
        }}
        onWheel={(e) => {
          setOrbit((prev) => ({
            ...prev,
            distance: Math.max(2.6, Math.min(8.5, prev.distance + e.deltaY * 0.003)),
          }));
        }}
      >
        <canvas ref={canvasRef} width={360} height={560} style={{ width: '100%', height: '100%', display: 'block' }} />
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 12,
            right: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'rgba(255,255,255,0.75)',
            background: 'rgba(15,23,42,0.75)',
            padding: '4px 10px',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span>Arraste para girar 360° · Scroll para zoom</span>
          <span>Pose: {props.pose}</span>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // INTERAÇÃO RAYCAST 3D + GIZMO 2D/3D NO VIEWPORT DE CENA
  // ==========================================================================
  const dk = props.designKit;
  const primaryColor = dk?.palette.primary || props.captionStyle?.highlightColor || '#f5c518';
  const accentColor = dk?.palette.accent || '#c1121f';
  const surfaceColor = dk?.palette.surface || 'rgba(15,23,42,0.94)';
  const textColor = dk?.palette.text || '#ffffff';
  const textOnPrimary = dk?.palette.textOnPrimary || '#111827';
  const headingFont = dk?.typography.headingFont || 'Anton';
  const bodyFont = dk?.typography.bodyFont || 'Inter';
  const radiusStyle = dk?.borderRadius || '6px';
  const shadowStyle = dk?.shadowStyle || '0 6px 18px rgba(0,0,0,0.45)';
  const safeArea = dk?.safeArea || { topPx: 64, bottomPx: 130, leftPx: 32, rightPx: 32 };

  const zones = computeOverlayLayoutZones(
    props.captionStyle || {
      enabled: true,
      style: 'highlight-yellow',
      wordsPerGroup: 3,
      positionY: 83,
      fontSize: 32,
      highlightColor: primaryColor,
      textColor,
      burnIn: true,
    },
    COMP_W,
    COMP_H
  );

  const overlays = props.scene.overlays || [];
  const selectedIndices = props.selectedOverlayIndices || [];

  // Raycast 3D ao clicar no canvas
  const handleCanvasClick3D = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!props.interactive) return;
    if (props.canvasTool !== '3d') return;
    const ctrl = stageControllerRef.current;
    const built = ctrl?.builtScenes?.[0];
    if (!ctrl || !built || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), ctrl.camera);

    const selectableRoots = (built.selectableList || []).map((s: any) => s.object);
    const hits = raycaster.intersectObjects(selectableRoots, true);

    if (hits.length > 0) {
      let node: any = hits[0].object;
      let foundId: string | null = null;
      while (node) {
        if (node.userData?.selectable3D && node.userData?.objectId) {
          foundId = node.userData.objectId;
          break;
        }
        node = node.parent;
      }
      if (foundId) {
        props.onSelectObject3D?.(foundId);
        return;
      }
    }
  };

  // Drag de eixo do Gizmo 3D visual (permite arrastar X/Y/Z diretamente com precisão determinística)
  const start3DAxisDrag = (axis: 'x' | 'y' | 'z', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!props.selectedObject3DId || !props.onObject3DCommit) return;
    const objId = props.selectedObject3DId;
    const ctrl = stageControllerRef.current;
    const built = ctrl?.builtScenes?.[0];
    const targetObj = built?.selectableMap?.get(objId);
    if (!targetObj) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const mode = props.gizmoMode || 'translate';
    const p0: [number, number, number] = [targetObj.position.x, targetObj.position.y, targetObj.position.z];
    const r0: [number, number, number] = [targetObj.rotation.x, targetObj.rotation.y, targetObj.rotation.z];
    const s0: [number, number, number] = [targetObj.scale.x, targetObj.scale.y, targetObj.scale.z];

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      const delta = axis === 'x' ? dx * 0.015 : axis === 'y' ? -dy * 0.015 : (dx - dy) * 0.015;

      if (mode === 'translate') {
        const nextPos: [number, number, number] = [...p0];
        if (axis === 'x') nextPos[0] = Number((p0[0] + delta).toFixed(2));
        if (axis === 'y') nextPos[1] = Number((p0[1] + delta).toFixed(2));
        if (axis === 'z') nextPos[2] = Number((p0[2] + delta).toFixed(2));
        targetObj.position.set(...nextPos);
      } else if (mode === 'rotate') {
        const nextRot: [number, number, number] = [...r0];
        if (axis === 'x') nextRot[0] = Number((r0[0] + delta * 1.4).toFixed(2));
        if (axis === 'y') nextRot[1] = Number((r0[1] + delta * 1.4).toFixed(2));
        if (axis === 'z') nextRot[2] = Number((r0[2] + delta * 1.4).toFixed(2));
        targetObj.rotation.set(...nextRot);
      } else {
        const factor = Math.max(0.25, 1 + delta * 0.6);
        const nextScale: [number, number, number] = [
          Number((s0[0] * factor).toFixed(2)),
          Number((s0[1] * factor).toFixed(2)),
          Number((s0[2] * factor).toFixed(2)),
        ];
        targetObj.scale.set(...nextScale);
      }
      if (ctrl && built) {
        ctrl.renderer.render(built.threeScene, ctrl.camera);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const nextOv: SceneObjectOverride = {
        ...(props.scene.objectOverrides?.[objId] || {}),
        position: [
          Number(targetObj.position.x.toFixed(2)),
          Number(targetObj.position.y.toFixed(2)),
          Number(targetObj.position.z.toFixed(2)),
        ],
        rotation: [
          Number(targetObj.rotation.x.toFixed(2)),
          Number(targetObj.rotation.y.toFixed(2)),
          Number(targetObj.rotation.z.toFixed(2)),
        ],
        scale: [
          Number(targetObj.scale.x.toFixed(2)),
          Number(targetObj.scale.y.toFixed(2)),
          Number(targetObj.scale.z.toFixed(2)),
        ],
      };
      props.onObject3DCommit?.(objId, nextOv, `Gizmo 3D (${mode} ${axis.toUpperCase()}) em ${objId}`);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Drag / Resize / Rotate de Overlays 2D estilo Figma com Snapping
  const startOverlay2DGesture = (
    idx: number,
    gestureKind: 'move' | 'resize-se' | 'resize-e' | 'resize-s' | 'rotate',
    e: React.PointerEvent
  ) => {
    if (!props.interactive || inlineEditIdx === idx) return;
    e.stopPropagation();
    e.preventDefault();

    const isAdditive = e.shiftKey;
    const nextSel = isAdditive
      ? selectedIndices.includes(idx)
        ? selectedIndices
        : [...selectedIndices, idx]
      : selectedIndices.includes(idx) && selectedIndices.length > 1 && gestureKind === 'move'
        ? selectedIndices
        : [idx];
    props.onSelectOverlays?.(nextSel);

    const ov = overlays[idx];
    if (!ov) return;

    const initialRect720 = defaultOverlayRect720(ov, idx, zones);
    const initialRotation = ov.rotation || 0;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    // Coleta alvos de snap (canvas 720x1280, safe area 9:16 e demais overlays)
    const siblingEntries = overlays
      .map((other, oIdx) => ({
        id: `ov-${oIdx}`,
        rect: defaultOverlayRect720(other, oIdx, zones),
      }))
      .filter((_, oIdx) => !nextSel.includes(oIdx));

    const snapTargets = [
      buildCompositionSnapTarget({ left: 0, top: 0, width: COMP_W, height: COMP_H }),
      buildSafeAreaSnapTarget(safeArea, COMP_W, COMP_H),
      ...extractSnapTargets(siblingEntries),
    ];

    let latestPatch: Partial<OverlayItem> | null = null;

    const onMove = (ev: PointerEvent) => {
      const rawDx720 = (ev.clientX - startClientX) / SCALE;
      const rawDy720 = (ev.clientY - startClientY) / SCALE;

      if (gestureKind === 'move') {
        const snapRes = resolveSnapAdjustment({
          movingRect: initialRect720,
          proposedDx: rawDx720,
          proposedDy: rawDy720,
          targets: snapTargets,
          disabled: props.snapEnabled === false || ev.altKey,
          compWidth: COMP_W,
          compHeight: COMP_H,
        });
        setSnapGuides(snapRes.guides);
        setSpacingGuides(snapRes.spacingGuides);
        const nx = Math.round(initialRect720.left + snapRes.dx);
        const ny = Math.round(initialRect720.top + snapRes.dy);
        latestPatch = { x: nx, y: ny };
        setDraftOverlayRects({ [idx]: latestPatch });
      } else if (gestureKind === 'resize-se' || gestureKind === 'resize-e' || gestureKind === 'resize-s') {
        const nw =
          gestureKind === 'resize-s'
            ? initialRect720.width
            : Math.max(96, Math.round(initialRect720.width + rawDx720));
        const nh =
          gestureKind === 'resize-e'
            ? initialRect720.height
            : Math.max(36, Math.round(initialRect720.height + rawDy720));
        latestPatch = {
          x: initialRect720.left,
          y: initialRect720.top,
          width: nw,
          height: nh,
        };
        setDraftOverlayRects({ [idx]: latestPatch });
      } else if (gestureKind === 'rotate') {
        const rot = Math.round(initialRotation + rawDx720 * 0.45);
        latestPatch = { rotation: rot };
        setDraftOverlayRects({ [idx]: latestPatch });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setSnapGuides([]);
      setSpacingGuides([]);
      setDraftOverlayRects({});
      if (latestPatch && props.onOverlayCommit) {
        const label =
          gestureKind === 'move'
            ? `Mover overlay ${ov.type}`
            : gestureKind === 'rotate'
              ? `Rotacionar overlay ${ov.type}`
              : `Redimensionar overlay ${ov.type}`;
        props.onOverlayCommit(idx, latestPatch, label);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Marquee selection no fundo do canvas 2D
  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!props.interactive || props.canvasTool !== '2d') return;
    if (e.target !== viewportRef.current && e.target !== canvasRef.current) return;
    props.onSelectOverlays?.([]);
    setInlineEditIdx(null);

    const rect = viewportRef.current!.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / SCALE;
    const startY = (e.clientY - rect.top) / SCALE;

    const onMove = (ev: PointerEvent) => {
      const curX = (ev.clientX - rect.left) / SCALE;
      const curY = (ev.clientY - rect.top) / SCALE;
      const mRect: Rect = {
        left: Math.min(startX, curX),
        top: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      };
      if (mRect.width > 12 || mRect.height > 12) {
        setMarqueeRect(mRect);
        const hitIndices: number[] = [];
        overlays.forEach((ov, idx) => {
          if (ov.hidden) return;
          const r = defaultOverlayRect720(ov, idx, zones);
          const intersects =
            r.left < mRect.left + mRect.width &&
            r.left + r.width > mRect.left &&
            r.top < mRect.top + mRect.height &&
            r.top + r.height > mRect.top;
          if (intersects) hitIndices.push(idx);
        });
        props.onSelectOverlays?.(hitIndices);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setMarqueeRect(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const commitInlineText = (idx: number) => {
    const ov = overlays[idx];
    if (!ov || !props.onOverlayCommit) {
      setInlineEditIdx(null);
      return;
    }
    const clean = inlineEditText.trim();
    if (clean) {
      if (ov.type === 'title' || ov.type === 'badge') {
        props.onOverlayCommit(idx, { text: clean } as Partial<OverlayItem>, `Editar texto (${ov.type})`);
      } else if (ov.type === 'lower-third') {
        props.onOverlayCommit(idx, { name: clean } as Partial<OverlayItem>, 'Editar nome lower-third');
      } else if (ov.type === 'role-banner') {
        props.onOverlayCommit(idx, { title: clean } as Partial<OverlayItem>, 'Editar título tarja');
      } else if (ov.type === 'counter') {
        props.onOverlayCommit(idx, { label: clean } as Partial<OverlayItem>, 'Editar rótulo contador');
      } else if (ov.type === 'watermark') {
        props.onOverlayCommit(idx, { handle: clean } as Partial<OverlayItem>, 'Editar marca d’água');
      }
    }
    setInlineEditIdx(null);
  };

  // Renderização de Overlays 2D e Legendas sobre o Canvas 3D da Cena
  const words =
    props.scene.wordTimestamps && props.scene.wordTimestamps.length > 0
      ? props.scene.wordTimestamps
      : estimateProportionalWordTimestamps(
          props.scene.narration,
          props.scene.duration,
          props.scene.highlightWords
        );
  const groups = buildWordCaptionGroups(words, props.captionStyle?.wordsPerGroup || 3);
  const activeGroup = groups.find((g, gIdx) => {
    const nextStart = gIdx + 1 < groups.length ? groups[gIdx + 1].start : Infinity;
    const effectiveEnd = Math.min(g.end + 0.02, nextStart - 0.001);
    return localTime >= g.start && localTime < effectiveEnd;
  });

  return (
    <div
      ref={viewportRef}
      className="vs-phone-viewport"
      data-testid="nle-canvas-viewport"
      onPointerDown={handleViewportPointerDown}
      style={{
        userSelect: 'none',
        cursor:
          props.canvasTool === '3d'
            ? 'crosshair'
            : props.canvasTool === 'camera'
              ? 'grab'
              : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        onClick={handleCanvasClick3D}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Safe Area 9:16 Visível (Margens do Design Kit) */}
      {props.showSafeAreas && (
        <div
          data-testid="safe-area-guide"
          style={{
            position: 'absolute',
            top: safeArea.topPx * SCALE,
            bottom: safeArea.bottomPx * SCALE,
            left: safeArea.leftPx * SCALE,
            right: safeArea.rightPx * SCALE,
            border: '1.5px dashed rgba(56, 189, 248, 0.65)',
            borderRadius: 6,
            pointerEvents: 'none',
            zIndex: 45,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 4,
              left: 6,
              fontSize: 9,
              fontWeight: 800,
              color: '#38bdf8',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '1px 5px',
              borderRadius: 4,
              letterSpacing: '0.06em',
            }}
          >
            SAFE AREA 9:16 ({safeArea.leftPx}×{safeArea.topPx}px)
          </span>
        </div>
      )}

      {/* Guias Inteligentes de Snapping Magnético (Bordas, Centros e Equidistância) */}
      {snapGuides.map((g, gi) =>
        g.axis === 'x' ? (
          <div
            key={`gx-${gi}`}
            data-testid="snap-guide-line-x"
            style={{
              position: 'absolute',
              left: g.position * SCALE,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: g.kind === 'center' ? '#ec4899' : '#38bdf8',
              boxShadow: '0 0 6px rgba(236, 72, 153, 0.9)',
              zIndex: 60,
              pointerEvents: 'none',
            }}
          >
            {g.label && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 4,
                  background: '#ec4899',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {g.label}
              </span>
            )}
          </div>
        ) : (
          <div
            key={`gy-${gi}`}
            data-testid="snap-guide-line-y"
            style={{
              position: 'absolute',
              top: g.position * SCALE,
              left: 0,
              right: 0,
              height: 1.5,
              background: g.kind === 'center' ? '#ec4899' : '#38bdf8',
              boxShadow: '0 0 6px rgba(236, 72, 153, 0.9)',
              zIndex: 60,
              pointerEvents: 'none',
            }}
          >
            {g.label && (
              <span
                style={{
                  position: 'absolute',
                  left: 8,
                  top: -15,
                  background: '#ec4899',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {g.label}
              </span>
            )}
          </div>
        )
      )}

      {spacingGuides.map((sg, sgi) => (
        <div
          key={`sg-${sgi}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: sg.position * SCALE,
            height: sg.size * SCALE,
            borderLeft: '1.5px dotted #22c55e',
            zIndex: 60,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              background: '#22c55e',
              color: '#090d16',
              fontSize: 8,
              fontWeight: 900,
              padding: '1px 4px',
              borderRadius: 3,
              marginLeft: 4,
            }}
          >
            ↕ {sg.size}px
          </span>
        </div>
      ))}

      {/* Marquee Selection Box */}
      {marqueeRect && (
        <div
          style={{
            position: 'absolute',
            left: marqueeRect.left * SCALE,
            top: marqueeRect.top * SCALE,
            width: marqueeRect.width * SCALE,
            height: marqueeRect.height * SCALE,
            border: '1.5px solid #38bdf8',
            background: 'rgba(56, 189, 248, 0.16)',
            zIndex: 65,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Camada de Overlays 2D Interativos ("Tipo Figma") */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: props.interactive && props.canvasTool === '2d' ? 'auto' : 'none',
          zIndex: 30,
        }}
      >
        {overlays.map((rawOv, idx) => {
          const draft = draftOverlayRects[idx] || {};
          const ov = { ...rawOv, ...draft } as OverlayItem;
          if (ov.hidden) return null;

          const rect720 = defaultOverlayRect720(ov, idx, zones);
          const isSelected = selectedIndices.includes(idx);
          const rot = ov.rotation || 0;
          const sc = ov.scale || 1;
          const op = ov.opacity ?? 1;
          const zIdx = ov.zIndex ?? 20 + idx;

          const boxStyle: React.CSSProperties = {
            position: 'absolute',
            left: rect720.left * SCALE,
            top: rect720.top * SCALE,
            width: rect720.width * SCALE,
            minHeight: rect720.height * SCALE,
            transform: `rotate(${rot}deg) scale(${sc})`,
            opacity: op,
            zIndex: zIdx,
            cursor: props.interactive && props.canvasTool === '2d' ? 'move' : 'default',
            outline: isSelected
              ? '2px solid #38bdf8'
              : props.interactive && props.canvasTool === '2d'
                ? '1px dashed rgba(255,255,255,0.18)'
                : 'none',
            outlineOffset: 2,
            borderRadius: 6,
            pointerEvents: props.interactive && props.canvasTool === '2d' ? 'auto' : 'none',
          };

          const openInlineEditor = (e: React.MouseEvent) => {
            if (!props.interactive) return;
            e.stopPropagation();
            const currentTxt =
              ov.type === 'title' || ov.type === 'badge'
                ? ov.text
                : ov.type === 'lower-third'
                  ? ov.name
                  : ov.type === 'role-banner'
                    ? ov.title
                    : ov.type === 'counter'
                      ? ov.label
                      : ov.type === 'watermark'
                        ? ov.handle
                        : '';
            setInlineEditIdx(idx);
            setInlineEditText(currentTxt);
          };

          const isBoxedTitle =
            ov.type === 'title' ? (ov.boxed ?? dk?.overlayPreset.titleBoxed ?? false) : false;

          return (
            <div
              key={idx}
              data-testid={`canvas-overlay-${idx}`}
              data-overlay-type={ov.type}
              data-x={Math.round(rect720.left)}
              data-y={Math.round(rect720.top)}
              style={boxStyle}
              onPointerDown={(e) => startOverlay2DGesture(idx, 'move', e)}
              onDoubleClick={openInlineEditor}
            >
              {/* Conteúdo visual do Overlay */}
              {inlineEditIdx === idx ? (
                <div
                  style={{
                    background: '#0f172a',
                    border: '2px solid #f5c518',
                    borderRadius: 6,
                    padding: 4,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    data-testid="inline-overlay-text-input"
                    value={inlineEditText}
                    onChange={(e) => setInlineEditText(e.target.value)}
                    onBlur={() => commitInlineText(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitInlineText(idx);
                      if (e.key === 'Escape') setInlineEditIdx(null);
                    }}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      color: '#fff',
                      border: 'none',
                      outline: 'none',
                      fontWeight: 900,
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  />
                </div>
              ) : ov.type === 'title' ? (
                <div style={{ textAlign: 'center' }}>
                  {ov.subtitle && (
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 9,
                        fontWeight: 800,
                        fontFamily: bodyFont,
                        padding: '2px 8px',
                        borderRadius: radiusStyle,
                        background: surfaceColor,
                        border: '1px solid rgba(255,255,255,0.4)',
                        color: textColor,
                        marginBottom: 4,
                      }}
                    >
                      {ov.subtitle}
                    </div>
                  )}
                  <div
                    style={{
                      fontFamily: ov.fontFamily || headingFont,
                      fontWeight: 900,
                      fontSize: ov.fontSize ? ov.fontSize * SCALE : isBoxedTitle ? 21 : 27,
                      lineHeight: 1.05,
                      color: ov.textColor || textColor,
                      background: ov.backgroundColor || (isBoxedTitle ? surfaceColor : 'transparent'),
                      padding: isBoxedTitle ? '6px 10px' : 0,
                      borderRadius: radiusStyle,
                      boxShadow: isBoxedTitle ? shadowStyle : 'none',
                      textShadow: isBoxedTitle ? 'none' : '0 3px 10px rgba(0,0,0,0.85)',
                      textTransform: dk?.typography.uppercaseHeadings === false ? 'none' : 'uppercase',
                    }}
                  >
                    {ov.text.split(' ').map((w, wi) => {
                      const isHl =
                        ov.highlightWord &&
                        w.toLowerCase().replace(/[.,!?]/g, '') ===
                          ov.highlightWord.toLowerCase().replace(/[.,!?]/g, '');
                      return (
                        <span key={wi} style={{ color: isHl ? primaryColor : ov.textColor || textColor }}>
                          {w}{' '}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : ov.type === 'badge' ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    width: '100%',
                    background: ov.backgroundColor || ov.color || primaryColor,
                    color: ov.textColor || textOnPrimary,
                    fontFamily: ov.fontFamily || headingFont,
                    fontWeight: 900,
                    fontSize: ov.fontSize ? ov.fontSize * SCALE : 12,
                    padding: '3px 10px',
                    borderRadius: radiusStyle,
                    border: '1.5px solid #111827',
                    boxShadow: shadowStyle,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ov.icon || '⚠'} {ov.text}
                </div>
              ) : ov.type === 'lower-third' ? (
                <div
                  style={{
                    background: ov.backgroundColor || surfaceColor,
                    borderLeft: `4px solid ${primaryColor}`,
                    padding: '6px 10px',
                    borderRadius: `0 ${radiusStyle} ${radiusStyle} 0`,
                    boxShadow: shadowStyle,
                  }}
                >
                  <div
                    style={{
                      fontFamily: ov.fontFamily || headingFont,
                      fontWeight: 900,
                      fontSize: ov.fontSize ? ov.fontSize * SCALE : 13,
                      color: ov.textColor || textColor,
                    }}
                  >
                    {ov.name}
                  </div>
                  <div style={{ fontFamily: bodyFont, fontWeight: 800, fontSize: 9, color: primaryColor }}>
                    {ov.subtitle}
                  </div>
                </div>
              ) : ov.type === 'role-banner' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      background: ov.backgroundColor || surfaceColor,
                      color: ov.textColor || primaryColor,
                      fontFamily: ov.fontFamily || headingFont,
                      fontWeight: 900,
                      fontSize: ov.fontSize ? ov.fontSize * SCALE : 16,
                      padding: '4px 12px',
                      borderRadius: radiusStyle,
                      boxShadow: shadowStyle,
                    }}
                  >
                    {ov.title}
                  </div>
                  {ov.subtitle && (
                    <div
                      style={{
                        background: accentColor,
                        color: '#fff',
                        fontFamily: bodyFont,
                        fontWeight: 800,
                        fontSize: 10,
                        padding: '3px 8px',
                        borderRadius: radiusStyle,
                      }}
                    >
                      {ov.subtitle}
                    </div>
                  )}
                </div>
              ) : ov.type === 'counter' ? (
                <div
                  style={{
                    background: ov.backgroundColor || surfaceColor,
                    border: `1.5px solid ${primaryColor}`,
                    borderRadius: radiusStyle,
                    padding: '6px 10px',
                    textAlign: 'center',
                    boxShadow: shadowStyle,
                  }}
                >
                  <div style={{ fontSize: 8, fontWeight: 800, color: '#cbd5e1' }}>{ov.label}</div>
                  <div
                    style={{
                      fontFamily: ov.fontFamily || headingFont,
                      fontSize: ov.fontSize ? ov.fontSize * SCALE : 24,
                      fontWeight: 900,
                      color: ov.textColor || primaryColor,
                    }}
                  >
                    {ov.prefix}
                    {Math.round(
                      ov.from +
                        (ov.to - ov.from) * Math.min(1, localTime / Math.max(0.8, props.scene.duration * 0.6))
                    )}
                    {ov.suffix}
                  </div>
                  {ov.sublabel && <div style={{ fontSize: 7, color: '#94a3b8' }}>{ov.sublabel}</div>}
                </div>
              ) : ov.type === 'watermark' ? (
                <div
                  style={{
                    background: ov.backgroundColor || surfaceColor,
                    color: ov.textColor || textColor,
                    fontFamily: bodyFont,
                    fontWeight: 800,
                    fontSize: 10,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.25)',
                    textAlign: 'center',
                  }}
                >
                  {ov.handle}
                </div>
              ) : null}

              {/* Handles estilo Figma quando selecionado (Resize + Rotate + Badge de Coordenadas) */}
              {props.interactive && props.canvasTool === '2d' && isSelected && (
                <>
                  {/* Pill de coordenadas (x, y, w×h, rot) */}
                  <div
                    data-testid={`overlay-coords-pill-${idx}`}
                    style={{
                      position: 'absolute',
                      top: -20,
                      left: 0,
                      background: '#38bdf8',
                      color: '#090d16',
                      fontSize: 9,
                      fontWeight: 900,
                      padding: '1px 6px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {ov.type.toUpperCase()} · X:{Math.round(rect720.left)} Y:{Math.round(rect720.top)} ·{' '}
                    {Math.round(rect720.width)}×{Math.round(rect720.height)}
                    {rot ? ` · ${rot}°` : ''}
                  </div>

                  {/* Handle de Rotação (topo central) */}
                  <div
                    title="Arraste para rotacionar"
                    data-testid={`overlay-rotate-handle-${idx}`}
                    onPointerDown={(e) => startOverlay2DGesture(idx, 'rotate', e)}
                    style={{
                      position: 'absolute',
                      top: -16,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: '#f5c518',
                      border: '2px solid #090d16',
                      cursor: 'grab',
                    }}
                  />

                  {/* Handle Resize SE (canto inferior direito) */}
                  <div
                    title="Arraste para redimensionar"
                    data-testid={`overlay-resize-se-${idx}`}
                    onPointerDown={(e) => startOverlay2DGesture(idx, 'resize-se', e)}
                    style={{
                      position: 'absolute',
                      right: -5,
                      bottom: -5,
                      width: 10,
                      height: 10,
                      background: '#ffffff',
                      border: '2px solid #38bdf8',
                      borderRadius: 2,
                      cursor: 'nwse-resize',
                    }}
                  />

                  {/* Handle Resize E (lateral direita) */}
                  <div
                    onPointerDown={(e) => startOverlay2DGesture(idx, 'resize-e', e)}
                    style={{
                      position: 'absolute',
                      right: -5,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 8,
                      height: 14,
                      background: '#ffffff',
                      border: '2px solid #38bdf8',
                      borderRadius: 2,
                      cursor: 'ew-resize',
                    }}
                  />
                </>
              )}
            </div>
          );
        })}

        {/* Legenda Palavra a Palavra Ativa (Zona Base — arrastável verticalmente) */}
        {activeGroup && (
          <div
            data-testid="canvas-captions-group"
            title="Arraste verticalmente para ajustar a altura das legendas"
            onPointerDown={(e) => {
              if (!props.interactive || !props.onCaptionPositionCommit) return;
              e.stopPropagation();
              const startY = e.clientY;
              const startPct = props.captionStyle?.positionY || 83;
              const onMove = (ev: PointerEvent) => {
                const dyPct = ((ev.clientY - startY) / VIEW_H) * 100;
                const nextPct = Math.max(15, Math.min(90, Math.round(startPct + dyPct)));
                props.onCaptionPositionCommit?.(nextPct);
              };
              const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            }}
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              top: `${zones.bottom.topPercent}%`,
              display: 'flex',
              justifyContent: 'center',
              gap: 6,
              flexWrap: 'wrap',
              cursor: props.interactive ? 'ns-resize' : 'default',
            }}
          >
            {activeGroup.words.map((w, wi) => {
              const nextStart =
                wi + 1 < activeGroup.words.length
                  ? activeGroup.words[wi + 1].start
                  : activeGroup.end + 0.1;
              const isActive = localTime >= w.start - 0.03 && localTime < nextStart;
              const isBoxStyle = (props.captionStyle?.style || dk?.captionPreset.style) === 'box';
              return (
                <span
                  key={wi}
                  style={{
                    fontFamily: bodyFont,
                    fontWeight: 900,
                    fontSize: 16,
                    padding: '2px 6px',
                    borderRadius: radiusStyle,
                    background: isActive
                      ? primaryColor
                      : isBoxStyle
                        ? surfaceColor
                        : 'transparent',
                    color: isActive ? textOnPrimary : textColor,
                    textShadow: isActive || isBoxStyle ? 'none' : '0 2px 6px rgba(0,0,0,0.95)',
                  }}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Overlay de Gizmo 3D (Eixos X/Y/Z interativos + HUD de TransformControls sobre o objeto 3D selecionado) */}
      {props.interactive && props.canvasTool === '3d' && gizmoScreenPos && (
        <div
          data-testid="gizmo-3d-overlay"
          style={{
            position: 'absolute',
            left: gizmoScreenPos.x,
            top: gizmoScreenPos.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 55,
            pointerEvents: 'auto',
          }}
        >
          {/* Anel do pivô central 3D */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(245, 197, 24, 0.95)',
              border: '2px solid #090d16',
              boxShadow: '0 0 12px rgba(245, 197, 24, 0.85)',
            }}
          />

          {/* Eixo X (Vermelho — Horizontal) */}
          <div
            data-testid="gizmo-3d-axis-x"
            title="Arraste o eixo X (vermelho)"
            onPointerDown={(e) => start3DAxisDrag('x', e)}
            style={{
              position: 'absolute',
              left: 16,
              top: 3,
              width: 56,
              height: 12,
              display: 'flex',
              alignItems: 'center',
              cursor: 'ew-resize',
            }}
          >
            <div style={{ flex: 1, height: 4, background: '#ef4444', borderRadius: 2 }} />
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 9,
                fontWeight: 900,
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              X
            </span>
          </div>

          {/* Eixo Y (Verde — Vertical) */}
          <div
            data-testid="gizmo-3d-axis-y"
            title="Arraste o eixo Y (verde)"
            onPointerDown={(e) => start3DAxisDrag('y', e)}
            style={{
              position: 'absolute',
              left: 3,
              top: -58,
              width: 14,
              height: 56,
              display: 'flex',
              flexDirection: 'column-reverse',
              alignItems: 'center',
              cursor: 'ns-resize',
            }}
          >
            <div style={{ flex: 1, width: 4, background: '#22c55e', borderRadius: 2 }} />
            <span
              style={{
                background: '#22c55e',
                color: '#090d16',
                fontSize: 9,
                fontWeight: 900,
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              Y
            </span>
          </div>

          {/* Eixo Z (Azul — Profundidade) */}
          <div
            data-testid="gizmo-3d-axis-z"
            title="Arraste o eixo Z (azul)"
            onPointerDown={(e) => start3DAxisDrag('z', e)}
            style={{
              position: 'absolute',
              left: -48,
              top: 22,
              width: 48,
              height: 14,
              display: 'flex',
              alignItems: 'center',
              transform: 'rotate(-35deg)',
              cursor: 'nwse-resize',
            }}
          >
            <span
              style={{
                background: '#3b82f6',
                color: '#fff',
                fontSize: 9,
                fontWeight: 900,
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              Z
            </span>
            <div style={{ flex: 1, height: 4, background: '#3b82f6', borderRadius: 2 }} />
          </div>

          {/* Etiqueta flutuante com coordenadas 3D ao vivo */}
          <div
            data-testid="gizmo-3d-coords-badge"
            style={{
              position: 'absolute',
              top: 26,
              left: -60,
              background: 'rgba(15, 23, 42, 0.94)',
              border: '1.5px solid #f5c518',
              color: '#f8fafc',
              fontSize: 9,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 6px 16px rgba(0,0,0,0.65)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ color: '#f5c518' }}>3D: {gizmoScreenPos.label}</div>
            <div>
              Pos: [{gizmoScreenPos.position.join(', ')}] · Escala: {gizmoScreenPos.scale[0]}x
            </div>
          </div>
        </div>
      )}

      {/* HUD de Modo Câmera 3D ("Salvar como Keyframe de Câmera") */}
      {props.interactive && props.canvasTool === 'camera' && (
        <div
          data-testid="camera-3d-hud"
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1.5px solid #38bdf8',
            borderRadius: 10,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 58,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8' }}>
            CÂMERA 3D LIVRE (Arraste para Orbitar · Direito para Pan · Scroll para Zoom)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="om-button"
              data-primary
              data-testid="save-camera-keyframe-btn"
              style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
              onClick={() => {
                const ctrl = stageControllerRef.current;
                const built = ctrl?.builtScenes?.[0];
                const cam = ctrl?.camera;
                if (!cam) return;
                const kf: CameraKeyframeOverride = liveCameraState || {
                  position: [
                    Number(cam.position.x.toFixed(2)),
                    Number(cam.position.y.toFixed(2)),
                    Number(cam.position.z.toFixed(2)),
                  ],
                  target: [
                    Number((built?.framing?.lookX || 0).toFixed(2)),
                    Number((built?.framing?.lookY || 1.35).toFixed(2)),
                    Number((built?.framing?.lookZ || 0).toFixed(2)),
                  ],
                  fov: cam.fov,
                };
                props.onCameraKeyframeCommit?.(kf, 'Salvar Keyframe de Câmera 3D');
              }}
            >
              Salvar Keyframe de Câmera
            </button>
            {props.scene.cameraOverride && (
              <button
                type="button"
                className="om-button"
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => props.onCameraKeyframeCommit?.(undefined, 'Resetar Keyframe de Câmera')}
              >
                Resetar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
