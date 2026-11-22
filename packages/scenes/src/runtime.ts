import type {
  CameraKeyframeOverride,
  CameraPreset,
  Character,
  CharacterPose,
  DesignKit,
  SceneObjectOverride,
  StageTemplateId,
} from '@kinema/core';
import { RoundedBoxGeometry as ThreeRoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface Scene3DRenderConfig {
  template: StageTemplateId;
  templateProps?: Record<string, any>;
  character: Character;
  secondaryCharacters?: Character[];
  pose: CharacterPose;
  camera: CameraPreset;
  duration: number;
  objectOverrides?: Record<string, SceneObjectOverride>;
  cameraOverride?: CameraKeyframeOverride;
  designKit?: DesignKit;
}

export interface TemplateCameraFraming {
  lookX: number;
  lookY: number;
  lookZ: number;
  camY: number;
  baseZ: number;
  boxWidth: number;
  boxHeight: number;
}

// Referência explícita ao import do JSM para bundlers Node/Vite
export { ThreeRoundedBoxGeometry };

/**
 * Fábrica autocontida do motor 3D procedural (Three.js).
 * Pode ser executada diretamente no Node/Vite (passando `import * as THREE from 'three'`)
 * ou serializada via `.toString()` dentro da composição HTML do HyperFrames.
 */
export function createScene3DEngine(THREE: any) {
  // Garante RoundedBoxGeometry (de three/examples/jsm/geometries/RoundedBoxGeometry)
  // tanto quando injetado em window.THREE quanto quando THREE puro é passado no Node/Vite.
  const RoundedBoxGeometry =
    THREE.RoundedBoxGeometry ||
    (function createRoundedBoxClass() {
      const tempNormal = new THREE.Vector3();
      function getUv(
        faceDirVector: any,
        normal: any,
        uvAxis: string,
        projectionAxis: string,
        radius: number,
        sideLength: number
      ) {
        const totArcLength = (2 * Math.PI * radius) / 4;
        const centerLength = Math.max(sideLength - 2 * radius, 0);
        const halfArc = Math.PI / 4;
        tempNormal.copy(normal);
        tempNormal[projectionAxis] = 0;
        tempNormal.normalize();
        const arcUvRatio = (0.5 * totArcLength) / (totArcLength + centerLength);
        const arcAngleRatio = 1.0 - tempNormal.angleTo(faceDirVector) / halfArc;
        if (Math.sign(tempNormal[uvAxis]) === 1) {
          return arcAngleRatio * arcUvRatio;
        }
        const lenUv = centerLength / (totArcLength + centerLength);
        return lenUv + arcUvRatio + arcUvRatio * (1.0 - arcAngleRatio);
      }

      return class RoundedBoxGeometryFallback extends THREE.BoxGeometry {
        constructor(width = 1, height = 1, depth = 1, segments = 2, radius = 0.1) {
          const segs = segments * 2 + 1;
          const rad = Math.min(width / 2, height / 2, depth / 2, radius);
          super(1, 1, 1, segs, segs, segs);
          if (segs === 1) return;

          const geometry2 = this.toNonIndexed();
          this.index = null;
          this.attributes.position = geometry2.attributes.position;
          this.attributes.normal = geometry2.attributes.normal;
          this.attributes.uv = geometry2.attributes.uv;

          const position = new THREE.Vector3();
          const normal = new THREE.Vector3();
          const box = new THREE.Vector3(width, height, depth).divideScalar(2).subScalar(rad);
          const positions = this.attributes.position.array;
          const normals = this.attributes.normal.array;
          const uvs = this.attributes.uv.array;
          const faceTris = positions.length / 6;
          const faceDirVector = new THREE.Vector3();
          const halfSegmentSize = 0.5 / segs;

          for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
            position.fromArray(positions, i);
            normal.copy(position);
            normal.x -= Math.sign(normal.x) * halfSegmentSize;
            normal.y -= Math.sign(normal.y) * halfSegmentSize;
            normal.z -= Math.sign(normal.z) * halfSegmentSize;
            normal.normalize();

            positions[i + 0] = box.x * Math.sign(position.x) + normal.x * rad;
            positions[i + 1] = box.y * Math.sign(position.y) + normal.y * rad;
            positions[i + 2] = box.z * Math.sign(position.z) + normal.z * rad;

            normals[i + 0] = normal.x;
            normals[i + 1] = normal.y;
            normals[i + 2] = normal.z;

            const side = Math.floor(i / faceTris);
            switch (side) {
              case 0:
                faceDirVector.set(1, 0, 0);
                uvs[j + 0] = getUv(faceDirVector, normal, 'z', 'y', rad, depth);
                uvs[j + 1] = 1.0 - getUv(faceDirVector, normal, 'y', 'z', rad, height);
                break;
              case 1:
                faceDirVector.set(-1, 0, 0);
                uvs[j + 0] = 1.0 - getUv(faceDirVector, normal, 'z', 'y', rad, depth);
                uvs[j + 1] = 1.0 - getUv(faceDirVector, normal, 'y', 'z', rad, height);
                break;
              case 2:
                faceDirVector.set(0, 1, 0);
                uvs[j + 0] = 1.0 - getUv(faceDirVector, normal, 'x', 'z', rad, width);
                uvs[j + 1] = getUv(faceDirVector, normal, 'z', 'x', rad, depth);
                break;
              case 3:
                faceDirVector.set(0, -1, 0);
                uvs[j + 0] = 1.0 - getUv(faceDirVector, normal, 'x', 'z', rad, width);
                uvs[j + 1] = 1.0 - getUv(faceDirVector, normal, 'z', 'x', rad, depth);
                break;
              case 4:
                faceDirVector.set(0, 0, 1);
                uvs[j + 0] = 1.0 - getUv(faceDirVector, normal, 'x', 'y', rad, width);
                uvs[j + 1] = 1.0 - getUv(faceDirVector, normal, 'y', 'x', rad, height);
                break;
              case 5:
                faceDirVector.set(0, 0, -1);
                uvs[j + 0] = getUv(faceDirVector, normal, 'x', 'y', rad, width);
                uvs[j + 1] = 1.0 - getUv(faceDirVector, normal, 'y', 'x', rad, height);
                break;
            }
          }
        }
      };
    })();

  // Gerador pseudo-aleatório determinístico (Mulberry32) para confetes, multidão e estrelas
  function createRng(seed: number) {
    let a = seed >>> 0;
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Marca um objeto (e seus filhos) como elemento de fundo para não distorcer o bounding box de enquadramento
  function markIgnoreFraming(obj: any) {
    if (!obj) return;
    obj.userData = obj.userData || {};
    obj.userData.ignoreFraming = true;
    return obj;
  }

  // Cria textura Canvas 2D nítida para placas, letreiros, telões e rótulos 3D
  function createTextTexture(
    text: string,
    opts: {
      width?: number;
      height?: number;
      bgColor?: string;
      textColor?: string;
      subText?: string;
      subColor?: string;
      fontSize?: number;
      subFontSize?: number;
      borderColor?: string;
      borderWidth?: number;
      borderRadius?: number;
    } = {}
  ) {
    const width = opts.width || 512;
    const height = opts.height || 160;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const bgColor = opts.bgColor ?? '#111827';
    const textColor = opts.textColor ?? '#ffffff';
    const fontSize = opts.fontSize ?? 54;

    ctx.clearRect(0, 0, width, height);

    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      const r = opts.borderRadius ?? 16;
      ctx.beginPath();
      ctx.roundRect(4, 4, width - 8, height - 8, r);
      ctx.fill();

      if (opts.borderColor) {
        ctx.strokeStyle = opts.borderColor;
        ctx.lineWidth = opts.borderWidth || 6;
        ctx.stroke();
      }
    }

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = String(text || '').split('\n');
    if (opts.subText) {
      const mainFs = Math.max(fontSize, Math.round(height * (lines.length > 1 ? 0.3 : 0.44)));
      ctx.font = `900 ${mainFs}px "Anton", "Bebas Neue", "Inter", "Arial Black", sans-serif`;
      if (lines.length === 1) {
        ctx.fillText(lines[0] || '', width / 2, height * 0.36, width - 28);
      } else {
        const lh = mainFs * 1.02;
        lines.forEach((line, idx) => {
          ctx.fillText(line, width / 2, height * 0.23 + idx * lh, width - 28);
        });
      }
      ctx.fillStyle = opts.subColor || '#f5c518';
      const subFs = opts.subFontSize || Math.max(24, Math.round(height * 0.22));
      ctx.font = `800 ${subFs}px "Inter", Arial, sans-serif`;
      ctx.fillText(opts.subText, width / 2, height * 0.8, width - 28);
    } else if (lines.length === 1) {
      const singleFs = Math.max(fontSize, Math.round(height * 0.62));
      ctx.font = `900 ${singleFs}px "Anton", "Bebas Neue", "Inter", "Arial Black", sans-serif`;
      ctx.fillText(lines[0], width / 2, height * 0.52, width - 24);
    } else {
      const multiFs = Math.max(fontSize, Math.round((height / lines.length) * 0.58));
      ctx.font = `900 ${multiFs}px "Anton", "Bebas Neue", "Inter", "Arial Black", sans-serif`;
      const lineHeight = multiFs * 1.08;
      const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, width / 2, startY + idx * lineHeight, width - 24);
      });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Cria uma placa 3D (caixa fina com textura frontal)
  function createSignMesh(
    text: string,
    opts: {
      w?: number;
      h?: number;
      d?: number;
      bgColor?: string;
      textColor?: string;
      subText?: string;
      subColor?: string;
      fontSize?: number;
      subFontSize?: number;
      borderColor?: string;
      texW?: number;
      texH?: number;
    } = {}
  ) {
    const w = opts.w ?? 2.2;
    const h = opts.h ?? 0.7;
    const d = opts.d ?? 0.08;
    const tex = createTextTexture(text, {
      width: opts.texW || 512,
      height: opts.texH || Math.round(512 * (h / w)),
      bgColor: opts.bgColor,
      textColor: opts.textColor,
      subText: opts.subText,
      subColor: opts.subColor,
      fontSize: opts.fontSize,
      subFontSize: opts.subFontSize,
      borderColor: opts.borderColor,
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: opts.bgColor && opts.bgColor !== 'transparent' ? opts.bgColor : '#1f2937',
      roughness: 0.75,
    });
    const frontMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      transparent: opts.bgColor === 'transparent',
    });
    const geom = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geom, [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat]);
    mesh.castShadow = true;
    return mesh;
  }

  // Cria bandeira do Brasil 3D
  function createBrazilFlag(scale = 1) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 1.8 * scale, 10),
      new THREE.MeshStandardMaterial({ color: '#d4a373', roughness: 0.7 })
    );
    pole.position.y = 0.9 * scale;
    group.add(pole);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 170;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#009c3b';
    ctx.fillRect(0, 0, 256, 170);
    ctx.fillStyle = '#ffdf00';
    ctx.beginPath();
    ctx.moveTo(128, 18);
    ctx.lineTo(234, 85);
    ctx.lineTo(128, 152);
    ctx.lineTo(22, 85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#002776';
    ctx.beginPath();
    ctx.arc(128, 85, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(128, 110, 52, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();

    const flagTex = new THREE.CanvasTexture(canvas);
    const flagMesh = new THREE.Mesh(
      new RoundedBoxGeometry(0.95 * scale, 0.62 * scale, 0.04 * scale, 2, 0.015 * scale),
      new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.65 })
    );
    flagMesh.position.set(0.48 * scale, 1.45 * scale, 0);
    flagMesh.name = 'flagCloth';
    group.add(flagMesh);
    return group;
  }

  // ==========================================================================
  // (a) GERADOR DE PERSONAGEM CHIBI / ARREDONDADO 3D (ESTILO SIMULAÇÃO 2030)
  // ==========================================================================
  function createBlockyCharacter(charConfig: Character) {
    const c = {
      skinColor: charConfig?.skinColor || '#7a4b2a',
      hairStyle: charConfig?.hairStyle || 'afro',
      hairColor: charConfig?.hairColor || '#181412',
      hasBeard: charConfig?.hasBeard ?? true,
      beardColor: charConfig?.beardColor || charConfig?.hairColor || '#181412',
      hasGlasses: charConfig?.hasGlasses ?? true,
      glassesColor: charConfig?.glassesColor || '#111111',
      shirtColor: charConfig?.shirtColor || '#c1121f',
      shirtAccentColor: charConfig?.shirtAccentColor || '#f5c518',
      hasShirtStar: charConfig?.hasShirtStar ?? true,
      pantsColor: charConfig?.pantsColor || '#1d3557',
      shoeColor: charConfig?.shoeColor || '#f8f9fa',
      accessories: charConfig?.accessories || [],
      headScale: charConfig?.headScale || 1.38,
    };

    const root = new THREE.Group();

    // Materiais suaves tipo clay/vinil fosco (roughness alto como na referência)
    const skinMat = new THREE.MeshStandardMaterial({
      color: c.skinColor,
      roughness: 0.78,
      metalness: 0.02,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: c.hairColor,
      roughness: 0.88,
      metalness: 0.01,
    });
    const beardMat = new THREE.MeshStandardMaterial({
      color: c.beardColor,
      roughness: 0.88,
      metalness: 0.01,
    });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: c.accessories.includes('suit') ? '#1f2937' : c.shirtColor,
      roughness: 0.76,
      metalness: 0.02,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: c.pantsColor,
      roughness: 0.8,
      metalness: 0.02,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: c.shoeColor,
      roughness: 0.58,
      metalness: 0.03,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.85,
      metalness: 0.01,
    });
    const soleTreadMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.9,
    });
    const sockMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.8,
    });

    // Helper para criar tênis arredondado com sola evidente
    function createSneakerMesh() {
      const shoeGroup = new THREE.Group();
      // Corpo principal arredondado do tênis
      const upper = new THREE.Mesh(
        new RoundedBoxGeometry(0.35, 0.16, 0.44, 3, 0.065),
        shoeMat
      );
      upper.position.set(0, 0.02, 0.02);
      upper.castShadow = true;
      upper.receiveShadow = true;
      shoeGroup.add(upper);

      // Biqueira frontal arredondada
      const toeBox = new THREE.Mesh(
        new RoundedBoxGeometry(0.33, 0.12, 0.22, 3, 0.055),
        shoeMat
      );
      toeBox.position.set(0, 0.0, 0.16);
      toeBox.castShadow = true;
      shoeGroup.add(toeBox);

      // Colarinho escuro do tênis (cano baixo)
      const collar = new THREE.Mesh(
        new RoundedBoxGeometry(0.28, 0.06, 0.24, 2, 0.025),
        sockMat
      );
      collar.position.set(0, 0.09, -0.04);
      shoeGroup.add(collar);

      // Sola branca/cinza espessa
      const sole = new THREE.Mesh(
        new RoundedBoxGeometry(0.37, 0.055, 0.5, 3, 0.025),
        soleMat
      );
      sole.position.set(0, -0.068, 0.03);
      sole.castShadow = true;
      sole.receiveShadow = true;
      shoeGroup.add(sole);

      // Friso inferior escuro da sola
      const tread = new THREE.Mesh(
        new RoundedBoxGeometry(0.36, 0.02, 0.48, 2, 0.01),
        soleTreadMat
      );
      tread.position.set(0, -0.098, 0.03);
      shoeGroup.add(tread);

      return shoeGroup;
    }

    // Pernas arredondadas com pivô no quadril (y = 0.72)
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.21, 0.72, 0);
    const leftLeg = new THREE.Mesh(
      new RoundedBoxGeometry(0.32, 0.54, 0.34, 3, 0.095),
      pantsMat
    );
    leftLeg.position.y = -0.26;
    leftLeg.castShadow = true;
    leftLeg.receiveShadow = true;
    leftLegPivot.add(leftLeg);

    const leftShoe = createSneakerMesh();
    leftShoe.position.set(0, -0.61, 0.03);
    leftLegPivot.add(leftShoe);
    root.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.21, 0.72, 0);
    const rightLeg = new THREE.Mesh(
      new RoundedBoxGeometry(0.32, 0.54, 0.34, 3, 0.095),
      pantsMat
    );
    rightLeg.position.y = -0.26;
    rightLeg.castShadow = true;
    rightLeg.receiveShadow = true;
    rightLegPivot.add(rightLeg);

    const rightShoe = createSneakerMesh();
    rightShoe.position.set(0, -0.61, 0.03);
    rightLegPivot.add(rightShoe);
    root.add(rightLegPivot);

    // Tronco / Torso arredondado (y = 0.72 a 1.62)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.15, 0);
    const torsoMesh = new THREE.Mesh(
      new RoundedBoxGeometry(0.86, 0.9, 0.5, 4, 0.145),
      shirtMat
    );
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    torsoGroup.add(torsoMesh);

    // Pescoço arredondado conectando torso e cabeça
    const neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.19, 0.16, 16),
      skinMat
    );
    neckMesh.position.set(0, 0.48, 0);
    torsoGroup.add(neckMesh);

    // Estrela / detalhe no peito (como na camisa vermelha da referência)
    if (c.hasShirtStar && !c.accessories.includes('suit')) {
      const starMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.072, 0),
        new THREE.MeshStandardMaterial({ color: c.shirtAccentColor, roughness: 0.45 })
      );
      starMesh.position.set(-0.18, 0.14, 0.255);
      starMesh.scale.set(1, 1, 0.35);
      torsoGroup.add(starMesh);
    }

    // Acessório: Faixa Presidencial (verde e amarela diagonal arredondada)
    if (c.accessories.includes('sash')) {
      const sashGroup = new THREE.Group();
      const greenSash = new THREE.Mesh(
        new RoundedBoxGeometry(0.22, 1.02, 0.53, 3, 0.05),
        new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.6 })
      );
      greenSash.rotation.z = -0.58;
      const yellowSash = new THREE.Mesh(
        new RoundedBoxGeometry(0.09, 1.03, 0.54, 2, 0.03),
        new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 })
      );
      yellowSash.rotation.z = -0.58;
      sashGroup.add(greenSash, yellowSash);
      torsoGroup.add(sashGroup);
    }

    // Acessório: Terno / Gravata
    if (c.accessories.includes('suit') || c.accessories.includes('tie')) {
      const shirtTriangle = new THREE.Mesh(
        new RoundedBoxGeometry(0.26, 0.36, 0.51, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 })
      );
      shirtTriangle.position.set(0, 0.24, 0.01);
      torsoGroup.add(shirtTriangle);

      const tieMesh = new THREE.Mesh(
        new RoundedBoxGeometry(0.11, 0.48, 0.53, 2, 0.03),
        new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 })
      );
      tieMesh.position.set(0, 0.12, 0.01);
      torsoGroup.add(tieMesh);
    }

    // Acessório: Crachá / Badge
    if (c.accessories.includes('badge')) {
      const badgeMesh = new THREE.Mesh(
        new RoundedBoxGeometry(0.18, 0.22, 0.04, 2, 0.015),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 })
      );
      badgeMesh.position.set(0.22, 0.1, 0.26);
      torsoGroup.add(badgeMesh);
    }

    root.add(torsoGroup);

    // Helper para criar mão arredondada visível com polegar
    function createHandMesh(sideSign: number) {
      const handGroup = new THREE.Group();
      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(0.125, 16, 14),
        skinMat
      );
      palm.scale.set(0.92, 1.05, 0.85);
      palm.castShadow = true;
      handGroup.add(palm);

      const thumb = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 12, 10),
        skinMat
      );
      thumb.position.set(sideSign * -0.085, 0.02, 0.055);
      handGroup.add(thumb);
      return handGroup;
    }

    // Braços arredondados com pivô no ombro e mãos visíveis
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.54, 1.48, 0);
    const leftArm = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.58, 0.26, 3, 0.085),
      shirtMat
    );
    leftArm.position.y = -0.25;
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);
    const leftHand = createHandMesh(-1);
    leftHand.position.set(0, -0.61, 0.01);
    leftArmPivot.add(leftHand);
    root.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.54, 1.48, 0);
    const rightArm = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.58, 0.26, 3, 0.085),
      shirtMat
    );
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    rightArmPivot.add(rightArm);
    const rightHand = createHandMesh(1);
    rightHand.position.set(0, -0.61, 0.01);
    rightArmPivot.add(rightHand);

    // Acessório: Microfone na mão direita
    if (c.accessories.includes('microphone')) {
      const micGroup = new THREE.Group();
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10),
        new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 })
      );
      const capsule = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 12),
        new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.4, roughness: 0.4 })
      );
      capsule.position.y = 0.16;
      micGroup.add(handle, capsule);
      micGroup.position.set(0, -0.66, 0.18);
      micGroup.rotation.x = Math.PI / 3;
      rightArmPivot.add(micGroup);
    }

    root.add(rightArmPivot);

    // Cabeça Chibi grande com cantos bem arredondados (y = 1.66)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.66, 0);
    const hs = c.headScale;

    const headBox = new THREE.Mesh(
      new RoundedBoxGeometry(0.8 * hs, 0.75 * hs, 0.72 * hs, 4, 0.175 * hs),
      skinMat
    );
    headBox.position.y = 0.36 * hs;
    headBox.castShadow = true;
    headBox.receiveShadow = true;
    headPivot.add(headBox);

    // Orelhas arredondadas
    const leftEar = new THREE.Mesh(
      new RoundedBoxGeometry(0.11 * hs, 0.2 * hs, 0.14 * hs, 3, 0.045 * hs),
      skinMat
    );
    leftEar.position.set(-0.42 * hs, 0.36 * hs, 0);
    const rightEar = leftEar.clone();
    rightEar.position.x = 0.42 * hs;
    headPivot.add(leftEar, rightEar);

    // Olhos expressivos com volume suave e brilho duplo
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.22 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    const leftEye = new THREE.Mesh(
      new RoundedBoxGeometry(0.1 * hs, 0.125 * hs, 0.055 * hs, 3, 0.035 * hs),
      eyeMat
    );
    leftEye.position.set(-0.17 * hs, 0.42 * hs, 0.355 * hs);
    const leftShine = new THREE.Mesh(
      new THREE.SphereGeometry(0.022 * hs, 10, 10),
      pupilMat
    );
    leftShine.position.set(-0.15 * hs, 0.445 * hs, 0.382 * hs);

    const rightEye = new THREE.Mesh(
      new RoundedBoxGeometry(0.1 * hs, 0.125 * hs, 0.055 * hs, 3, 0.035 * hs),
      eyeMat
    );
    rightEye.position.set(0.17 * hs, 0.42 * hs, 0.355 * hs);
    const rightShine = new THREE.Mesh(
      new THREE.SphereGeometry(0.022 * hs, 10, 10),
      pupilMat
    );
    rightShine.position.set(0.19 * hs, 0.445 * hs, 0.382 * hs);
    headPivot.add(leftEye, leftShine, rightEye, rightShine);

    // Sobrancelhas arredondadas
    const browL = new THREE.Mesh(
      new RoundedBoxGeometry(0.16 * hs, 0.048 * hs, 0.06 * hs, 2, 0.02 * hs),
      hairMat
    );
    browL.position.set(-0.17 * hs, 0.535 * hs, 0.36 * hs);
    const browR = browL.clone();
    browR.position.x = 0.17 * hs;
    headPivot.add(browL, browR);

    // Nariz com volume arredondado
    const nose = new THREE.Mesh(
      new RoundedBoxGeometry(0.115 * hs, 0.11 * hs, 0.125 * hs, 3, 0.045 * hs),
      skinMat
    );
    nose.position.set(0, 0.34 * hs, 0.385 * hs);
    nose.castShadow = true;
    headPivot.add(nose);

    // Boca com leve volume 3D (contorno labial + sorriso branco interno animável)
    const mouth = new THREE.Group();
    const mouthLip = new THREE.Mesh(
      new RoundedBoxGeometry(0.2 * hs, 0.085 * hs, 0.065 * hs, 3, 0.03 * hs),
      new THREE.MeshStandardMaterial({ color: '#3b1d0e', roughness: 0.65 })
    );
    const mouthTeeth = new THREE.Mesh(
      new RoundedBoxGeometry(0.165 * hs, 0.058 * hs, 0.072 * hs, 2, 0.02 * hs),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 })
    );
    mouthTeeth.position.z = 0.005 * hs;
    mouth.add(mouthLip, mouthTeeth);
    mouth.position.set(0, 0.165 * hs, 0.375 * hs);
    headPivot.add(mouth);

    // Barba volumosa e "fofa" (blocos arredondados + agrupamento de esferas no maxilar)
    if (c.hasBeard) {
      const beardGroup = new THREE.Group();
      const chinBlock = new THREE.Mesh(
        new RoundedBoxGeometry(0.83 * hs, 0.28 * hs, 0.76 * hs, 4, 0.12 * hs),
        beardMat
      );
      chinBlock.position.set(0, 0.115 * hs, 0.03 * hs);
      chinBlock.castShadow = true;

      const mustache = new THREE.Mesh(
        new RoundedBoxGeometry(0.42 * hs, 0.095 * hs, 0.15 * hs, 3, 0.042 * hs),
        beardMat
      );
      mustache.position.set(0, 0.252 * hs, 0.365 * hs);

      const sideBeardL = new THREE.Mesh(
        new RoundedBoxGeometry(0.16 * hs, 0.42 * hs, 0.74 * hs, 3, 0.07 * hs),
        beardMat
      );
      sideBeardL.position.set(-0.37 * hs, 0.24 * hs, 0.02 * hs);
      const sideBeardR = sideBeardL.clone();
      sideBeardR.position.x = 0.37 * hs;

      beardGroup.add(chinBlock, mustache, sideBeardL, sideBeardR);

      // Puffs esféricos na barba para aspecto orgânico e "fofo" como na referência
      const beardPuffs: Array<[number, number, number, number]> = [
        [-0.28, 0.08, 0.31, 0.12],
        [-0.14, 0.06, 0.34, 0.125],
        [0.0, 0.05, 0.35, 0.13],
        [0.14, 0.06, 0.34, 0.125],
        [0.28, 0.08, 0.31, 0.12],
        [-0.36, 0.18, 0.26, 0.115],
        [0.36, 0.18, 0.26, 0.115],
      ];
      for (const [px, py, pz, pr] of beardPuffs) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(pr * hs, 12, 10),
          beardMat
        );
        puff.position.set(px * hs, py * hs, pz * hs);
        beardGroup.add(puff);
      }

      headPivot.add(beardGroup);
      mouth.position.z = 0.415 * hs;
    }

    // Óculos retangulares arredondados em 3D (armação + ponte + hastes laterais + lente translúcida)
    if (c.hasGlasses) {
      const gMat = new THREE.MeshStandardMaterial({ color: c.glassesColor, roughness: 0.35 });
      const lensMat = new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        transparent: true,
        opacity: 0.14,
        roughness: 0.15,
      });
      const glassGroup = new THREE.Group();
      const createFrame = (cx: number) => {
        const f = new THREE.Group();
        const top = new THREE.Mesh(
          new RoundedBoxGeometry(0.28 * hs, 0.04 * hs, 0.065 * hs, 2, 0.015 * hs),
          gMat
        );
        top.position.y = 0.092 * hs;
        const bot = top.clone();
        bot.position.y = -0.092 * hs;
        const left = new THREE.Mesh(
          new RoundedBoxGeometry(0.04 * hs, 0.205 * hs, 0.065 * hs, 2, 0.015 * hs),
          gMat
        );
        left.position.x = -0.125 * hs;
        const right = left.clone();
        right.position.x = 0.125 * hs;
        const lens = new THREE.Mesh(
          new THREE.BoxGeometry(0.23 * hs, 0.16 * hs, 0.02 * hs),
          lensMat
        );
        f.add(top, bot, left, right, lens);
        f.position.set(cx, 0.42 * hs, 0.388 * hs);
        return f;
      };
      const bridge = new THREE.Mesh(
        new RoundedBoxGeometry(0.12 * hs, 0.038 * hs, 0.06 * hs, 2, 0.014 * hs),
        gMat
      );
      bridge.position.set(0, 0.44 * hs, 0.388 * hs);

      // Hastes laterais dos óculos indo até as orelhas
      const templeL = new THREE.Mesh(
        new RoundedBoxGeometry(0.032 * hs, 0.036 * hs, 0.36 * hs, 2, 0.012 * hs),
        gMat
      );
      templeL.position.set(-0.395 * hs, 0.43 * hs, 0.2 * hs);
      const templeR = templeL.clone();
      templeR.position.x = 0.395 * hs;

      glassGroup.add(createFrame(-0.18 * hs), createFrame(0.18 * hs), bridge, templeL, templeR);
      headPivot.add(glassGroup);
    }

    // Cabelo volumoso e "fofo" (agrupamentos de esferas + blocos arredondados)
    if (c.hairStyle !== 'bald') {
      const hairGroup = new THREE.Group();
      if (c.hairStyle === 'afro') {
        const topMain = new THREE.Mesh(
          new RoundedBoxGeometry(0.95 * hs, 0.42 * hs, 0.88 * hs, 4, 0.18 * hs),
          hairMat
        );
        topMain.position.set(0, 0.77 * hs, -0.02 * hs);
        topMain.castShadow = true;

        const topCrown = new THREE.Mesh(
          new RoundedBoxGeometry(0.8 * hs, 0.26 * hs, 0.76 * hs, 4, 0.13 * hs),
          hairMat
        );
        topCrown.position.set(0, 0.94 * hs, -0.02 * hs);

        const backHair = new THREE.Mesh(
          new RoundedBoxGeometry(0.92 * hs, 0.62 * hs, 0.32 * hs, 4, 0.14 * hs),
          hairMat
        );
        backHair.position.set(0, 0.52 * hs, -0.32 * hs);

        const sideL = new THREE.Mesh(
          new RoundedBoxGeometry(0.22 * hs, 0.44 * hs, 0.78 * hs, 3, 0.09 * hs),
          hairMat
        );
        sideL.position.set(-0.42 * hs, 0.62 * hs, -0.02 * hs);
        const sideR = sideL.clone();
        sideR.position.x = 0.42 * hs;

        hairGroup.add(topMain, topCrown, backHair, sideL, sideR);

        // Agrupamento de esferas/puffs para silhueta afro "fofa" igual à referência
        const afroPuffs: Array<[number, number, number, number]> = [
          [-0.32, 0.82, 0.28, 0.18],
          [-0.11, 0.86, 0.32, 0.19],
          [0.11, 0.86, 0.32, 0.19],
          [0.32, 0.82, 0.28, 0.18],
          [-0.38, 0.68, 0.22, 0.17],
          [0.38, 0.68, 0.22, 0.17],
          [-0.26, 0.96, 0.08, 0.21],
          [0.0, 1.0, 0.06, 0.22],
          [0.26, 0.96, 0.08, 0.21],
          [-0.24, 0.94, -0.2, 0.2],
          [0.0, 0.97, -0.22, 0.21],
          [0.24, 0.94, -0.2, 0.2],
          [-0.43, 0.75, -0.05, 0.19],
          [0.43, 0.75, -0.05, 0.19],
        ];
        for (const [px, py, pz, pr] of afroPuffs) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(pr * hs, 14, 12),
            hairMat
          );
          puff.position.set(px * hs, py * hs, pz * hs);
          puff.castShadow = true;
          hairGroup.add(puff);
        }
      } else if (c.hairStyle === 'short') {
        const top = new THREE.Mesh(
          new RoundedBoxGeometry(0.84 * hs, 0.24 * hs, 0.8 * hs, 3, 0.1 * hs),
          hairMat
        );
        top.position.set(0, 0.74 * hs, 0);
        const back = new THREE.Mesh(
          new RoundedBoxGeometry(0.82 * hs, 0.48 * hs, 0.22 * hs, 3, 0.09 * hs),
          hairMat
        );
        back.position.set(0, 0.52 * hs, -0.31 * hs);
        hairGroup.add(top, back);
      } else if (c.hairStyle === 'long') {
        const top = new THREE.Mesh(
          new RoundedBoxGeometry(0.86 * hs, 0.26 * hs, 0.82 * hs, 3, 0.11 * hs),
          hairMat
        );
        top.position.set(0, 0.74 * hs, 0);
        const back = new THREE.Mesh(
          new RoundedBoxGeometry(0.86 * hs, 0.92 * hs, 0.26 * hs, 3, 0.11 * hs),
          hairMat
        );
        back.position.set(0, 0.34 * hs, -0.31 * hs);
        hairGroup.add(top, back);
      } else if (c.hairStyle === 'bun') {
        const top = new THREE.Mesh(
          new RoundedBoxGeometry(0.84 * hs, 0.24 * hs, 0.8 * hs, 3, 0.1 * hs),
          hairMat
        );
        top.position.set(0, 0.74 * hs, 0);
        const bun = new THREE.Mesh(
          new THREE.SphereGeometry(0.22 * hs, 14, 14),
          hairMat
        );
        bun.position.set(0, 0.95 * hs, -0.2 * hs);
        hairGroup.add(top, bun);
      }
      headPivot.add(hairGroup);
    }

    // Acessório: Chapéu / Capacete de obra amarelo arredondado
    if (c.accessories.includes('hat')) {
      const hatMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.45 });
      const dome = new THREE.Mesh(
        new RoundedBoxGeometry(0.92 * hs, 0.34 * hs, 0.88 * hs, 4, 0.14 * hs),
        hatMat
      );
      dome.position.set(0, 0.86 * hs, 0);
      const brim = new THREE.Mesh(
        new RoundedBoxGeometry(0.96 * hs, 0.08 * hs, 1.02 * hs, 3, 0.035 * hs),
        hatMat
      );
      brim.position.set(0, 0.7 * hs, 0.08 * hs);
      headPivot.add(dome, brim);
    }

    root.add(headPivot);

    root.userData = {
      headPivot,
      torsoGroup,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      mouth,
      browL,
      browR,
    };

    return root;
  }

  // ==========================================================================
  // APLICAÇÃO DETERMINÍSTICA DE POSES PROCEDURAIS EM FUNÇÃO DE t (segundos)
  // ==========================================================================
  function applyCharacterPose(charGroup: any, pose: CharacterPose, t: number) {
    const u = charGroup?.userData;
    if (!u) return;

    // Reset básico
    u.headPivot.rotation.set(0, 0, 0);
    u.torsoGroup.rotation.set(0, 0, 0);
    u.leftArmPivot.rotation.set(0, 0, 0);
    u.rightArmPivot.rotation.set(0, 0, 0);
    u.leftLegPivot.rotation.set(0, 0, 0);
    u.rightLegPivot.rotation.set(0, 0, 0);
    u.mouth.scale.set(1, 0.65, 1);

    const breathe = Math.sin(t * 2.6) * 0.022;
    u.torsoGroup.position.y = 1.15 + breathe;
    u.headPivot.position.y = 1.66 + breathe * 1.2;

    // Lip-sync procedural quando falando/comemorando/apontando
    if (['talking', 'celebrating', 'pointing', 'waving'].includes(pose)) {
      const jaw = 0.55 + Math.abs(Math.sin(t * 11.5)) * 0.75 + Math.abs(Math.cos(t * 7.3)) * 0.3;
      u.mouth.scale.set(1, jaw, 1);
    }

    switch (pose) {
      case 'idle':
        u.headPivot.rotation.y = Math.sin(t * 1.4) * 0.08;
        u.leftArmPivot.rotation.z = 0.08;
        u.rightArmPivot.rotation.z = -0.08;
        break;

      case 'talking':
        u.headPivot.rotation.y = Math.sin(t * 2.2) * 0.12;
        u.headPivot.rotation.x = Math.sin(t * 4.0) * 0.05;
        u.leftArmPivot.rotation.x = -0.45 + Math.sin(t * 4.5) * 0.25;
        u.leftArmPivot.rotation.z = 0.15;
        u.rightArmPivot.rotation.x = -0.55 + Math.cos(t * 4.2) * 0.28;
        u.rightArmPivot.rotation.z = -0.15;
        break;

      case 'waving':
        u.headPivot.rotation.z = Math.sin(t * 2.5) * 0.06;
        u.rightArmPivot.rotation.z = 2.45 + Math.sin(t * 8.0) * 0.22;
        u.rightArmPivot.rotation.x = -0.2;
        u.leftArmPivot.rotation.x = -0.25;
        u.leftArmPivot.rotation.z = -0.14;
        break;

      case 'celebrating':
        u.leftArmPivot.rotation.z = -2.42 - Math.sin(t * 7.5) * 0.14;
        u.rightArmPivot.rotation.z = 2.42 + Math.sin(t * 7.5) * 0.14;
        u.leftArmPivot.rotation.x = -0.15;
        u.rightArmPivot.rotation.x = -0.15;
        u.headPivot.rotation.x = -0.06 + Math.sin(t * 5.0) * 0.05;
        charGroup.position.y = (charGroup.userData.baseY || 0) + Math.abs(Math.sin(t * 5.5)) * 0.08;
        break;

      case 'pointing':
        u.rightArmPivot.rotation.x = -1.35 + Math.sin(t * 3.5) * 0.1;
        u.rightArmPivot.rotation.z = 0.35;
        u.headPivot.rotation.y = -0.18;
        u.leftArmPivot.rotation.x = -0.25;
        u.leftArmPivot.rotation.z = -0.12;
        break;

      case 'walking':
        u.leftLegPivot.rotation.x = Math.sin(t * 6.5) * 0.55;
        u.rightLegPivot.rotation.x = -Math.sin(t * 6.5) * 0.55;
        u.leftArmPivot.rotation.x = -Math.sin(t * 6.5) * 0.45;
        u.rightArmPivot.rotation.x = Math.sin(t * 6.5) * 0.45;
        break;

      case 'pulling-lever': {
        const pull = Math.min(1, Math.max(0, (t - 0.4) / 1.4));
        u.rightArmPivot.rotation.x = -1.1 + pull * 0.75;
        u.torsoGroup.rotation.x = 0.12 * pull;
        u.headPivot.rotation.y = -0.25;
        break;
      }

      case 'typing':
        u.leftArmPivot.rotation.x = -1.15 + Math.sin(t * 14) * 0.12;
        u.rightArmPivot.rotation.x = -1.15 + Math.cos(t * 14) * 0.12;
        u.headPivot.rotation.x = 0.15;
        break;

      case 'thinking':
        u.rightArmPivot.rotation.x = -1.75;
        u.rightArmPivot.rotation.z = 0.35;
        u.headPivot.rotation.z = 0.12;
        u.headPivot.rotation.x = -0.08;
        break;

      case 'sad':
        u.headPivot.rotation.x = 0.26;
        u.torsoGroup.rotation.x = 0.1;
        u.leftArmPivot.rotation.z = 0.05;
        u.rightArmPivot.rotation.z = -0.05;
        break;
    }
  }

  // ==========================================================================
  // (b) 11 TEMPLATES DE CENÁRIO 3D PROCEDURAIS COM LAYOUTS BALANCEADOS
  // ==========================================================================
  function buildStageTemplate(
    scene: any,
    config: Scene3DRenderConfig
  ): { update: (t: number, progress: number) => void; mainChar: any } {
    const props = config.templateProps || {};
    const mainChar = createBlockyCharacter(config.character);
    mainChar.userData.baseY = 0;
    scene.add(mainChar);

    const dynamicUpdaters: Array<(t: number, progress: number) => void> = [];

    // 1. RED CARPET + CONFETTI
    if (config.template === 'red-carpet-confetti') {
      scene.background = new THREE.Color(props.wallColor || '#58534f');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(22, 24),
          new THREE.MeshStandardMaterial({ color: props.floorColor || '#d5cfc7', roughness: 0.78 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      // Tapete vermelho central (marcado ignoreFraming para não esticar o bbox em Z)
      const carpet = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.BoxGeometry(2.3, 0.04, 18),
          new THREE.MeshStandardMaterial({ color: props.carpetColor || '#c1121f', roughness: 0.72 })
        )
      );
      carpet.position.set(0, 0.02, 1.5);
      carpet.receiveShadow = true;
      scene.add(carpet);

      const wall = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.BoxGeometry(20, 14, 0.4),
          new THREE.MeshStandardMaterial({ color: props.wallColor || '#58534f', roughness: 0.85 })
        )
      );
      wall.position.set(0, 7, -4.2);
      scene.add(wall);

      const baseboard = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.BoxGeometry(20, 0.85, 0.48),
          new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6 })
        )
      );
      baseboard.position.set(0, 0.42, -4.15);
      scene.add(baseboard);

      if (props.spotlightBeam !== false) {
        const beam = markIgnoreFraming(
          new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 7.2, 24, 1, true),
            new THREE.MeshBasicMaterial({
              color: '#ffffff',
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
            })
          )
        );
        beam.position.set(0, 3.6, -3.0);
        scene.add(beam);
      }

      // Pedestais dourados próximos ao tapete
      for (const side of [-1.18, 1.18]) {
        for (const zPos of [-0.75, 0.85]) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.075, 0.9, 12),
            new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.55, roughness: 0.3 })
          );
          post.position.set(side, 0.45, zPos);
          scene.add(post);
        }
      }

      // Chuva de confetes 3D determinísticos
      const rng = createRng(2030);
      const confettiColors = ['#f5c518', '#ef4444', '#38bdf8', '#22c55e', '#f8fafc'];
      const confettiMeshes: any[] = [];
      const count = props.confettiCount || 50;
      for (let i = 0; i < count; i++) {
        const conf = markIgnoreFraming(
          new THREE.Mesh(
            new THREE.BoxGeometry(0.11, 0.06, 0.02),
            new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length] })
          )
        );
        conf.userData = {
          ...conf.userData,
          x0: (rng() - 0.5) * 4.6,
          y0: 0.8 + rng() * 5.2,
          z0: -1.8 + rng() * 3.6,
          speed: 0.7 + rng() * 0.9,
          rotSpeed: 2.0 + rng() * 4.0,
        };
        scene.add(conf);
        confettiMeshes.push(conf);
      }

      dynamicUpdaters.push((t) => {
        for (const c of confettiMeshes) {
          const u = c.userData;
          const y = (((u.y0 - t * u.speed) % 5.2) + 5.2) % 5.2 + 0.25;
          c.position.set(u.x0 + Math.sin(t * 2 + u.y0) * 0.14, y, u.z0);
          c.rotation.set(t * u.rotSpeed, t * u.rotSpeed * 0.7, t * 1.5);
        }
      });
    }

    // 2. PULPIT / PLENARY (Púlpito + Plenário + Painel de Votação 257)
    else if (config.template === 'pulpit-plenary') {
      scene.background = new THREE.Color('#182b1d');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#1b4332', roughness: 0.8 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const backWall = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.BoxGeometry(20, 14, 0.4),
          new THREE.MeshStandardMaterial({ color: '#3d2817', roughness: 0.78 })
        )
      );
      backWall.position.set(0, 6, -3.2);
      scene.add(backWall);

      // Púlpito de madeira em frente ao personagem
      const pulpit = new THREE.Mesh(
        new RoundedBoxGeometry(1.45, 1.32, 0.78, 3, 0.06),
        new THREE.MeshStandardMaterial({ color: '#6f4518', roughness: 0.68 })
      );
      pulpit.position.set(0, 0.66, 0.62);
      pulpit.castShadow = true;
      scene.add(pulpit);

      const pulpitTop = new THREE.Mesh(
        new RoundedBoxGeometry(1.62, 0.14, 0.88, 3, 0.04),
        new THREE.MeshStandardMaterial({ color: '#583101', roughness: 0.62 })
      );
      pulpitTop.position.set(0, 1.35, 0.62);
      scene.add(pulpitTop);

      // Placa vermelha frontal do partido/movimento no púlpito
      const partyPlaque = createSignMesh(props.partyLabel || 'SIM 2030', {
        w: 0.9,
        h: 0.36,
        d: 0.06,
        bgColor: props.partyColor || '#c1121f',
        textColor: '#ffffff',
        fontSize: 90,
      });
      partyPlaque.position.set(0, 1.04, 1.03);
      scene.add(partyPlaque);

      // Telão superior do plenário posicionado acima do cabelo afro para nunca ser coberto
      const screenMesh = createSignMesh(
        `${props.screenTitle || 'VOTAÇÃO EM PLENÁRIO'}\n${props.screenNumber || '257'}`,
        {
          w: 2.65,
          h: 1.18,
          d: 0.1,
          bgColor: '#0f172a',
          textColor: '#f5c518',
          subText: props.screenSub || 'VOTOS NECESSÁRIOS DE 513',
          subColor: '#f8fafc',
          fontSize: 66,
          subFontSize: 30,
          borderColor: '#475569',
          texW: 768,
          texH: 360,
        }
      );
      screenMesh.position.set(0, 3.86, -1.15);
      scene.add(screenMesh);

      const flag = createBrazilFlag(0.75);
      flag.position.set(-1.42, 0.85, -0.65);
      scene.add(flag);

      if (props.showHemicycle !== false) {
        const arcGroup = new THREE.Group();
        for (let i = -3; i <= 3; i++) {
          const angle = (i / 4) * 0.75;
          const desk = new THREE.Mesh(
            new RoundedBoxGeometry(0.38, 0.32, 0.24, 2, 0.03),
            new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.72 })
          );
          desk.position.set(Math.sin(angle) * 1.65, 0.16, 1.15 + Math.cos(angle) * 0.45);
          desk.rotation.y = angle;
          arcGroup.add(desk);
        }
        scene.add(arcGroup);
      }
    }

    // 3. BRAZIL MAP 3D (Mapa do Brasil 3D extrudado + marcadores + pílula/rotas)
    else if (config.template === 'brazil-map-3d') {
      scene.background = new THREE.Color(props.bgColor || '#003566');

      // Personagem inteiro à esquerda apontando para o mapa
      mainChar.position.set(-1.12, 0, 0.25);
      mainChar.rotation.y = 0.38;
      mainChar.scale.setScalar(0.74);

      const brPoints: Array<[number, number]> = [
        [-0.85, 1.35],
        [-0.35, 1.15],
        [0.15, 1.32],
        [0.45, 0.95],
        [1.15, 0.78],
        [1.58, 0.55],
        [1.45, 0.15],
        [1.15, -0.38],
        [0.72, -0.78],
        [0.45, -1.18],
        [0.15, -1.55],
        [-0.18, -1.25],
        [-0.08, -0.75],
        [-0.45, -0.35],
        [-0.78, -0.05],
        [-1.45, 0.22],
        [-1.55, 0.68],
        [-1.18, 1.05],
      ];

      const shape = new THREE.Shape();
      brPoints.forEach(([x, y], idx) => {
        if (idx === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      shape.closePath();

      const mapGeom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.26,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
      });

      const mapGroup = new THREE.Group();
      const mapMesh = new THREE.Mesh(
        mapGeom,
        new THREE.MeshStandardMaterial({
          color: props.mapColor || '#52b788',
          roughness: 0.55,
          metalness: 0.04,
        })
      );
      mapMesh.castShadow = true;
      mapMesh.receiveShadow = true;
      mapGroup.add(mapMesh);

      if (props.showRoutes !== false) {
        const routeMat = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.4 });
        const line1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), routeMat);
        line1.position.set(0.15, 0.1, 0.32);
        line1.rotation.z = 0.35;
        mapGroup.add(line1);
      }

      if (props.showPill) {
        const pillGroup = new THREE.Group();
        const redHalf = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.58, 20),
          new THREE.MeshStandardMaterial({ color: '#d62828', roughness: 0.3 })
        );
        redHalf.position.y = -0.29;
        const redCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 20, 16),
          new THREE.MeshStandardMaterial({ color: '#d62828', roughness: 0.3 })
        );
        redCap.position.y = -0.58;

        const whiteHalf = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.58, 20),
          new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
        );
        whiteHalf.position.y = 0.29;
        const whiteCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 20, 16),
          new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
        );
        whiteCap.position.y = 0.58;

        pillGroup.add(redHalf, redCap, whiteHalf, whiteCap);
        pillGroup.rotation.z = -1.15;
        pillGroup.position.set(0.12, 0.18, 0.54);
        mapGroup.add(pillGroup);
      }

      const markers = Array.isArray(props.markers)
        ? props.markers
        : [
            { label: 'MINÉRIO', x: 0.55, y: 0.15, color: '#f5c518' },
            { label: 'SOJA', x: -0.15, y: -0.25, color: '#e63946' },
          ];
      markers.forEach((m: any, idx: number) => {
        const pin = createSignMesh(m.label || `PONTO ${idx + 1}`, {
          w: 0.82,
          h: 0.26,
          d: 0.07,
          bgColor: '#0f172a',
          textColor: '#ffffff',
          borderColor: m.color || '#f5c518',
          fontSize: 62,
        });
        pin.position.set(m.x ?? 0.3, m.y ?? 0, 0.45 + idx * 0.07);
        mapGroup.add(pin);
      });

      mapGroup.scale.setScalar(0.8);
      mapGroup.position.set(0.38, 1.85, -0.35);
      mapGroup.rotation.x = -0.26;
      scene.add(mapGroup);

      dynamicUpdaters.push((t) => {
        mapGroup.rotation.y = Math.sin(t * 0.9) * 0.12;
        mapGroup.position.y = 1.85 + Math.sin(t * 1.8) * 0.04;
      });
    }

    // 4. CITY SPENDING CAP (Prédios HOSPITAL/ESCOLA/POSTO + Placa TETO DE GASTOS + Alavanca)
    else if (config.template === 'city-spending-cap') {
      scene.background = new THREE.Color('#2563eb');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#b5a886', roughness: 0.82 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const lawn = new THREE.Mesh(
        new RoundedBoxGeometry(2.9, 0.08, 2.2, 2, 0.03),
        new THREE.MeshStandardMaterial({ color: '#70974c', roughness: 0.78 })
      );
      lawn.position.set(-0.42, 0.04, -0.25);
      scene.add(lawn);

      // Postes pretos laterais dimensionados para caber inteiros no enquadramento
      for (const xPole of [-1.72, 0.88]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 3.45, 12),
          new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.4, roughness: 0.5 })
        );
        pole.position.set(xPole, 1.725, -0.25);
        scene.add(pole);
      }

      // Viga suspensa TETO DE GASTOS centralizada entre os postes
      const beamMesh = createSignMesh(props.beamLabel || 'TETO DE GASTOS', {
        w: 2.68,
        h: 0.42,
        d: 0.36,
        bgColor: '#d6d3c4',
        textColor: '#0f172a',
        fontSize: 64,
      });
      beamMesh.position.set(-0.42, 2.35, -0.25);
      scene.add(beamMesh);

      // 3 Prédios rotulados (HOSPITAL, ESCOLA, POSTO)
      const buildingDefs = Array.isArray(props.buildings)
        ? props.buildings
        : [
            { label: 'HOSPITAL', color: '#e63946', height: 1.0 },
            { label: 'ESCOLA', color: '#1d3557', height: 0.92 },
            { label: 'POSTO', color: '#2a9d8f', height: 0.85 },
          ];
      const buildingGroups: any[] = [];
      buildingDefs.slice(0, 3).forEach((b: any, idx: number) => {
        const bGroup = new THREE.Group();
        const xPos = -1.2 + idx * 0.78;
        const body = new THREE.Mesh(
          new RoundedBoxGeometry(0.68, 1.65, 0.64, 2, 0.03),
          new THREE.MeshStandardMaterial({ color: '#e5dec9', roughness: 0.72 })
        );
        body.position.y = 0.825;
        body.castShadow = true;
        bGroup.add(body);

        const winMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.35 });
        for (let r = 0; r < 3; r++) {
          for (let col = -1; col <= 1; col++) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.04), winMat);
            win.position.set(col * 0.19, 0.48 + r * 0.4, 0.33);
            bGroup.add(win);
          }
        }

        const roofSign = createSignMesh(b.label || 'PRÉDIO', {
          w: 0.66,
          h: 0.23,
          d: 0.1,
          bgColor: b.color || '#e63946',
          textColor: '#ffffff',
          fontSize: 66,
        });
        roofSign.position.set(0, 1.77, 0.16);
        bGroup.add(roofSign);

        bGroup.position.set(xPos, 0.08, -0.25);
        bGroup.userData = { baseScaleY: b.height || 0.9 };
        scene.add(bGroup);
        buildingGroups.push(bGroup);
      });

      // Alavanca no chão e personagem à direita dentro da margem segura
      mainChar.position.set(1.26, 0, 0.32);
      mainChar.rotation.y = -0.38;
      mainChar.scale.setScalar(0.72);

      const leverBase = new THREE.Mesh(
        new RoundedBoxGeometry(0.34, 0.14, 0.34, 2, 0.03),
        new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.6 })
      );
      leverBase.position.set(0.78, 0.07, 0.48);
      scene.add(leverBase);

      const leverPivot = new THREE.Group();
      leverPivot.position.set(0.78, 0.12, 0.48);
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.76, 10),
        new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5 })
      );
      stick.position.y = 0.38;
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 14, 14),
        new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35 })
      );
      knob.position.y = 0.76;
      leverPivot.add(stick, knob);
      scene.add(leverPivot);

      dynamicUpdaters.push((t, progress) => {
        const pull = props.leverPulled !== false ? Math.min(1, Math.max(0, (progress - 0.15) * 1.6)) : 0;
        leverPivot.rotation.z = 0.42 - pull * 0.84;
        beamMesh.position.y = 2.25 + pull * 0.65;
        buildingGroups.forEach((bg, idx) => {
          const s = bg.userData.baseScaleY * (0.86 + pull * 0.26 + Math.sin(t * 3 + idx) * 0.015);
          bg.scale.set(1, s, 1);
        });
      });
    }

    // 5. TIMELINE 3D / BARRELS (LÍTIO, NIÓBIO, TERRAS RARAS + etiqueta BRASIL)
    else if (config.template === 'timeline-3d') {
      scene.background = new THREE.Color('#c29b70');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#b58d63', roughness: 0.82 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      // Personagem à esquerda sem cobrir o barril de LÍTIO
      mainChar.position.set(-1.32, 0, 0.28);
      mainChar.rotation.y = 0.38;
      mainChar.scale.setScalar(0.7);

      // Bancada escalonada de madeira deslocada levemente à direita
      const tableBase = new THREE.Mesh(
        new RoundedBoxGeometry(2.75, 0.52, 1.95, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#9c6644', roughness: 0.72 })
      );
      tableBase.position.set(0.32, 0.52, -0.25);
      tableBase.castShadow = true;
      scene.add(tableBase);

      const tableStep = new THREE.Mesh(
        new RoundedBoxGeometry(2.68, 0.52, 0.9, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.72 })
      );
      tableStep.position.set(0.32, 1.04, -0.68);
      scene.add(tableStep);

      const milestones = Array.isArray(props.milestones)
        ? props.milestones
        : [
            { label: 'LÍTIO', tag: 'BRASIL', color: '#f4a261' },
            { label: 'NIÓBIO', tag: 'BRASIL', color: '#e9c46a' },
            { label: 'TERRAS RARAS', tag: 'BRASIL', color: '#e76f51' },
          ];

      const barrelGroups: any[] = [];
      milestones.slice(0, 3).forEach((m: any, idx: number) => {
        const xPos = -0.52 + idx * 0.84;
        const itemGroup = new THREE.Group();

        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.98, 20),
          new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.42, metalness: 0.25 })
        );
        barrel.position.set(xPos, 1.78, -0.68);
        barrel.castShadow = true;
        itemGroup.add(barrel);

        const tagPlaque = createSignMesh(m.tag || 'BRASIL', {
          w: 0.62,
          h: 0.24,
          d: 0.05,
          bgColor: '#16a34a',
          textColor: '#facc15',
          borderColor: '#facc15',
          fontSize: 70,
        });
        tagPlaque.position.set(xPos, 1.78, -0.32);
        itemGroup.add(tagPlaque);

        const crate = new THREE.Mesh(
          new RoundedBoxGeometry(0.76, 0.42, 0.7, 2, 0.03),
          new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.75 })
        );
        crate.position.set(xPos, 0.98, 0.16);
        itemGroup.add(crate);

        const labelSign = createSignMesh(m.label || `ITEM ${idx + 1}`, {
          w: 0.76,
          h: 0.24,
          d: 0.05,
          bgColor: '#0f172a',
          textColor: '#ffffff',
          fontSize: 58,
        });
        labelSign.position.set(xPos, 1.26, 0.5);
        itemGroup.add(labelSign);

        for (let c = -1; c <= 1; c++) {
          const crystal = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.14, 0),
            new THREE.MeshStandardMaterial({ color: m.color || '#f4a261', roughness: 0.38 })
          );
          crystal.position.set(xPos + c * 0.18, 1.24, 0.16);
          itemGroup.add(crystal);
        }

        scene.add(itemGroup);
        barrelGroups.push(itemGroup);
      });

      dynamicUpdaters.push((t, progress) => {
        barrelGroups.forEach((bg, idx) => {
          const appear = Math.min(1, Math.max(0, progress * 1.5 - idx * 0.2));
          bg.position.y = (1 - appear) * -0.3 + Math.sin(t * 2.5 + idx) * 0.025;
        });
      });
    }

    // 6. BAR CHART 3D (Gráfico de barras 3D sobre grade neon azul)
    else if (config.template === 'bar-chart-3d') {
      scene.background = new THREE.Color('#050811');

      const gridHelper = markIgnoreFraming(
        new THREE.GridHelper(18, 18, '#38bdf8', '#1d4ed8')
      );
      gridHelper.position.y = 0.01;
      scene.add(gridHelper);

      // Personagem à esquerda sem bloquear a barra ECONOMIA
      mainChar.position.set(-1.32, 0, 0.28);
      mainChar.rotation.y = 0.38;
      mainChar.scale.setScalar(0.7);

      const pedestal = new THREE.Mesh(
        new RoundedBoxGeometry(2.75, 0.5, 1.15, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 })
      );
      pedestal.position.set(0.32, 0.25, -0.25);
      scene.add(pedestal);

      const bars = Array.isArray(props.bars)
        ? props.bars
        : [
            { label: 'ECONOMIA', value: 84, color: '#52b788', topBadge: 'INVESTIMENTO' },
            { label: 'CONGRESSO', value: 72, color: '#f5c518', topBadge: 'EMPREGO' },
            { label: 'APROVAÇÃO', value: 91, color: '#48cae4', topBadge: 'VIDAS' },
          ];

      const barMeshes: any[] = [];
      bars.slice(0, 3).forEach((b: any, idx: number) => {
        const xPos = -0.52 + idx * 0.84;
        const maxH = ((b.value || 75) / 100) * 2.05;

        const barMesh = new THREE.Mesh(
          new RoundedBoxGeometry(0.6, maxH, 0.6, 3, 0.05),
          new THREE.MeshStandardMaterial({ color: b.color || '#52b788', roughness: 0.4 })
        );
        barMesh.position.set(xPos, 0.5 + maxH / 2, -0.25);
        barMesh.castShadow = true;
        barMesh.userData = { maxH };
        scene.add(barMesh);
        barMeshes.push(barMesh);

        const baseLabel = createSignMesh(b.label || `BARRA ${idx + 1}`, {
          w: 0.8,
          h: 0.28,
          d: 0.06,
          bgColor: '#0f172a',
          textColor: '#ffffff',
          fontSize: 56,
        });
        baseLabel.position.set(xPos, 0.25, 0.36);
        scene.add(baseLabel);

        if (b.topBadge) {
          const topCard = createSignMesh(b.topBadge, {
            w: 0.78,
            h: 0.44,
            d: 0.07,
            bgColor: b.color || '#38bdf8',
            textColor: '#0f172a',
            fontSize: 50,
          });
          topCard.position.set(xPos, 2.92, -0.25);
          scene.add(topCard);
        }
      });

      dynamicUpdaters.push((_t, progress) => {
        const grow = Math.min(1, Math.max(0.18, progress * 1.45));
        barMeshes.forEach((bm) => {
          const h = bm.userData.maxH * grow;
          bm.scale.y = grow;
          bm.position.y = 0.5 + h / 2;
        });
      });
    }

    // 7. STREET PROTEST / MULTIDÃO COM BANDEIRAS E PLACA "COMENTA AÍ"
    else if (config.template === 'street-protest') {
      scene.background = new THREE.Color(props.bgColor || '#6a040f');

      const rayGroup = markIgnoreFraming(new THREE.Group());
      for (let i = 0; i < 12; i++) {
        const ray = new THREE.Mesh(
          new THREE.BoxGeometry(0.75, 14, 0.05),
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? '#9d0208' : '#370617',
          })
        );
        ray.rotation.z = (i / 12) * Math.PI;
        rayGroup.add(ray);
      }
      rayGroup.position.set(0, 2.5, -4.8);
      scene.add(rayGroup);

      const podium = new THREE.Mesh(
        new RoundedBoxGeometry(1.9, 0.4, 1.15, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.65 })
      );
      podium.position.set(0, 0.2, 0.15);
      scene.add(podium);

      mainChar.position.set(0, 0.36, 0.15);
      mainChar.scale.setScalar(0.76);
      mainChar.userData.baseY = 0.36;

      // Placa amarela superior "COMENTA AÍ" posicionada acima do cabelo afro para nunca ser coberta
      const signMesh = createSignMesh(props.signText || 'COMENTA AÍ', {
        w: 2.1,
        h: 0.54,
        d: 0.09,
        bgColor: '#f5c518',
        textColor: '#0f172a',
        borderColor: '#ffffff',
        fontSize: 84,
      });
      signMesh.position.set(0, 3.28, 0.08);
      signMesh.rotation.z = 0.05;
      scene.add(signMesh);

      // Multidão de cabeças arredondadas 3D ao fundo
      const rng = createRng(777);
      const skinPalette = ['#7a4b2a', '#8d5524', '#c68642', '#e0ac69', '#5c3818'];
      const crowdCount = Math.min(35, props.crowdSize || 28);
      const crowdHeads: any[] = [];
      for (let i = 0; i < crowdCount; i++) {
        const head = new THREE.Mesh(
          new RoundedBoxGeometry(0.42, 0.42, 0.42, 3, 0.09),
          new THREE.MeshStandardMaterial({
            color: skinPalette[i % skinPalette.length],
            roughness: 0.78,
          })
        );
        const row = Math.floor(i / 7);
        const col = (i % 7) - 3;
        head.position.set(
          col * 0.56 + (rng() - 0.5) * 0.18,
          0.85 + row * 0.38,
          -0.55 - row * 0.65
        );
        scene.add(head);
        crowdHeads.push(head);
      }

      if (props.showFlags !== false) {
        const f1 = createBrazilFlag(0.65);
        f1.position.set(-1.32, 1.15, -0.65);
        f1.rotation.z = 0.14;
        const f2 = createBrazilFlag(0.65);
        f2.position.set(1.25, 1.1, -0.85);
        f2.rotation.z = -0.14;
        scene.add(f1, f2);
      }

      dynamicUpdaters.push((t) => {
        signMesh.rotation.z = 0.05 + Math.sin(t * 4) * 0.035;
        crowdHeads.forEach((h, i) => {
          h.position.y += Math.sin(t * 6 + i) * 0.0025;
        });
      });
    }

    // 8. CLASSROOM / OFFICE (Lousa / Quadro + Mesa com Notebook, estilo cena 2 da referência)
    else if (config.template === 'classroom-office') {
      scene.background = new THREE.Color(props.wallColor || '#7c2d12');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.8 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const board = createSignMesh(props.boardTitle || '44H POR SEMANA', {
        w: 2.35,
        h: 1.2,
        d: 0.1,
        bgColor: '#1e3a2f',
        textColor: '#ffffff',
        subText: props.boardSubtitle || 'SEG  TER  QUA  QUI  SEX',
        subColor: '#facc15',
        borderColor: '#78350f',
        fontSize: 70,
      });
      board.position.set(0.35, 2.55, -1.35);
      scene.add(board);

      const desk = new THREE.Mesh(
        new RoundedBoxGeometry(1.75, 0.12, 0.85, 2, 0.02),
        new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.68 })
      );
      desk.position.set(0.45, 0.88, -0.25);
      scene.add(desk);

      // Pernas da mesa como na referência
      for (const lx of [-0.75, 0.75]) {
        for (const lz of [-0.32, 0.32]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.86, 8),
            new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.7 })
          );
          leg.position.set(0.45 + lx, 0.43, -0.25 + lz);
          scene.add(leg);
        }
      }

      if (props.hasLaptop !== false) {
        const laptopBase = new THREE.Mesh(
          new RoundedBoxGeometry(0.5, 0.04, 0.38, 2, 0.01),
          new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.4 })
        );
        laptopBase.position.set(0.45, 0.96, -0.2);
        const laptopScreen = new THREE.Mesh(
          new RoundedBoxGeometry(0.5, 0.34, 0.035, 2, 0.01),
          new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.3 })
        );
        laptopScreen.position.set(0.45, 1.14, -0.36);
        laptopScreen.rotation.x = -0.15;
        scene.add(laptopBase, laptopScreen);
      }

      mainChar.position.set(-0.88, 0, 0.35);
      mainChar.scale.setScalar(0.82);
    }

    // 9. NEWS DESK / VELOCÍMETRO ECONÔMICO SELIC
    else if (config.template === 'news-desk') {
      scene.background = new THREE.Color('#3b2314');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#29170b', roughness: 0.8 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      const gaugeDisk = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.25, 0.12, 32, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 })
      );
      gaugeDisk.rotation.z = Math.PI / 2;
      gaugeDisk.rotation.y = Math.PI / 2;
      gaugeDisk.position.set(0, 2.55, -1.55);
      scene.add(gaugeDisk);

      const gaugeSign = createSignMesh(props.gaugeTitle || 'SELIC', {
        w: 1.65,
        h: 0.68,
        d: 0.08,
        bgColor: '#111827',
        textColor: '#ffffff',
        subText: props.gaugeValue || '15% AO ANO',
        subColor: '#ef4444',
        borderColor: '#ef4444',
        fontSize: 76,
      });
      gaugeSign.position.set(0, 2.85, -1.42);
      scene.add(gaugeSign);

      mainChar.position.set(-0.88, 0, 0.35);
      mainChar.rotation.y = 0.22;
      mainChar.scale.setScalar(0.76);

      const secondary =
        config.secondaryCharacters && config.secondaryCharacters[0]
          ? createBlockyCharacter(config.secondaryCharacters[0])
          : createBlockyCharacter({
              ...config.character,
              id: 'sec',
              skinColor: '#f1c27d',
              hairStyle: 'bun',
              hasBeard: false,
              shirtColor: '#f8fafc',
            });
      secondary.position.set(0.88, 0, 0.35);
      secondary.rotation.y = -0.22;
      secondary.scale.setScalar(0.76);
      scene.add(secondary);

      const rateCard = createSignMesh(props.gaugeValue || '15%', {
        w: 0.72,
        h: 0.62,
        d: 0.05,
        bgColor: '#ffffff',
        textColor: '#dc2626',
        subText: 'AO ANO',
        subColor: '#111827',
        fontSize: 90,
      });
      rateCard.position.set(0.88, 0.92, 0.78);
      scene.add(rateCard);
    }

    // 10. COURTROOM / CONSELHO COM BANCADA TRIPLA
    else if (config.template === 'courtroom') {
      scene.background = new THREE.Color(props.wallColor || '#d6ccc2');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#a89f91', roughness: 0.8 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      const topPlaque = createSignMesh(props.topBanner || 'MÃES DE VÍTIMAS', {
        w: 2.75,
        h: 0.54,
        d: 0.08,
        bgColor: '#292524',
        textColor: '#facc15',
        fontSize: 66,
      });
      topPlaque.position.set(0, 3.25, -1.65);
      scene.add(topPlaque);

      const subPlaque = createSignMesh(props.subBanner || 'CONSELHO POPULAR DE SEGURANÇA', {
        w: 2.35,
        h: 0.48,
        d: 0.08,
        bgColor: '#1d4ed8',
        textColor: '#ffffff',
        fontSize: 50,
      });
      subPlaque.position.set(0, 2.62, -1.65);
      scene.add(subPlaque);

      const table = new THREE.Mesh(
        new RoundedBoxGeometry(3.05, 0.82, 0.95, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.68 })
      );
      table.position.set(0, 0.41, 0.55);
      scene.add(table);

      mainChar.position.set(0, 0, -0.15);
      mainChar.scale.setScalar(0.76);

      const leftMember = createBlockyCharacter({
        ...config.character,
        id: 'left-m',
        skinColor: '#7a4b2a',
        hairStyle: 'bun',
        hasBeard: false,
        hasGlasses: false,
        shirtColor: '#e11d48',
      });
      leftMember.position.set(-1.02, 0, -0.15);
      leftMember.scale.setScalar(0.76);

      const rightMember = createBlockyCharacter({
        ...config.character,
        id: 'right-m',
        skinColor: '#e0ac69',
        hairStyle: 'short',
        hairColor: '#9ca3af',
        hasBeard: false,
        shirtColor: '#f59e0b',
      });
      rightMember.position.set(1.02, 0, -0.15);
      rightMember.scale.setScalar(0.76);
      scene.add(leftMember, rightMember);
    }

    // 11. SPOTLIGHT CLOSE / CARD DE REDE SOCIAL
    else {
      scene.background = new THREE.Color('#141418');
      const floor = markIgnoreFraming(
        new THREE.Mesh(
          new THREE.PlaneGeometry(20, 22),
          new THREE.MeshStandardMaterial({ color: '#1f1f26', roughness: 0.82 })
        )
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      mainChar.position.set(-0.85, 0, 0.35);
      mainChar.rotation.y = 0.32;
      mainChar.scale.setScalar(0.8);

      const socialCard = createSignMesh(props.cardTitle || 'MARCO SILVA', {
        w: 1.55,
        h: 2.15,
        d: 0.09,
        bgColor: '#ffffff',
        textColor: '#dc2626',
        subText: props.cardSubtitle || '1 milhão de seguidores',
        subColor: '#334155',
        borderColor: '#1e293b',
        fontSize: 62,
        texW: 512,
        texH: 720,
      });
      socialCard.position.set(0.76, 1.75, -0.35);
      scene.add(socialCard);
    }

    return {
      mainChar,
      update(t: number, progress: number) {
        applyCharacterPose(mainChar, config.pose, t);
        for (const fn of dynamicUpdaters) {
          fn(t, progress);
        }
      },
    };
  }

  // ==========================================================================
  // (c) CÁLCULO DE ENQUADRAMENTO POR TEMPLATE (BOUNDING BOX → SAFE ZONE 9:16)
  // ==========================================================================
  function isIgnoredForFraming(obj: any): boolean {
    let curr = obj;
    while (curr) {
      if (curr.userData && curr.userData.ignoreFraming) return true;
      curr = curr.parent;
    }
    return false;
  }

  function computeTemplateFraming(
    threeScene: any,
    stage: { update: (t: number, progress: number) => void; mainChar: any },
    duration: number,
    fovDeg: number,
    aspect: number
  ): TemplateCameraFraming {
    const overallBox = new THREE.Box3();
    const meshBox = new THREE.Box3();

    // Amostra o bounding box tanto no início (t=0) quanto no fim (t=duration, ex.: viga erguida / barras crescidas)
    for (const [sampleT, sampleP] of [
      [0, 0],
      [duration, 1],
    ]) {
      stage.update(sampleT, sampleP);
      threeScene.updateMatrixWorld(true);
      threeScene.traverse((node: any) => {
        if (!node || !node.isMesh) return;
        if (isIgnoredForFraming(node)) return;
        meshBox.setFromObject(node);
        if (!meshBox.isEmpty()) {
          overallBox.union(meshBox);
        }
      });
    }

    // Restaura estado t = 0
    stage.update(0, 0);
    threeScene.updateMatrixWorld(true);

    if (overallBox.isEmpty()) {
      overallBox.min.set(-1.3, 0, -0.8);
      overallBox.max.set(1.3, 2.8, 0.8);
    }

    const boxWidth = Math.max(2.1, overallBox.max.x - overallBox.min.x);
    const boxHeight = Math.max(2.6, overallBox.max.y - overallBox.min.y);
    const lookX = (overallBox.min.x + overallBox.max.x) / 2;
    const centerY = (overallBox.min.y + overallBox.max.y) / 2;
    const lookZ = (overallBox.min.z + overallBox.max.z) / 2;
    const frontZ = overallBox.max.z;

    const alpha = Math.tan(((fovDeg * Math.PI) / 180) / 2);
    const beta = aspect * alpha;

    // Margem segura horizontal: >= 8-11% em cada borda lateral mesmo com movimento de câmera
    const usableHorizFraction = 0.78;
    const distForWidth = boxWidth / 2 / (usableHorizFraction * beta);

    // Margem segura vertical: ~19% livre no topo (títulos/badges) e ~29% livre na base (lower-third/legendas)
    const topSafeMargin = 0.19;
    const bottomSafeMargin = 0.29;
    const usableVertFraction = 1 - topSafeMargin - bottomSafeMargin; // 0.52
    const distForHeight = boxHeight / 2 / (usableVertFraction * alpha);

    // Garante que o personagem ocupe ~35–42% da altura da tela (nunca gigante nem cortado)
    const charScale = stage.mainChar?.scale?.y || 1;
    const charHeight = 2.68 * charScale;
    const distForCharRatio = charHeight / (2 * 0.4 * alpha);

    const requiredDistFromFront = Math.max(distForWidth, distForHeight, distForCharRatio);
    const baseZ = frontZ + requiredDistFromFront;
    const distToCenter = Math.max(4.5, baseZ - lookZ);

    // Desloca o lookY para posicionar o centro do bbox exatamente no centro da faixa segura entre 19% topo e 29% base
    const ndcMidOffset = bottomSafeMargin - topSafeMargin; // +0.10
    const lookY = centerY - ndcMidOffset * distToCenter * alpha;
    const camY = lookY + distToCenter * 0.065;

    return {
      lookX,
      lookY,
      lookZ,
      camY,
      baseZ,
      boxWidth,
      boxHeight,
    };
  }

  // ==========================================================================
  // (d) PRESETS DE CÂMERA DETERMINÍSTICOS (RESPEITANDO O SAFE-ZONE FRAMING)
  // ==========================================================================
  function applyCameraPreset(
    camera: any,
    preset: CameraPreset,
    t: number,
    duration: number,
    framing?: TemplateCameraFraming
  ) {
    const p = Math.min(1, Math.max(0, duration > 0 ? t / duration : 0));
    const ease = p * (2 - p); // easeOutQuad

    const f: TemplateCameraFraming = framing || {
      lookX: 0,
      lookY: 1.35,
      lookZ: 0,
      camY: 1.95,
      baseZ: 10.2,
      boxWidth: 2.6,
      boxHeight: 2.8,
    };

    switch (preset) {
      case 'static':
        camera.position.set(f.lookX, f.camY, f.baseZ * 1.02);
        camera.lookAt(f.lookX, f.lookY, f.lookZ);
        break;

      case 'dolly-in':
        camera.position.set(
          f.lookX,
          f.camY - ease * 0.06,
          f.baseZ * (1.07 - ease * 0.08)
        );
        camera.lookAt(f.lookX, f.lookY, f.lookZ);
        break;

      case 'orbit': {
        const angle = (p - 0.5) * 0.22;
        const radius = (f.baseZ - f.lookZ) * 1.04;
        camera.position.set(
          f.lookX + Math.sin(angle) * radius,
          f.camY + Math.sin(p * Math.PI) * 0.06,
          f.lookZ + Math.cos(angle) * radius
        );
        camera.lookAt(f.lookX, f.lookY, f.lookZ);
        break;
      }

      case 'pan': {
        const offset = (ease - 0.5) * 0.34;
        camera.position.set(f.lookX + offset, f.camY, f.baseZ * 1.05);
        camera.lookAt(f.lookX + offset * 0.35, f.lookY, f.lookZ);
        break;
      }

      case 'shake':
        camera.position.set(
          f.lookX + Math.sin(t * 24) * 0.045,
          f.camY + Math.cos(t * 28) * 0.035,
          f.baseZ * 1.02
        );
        camera.lookAt(f.lookX, f.lookY, f.lookZ);
        break;

      case 'close-face':
        camera.position.set(
          f.lookX,
          f.camY - ease * 0.05,
          f.baseZ * (1.01 - ease * 0.07)
        );
        camera.lookAt(f.lookX, f.lookY + 0.04, f.lookZ);
        break;
    }
  }

  // ==========================================================================
  // MONTAGEM DE CENA COMPLETA EM UM CANVAS WEBGL
  // ==========================================================================
  function mountScene3DCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    scenes: Array<Scene3DRenderConfig & { id: string; startTime: number }>
  ) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const fovDeg = 38;
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(fovDeg, aspect, 0.1, 120);

    // Pré-constrói cada cena e calcula o enquadramento seguro por template
    const builtScenes = scenes.map((sc) => {
      const threeScene = new THREE.Scene();
      const dkPreset = sc.designKit?.scene3dPreset;

      // Iluminação suave de estúdio com luz de preenchimento parametrizável pelo DesignKit
      const hemiLight = new THREE.HemisphereLight(
        dkPreset?.keyLightColor || '#fff7ed',
        '#312e81',
        0.95
      );
      threeScene.add(hemiLight);

      const ambient = new THREE.AmbientLight(dkPreset?.ambientLightColor || '#fff5eb', 0.72);
      threeScene.add(ambient);

      const dirLight = new THREE.DirectionalLight(dkPreset?.keyLightColor || '#fffbeb', 1.72);
      dirLight.position.set(4.5, 8.5, 6.2);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.radius = 4;
      dirLight.shadow.bias = -0.0004;
      threeScene.add(dirLight);

      // Luz de preenchimento quente (warm fill light)
      const warmFillLight = new THREE.DirectionalLight(dkPreset?.fillLightColor || '#fdba74', 0.85);
      warmFillLight.position.set(-4.8, 3.8, 4.8);
      threeScene.add(warmFillLight);

      // Luz de recorte suave (rim light)
      const rimLight = new THREE.DirectionalLight('#fde68a', 0.42);
      rimLight.position.set(0, 5.0, -5.0);
      threeScene.add(rimLight);

      const stage = buildStageTemplate(threeScene, sc);

      // Se um DesignKit customizado (ex: editorial-minimal) estiver ativo, aplica seus tokens de parede/piso 3D
      if (sc.designKit && sc.designKit.id !== 'simulacao-2030' && dkPreset) {
        if (dkPreset.wallColor) {
          threeScene.background = new THREE.Color(dkPreset.wallColor);
        }
        threeScene.traverse((node: any) => {
          if (node && node.isMesh && node.userData?.ignoreFraming && node.material && dkPreset.floorColor) {
            if (node.rotation && Math.abs(node.rotation.x + Math.PI / 2) < 0.1) {
              node.material.color = new THREE.Color(dkPreset.floorColor);
            } else if (dkPreset.wallColor && node.position && node.position.z < -2.2) {
              node.material.color = new THREE.Color(dkPreset.wallColor);
            }
          }
        });
      }

      // Cataloga e rotula deterministicamente todos os objetos 3D selecionáveis da cena para Raycast + Gizmo
      const selectableMap = new Map<string, any>();
      const selectableList: Array<{ id: string; label: string; object: any }> = [];

      if (stage.mainChar) {
        stage.mainChar.userData = stage.mainChar.userData || {};
        stage.mainChar.userData.objectId = 'character-main';
        stage.mainChar.userData.objectLabel = sc.character?.name || 'Personagem Principal';
        stage.mainChar.userData.selectable3D = true;
        stage.mainChar.userData.baseTransform = {
          position: [stage.mainChar.position.x, stage.mainChar.position.y, stage.mainChar.position.z],
          rotation: [stage.mainChar.rotation.x, stage.mainChar.rotation.y, stage.mainChar.rotation.z],
          scale: [stage.mainChar.scale.x, stage.mainChar.scale.y, stage.mainChar.scale.z],
        };
        selectableMap.set('character-main', stage.mainChar);
        selectableList.push({
          id: 'character-main',
          label: stage.mainChar.userData.objectLabel,
          object: stage.mainChar,
        });
      }

      let propIdx = 0;
      for (const child of threeScene.children) {
        if (!child || child.isLight || child === stage.mainChar) continue;
        if (child.userData && child.userData.ignoreFraming) continue;
        const objId = child.userData?.objectId || `prop-${propIdx}`;
        const objLabel =
          child.userData?.objectLabel ||
          child.name ||
          `Objeto 3D #${propIdx + 1} (${sc.template})`;
        child.userData = child.userData || {};
        child.userData.objectId = objId;
        child.userData.objectLabel = objLabel;
        child.userData.selectable3D = true;
        child.userData.baseTransform = {
          position: [child.position.x, child.position.y, child.position.z],
          rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
          scale: [child.scale.x, child.scale.y, child.scale.z],
        };
        selectableMap.set(objId, child);
        selectableList.push({ id: objId, label: objLabel, object: child });
        propIdx++;
      }

      const framing = computeTemplateFraming(
        threeScene,
        stage,
        sc.duration || 4.0,
        fovDeg,
        aspect
      );

      return {
        ...sc,
        threeScene,
        stage,
        framing,
        selectableMap,
        selectableList,
      };
    });

    function applySceneOverrides(active: (typeof builtScenes)[number]) {
      const overrides = active.objectOverrides || {};
      for (const [objectId, ov] of Object.entries(overrides)) {
        const targetObj = active.selectableMap.get(objectId);
        if (!targetObj || !ov) continue;
        if (ov.hidden !== undefined) {
          targetObj.visible = !ov.hidden;
        }
        if (Array.isArray(ov.position) && ov.position.length === 3) {
          targetObj.position.set(ov.position[0], ov.position[1], ov.position[2]);
        }
        if (Array.isArray(ov.rotation) && ov.rotation.length === 3) {
          targetObj.rotation.set(ov.rotation[0], ov.rotation[1], ov.rotation[2]);
        }
        if (Array.isArray(ov.scale) && ov.scale.length === 3) {
          targetObj.scale.set(ov.scale[0], ov.scale[1], ov.scale[2]);
        }
      }
    }

    function getActiveBuiltScene(globalTime: number) {
      if (builtScenes.length === 0) return null;
      let active = builtScenes[0];
      for (const sc of builtScenes) {
        if (globalTime >= sc.startTime - 0.001) {
          active = sc;
        }
      }
      return active;
    }

    function renderAtTime(globalTime: number) {
      const active = getActiveBuiltScene(globalTime);
      if (!active) return;
      const localTime = Math.max(0, Math.min(active.duration, globalTime - active.startTime));
      const progress = active.duration > 0 ? localTime / active.duration : 0;

      active.stage.update(localTime, progress);
      applySceneOverrides(active);

      if (
        active.cameraOverride &&
        Array.isArray(active.cameraOverride.position) &&
        Array.isArray(active.cameraOverride.target)
      ) {
        const [cx, cy, cz] = active.cameraOverride.position;
        const [tx, ty, tz] = active.cameraOverride.target;
        if (active.cameraOverride.fov && active.cameraOverride.fov !== camera.fov) {
          camera.fov = active.cameraOverride.fov;
          camera.updateProjectionMatrix();
        }
        camera.position.set(cx, cy, cz);
        camera.lookAt(tx, ty, tz);
      } else {
        applyCameraPreset(camera, active.camera, localTime, active.duration, active.framing);
      }

      renderer.render(active.threeScene, camera);
    }

    renderAtTime(0);

    return {
      renderer,
      camera,
      builtScenes,
      getActiveBuiltScene,
      renderAtTime,
      dispose() {
        renderer.dispose();
      },
    };
  }

  return {
    createBlockyCharacter,
    applyCharacterPose,
    buildStageTemplate,
    computeTemplateFraming,
    applyCameraPreset,
    mountScene3DCanvas,
  };
}
