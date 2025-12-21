import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector2,
} from 'three';

export function createHazardTexture(stripeColor = '#f5d500', gapColor = '#0a0a0a'): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to create 2D context for hazard texture');
  }

  ctx.fillStyle = gapColor;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = stripeColor;
  const stripeWidth = size * 0.2;
  const spacing = stripeWidth * 1.5;
  const angle = (-20 * Math.PI) / 180;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);

  for (let x = -size; x < size; x += spacing) {
    ctx.fillRect(x, -size, stripeWidth, size * 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat = new Vector2(1.1, 1.1);
  texture.anisotropy = 8;
  return texture;
}

export class SlidingDoor {
  public group: Group;
  private leftPanel: Group;
  private rightPanel: Group;
  private idleOffset: number;
  private closedOffset: number;
  private slideDistance: number;
  private openAmount = 0;

  constructor(width: number, height: number, depth: number, hazardTexture: CanvasTexture) {
    this.group = new Group();
    this.idleOffset = Math.random() * Math.PI * 2;

    const frameMaterial = new MeshStandardMaterial({
      color: 0x0a0f18,
      metalness: 0.85,
      roughness: 0.35,
      emissive: new Color(0x05060a),
    });

    const accentMaterial = new MeshStandardMaterial({
      color: 0x86b7ff,
      emissive: new Color(0x2d7fff),
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.25,
    });

    const hazardMaterial = new MeshStandardMaterial({
      map: hazardTexture,
      color: 0xffffff,
      emissive: new Color(0x1c1400),
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.15,
    });

    const frameThickness = 0.35;
    const frameDepth = depth * 0.6;
    const frame = new Group();

    const topFrame = new Mesh(new BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth), frameMaterial);
    topFrame.position.set(0, height + frameThickness * 0.5, 0);

    const bottomFrame = new Mesh(new BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth), frameMaterial);
    bottomFrame.position.set(0, -frameThickness * 0.5, 0);

    const leftFrame = new Mesh(new BoxGeometry(frameThickness, height, frameDepth), frameMaterial);
    leftFrame.position.set(-width * 0.5 - frameThickness * 0.5, height * 0.5, 0);

    const rightFrame = new Mesh(new BoxGeometry(frameThickness, height, frameDepth), frameMaterial);
    rightFrame.position.set(width * 0.5 + frameThickness * 0.5, height * 0.5, 0);

    frame.add(topFrame, bottomFrame, leftFrame, rightFrame);
    this.group.add(frame);

    const gap = 0.18;
    const panelWidth = width * 0.5 - gap;
    const panelDepth = depth * 0.35;

    const panelMaterial = new MeshStandardMaterial({
      color: 0x050607,
      metalness: 0.65,
      roughness: 0.3,
    });

    this.leftPanel = new Group();
    this.rightPanel = new Group();

    const createPanel = () => {
      const panelGroup = new Group();
      const body = new Mesh(new BoxGeometry(panelWidth, height, panelDepth), panelMaterial);
      body.position.set(0, height * 0.5, 0);
      panelGroup.add(body);

      const face = new Mesh(new BoxGeometry(panelWidth * 0.92, height * 0.9, panelDepth * 0.52), hazardMaterial);
      face.position.set(0, height * 0.5, panelDepth * 0.51);
      panelGroup.add(face);

      const hex = new Mesh(new CylinderGeometry(height * 0.16, height * 0.16, panelDepth * 0.45, 6), accentMaterial);
      hex.rotation.z = Math.PI / 2;
      hex.position.set(0, height * 0.5, panelDepth * 0.65);
      panelGroup.add(hex);

      const braces = [
        new Mesh(new BoxGeometry(panelWidth * 0.9, frameThickness * 0.6, frameThickness * 0.9), accentMaterial),
        new Mesh(new BoxGeometry(frameThickness * 0.6, panelWidth * 0.3, frameThickness * 0.9), accentMaterial),
      ];
      braces[0].position.set(0, height * 0.18, panelDepth * 0.65);
      braces[1].position.set(0, height * 0.82, panelDepth * 0.65);
      panelGroup.add(...braces);

      return panelGroup;
    };

    const leftPanel = createPanel();
    const rightPanel = createPanel();

    this.closedOffset = panelWidth * 0.5 + gap * 0.5;
    this.slideDistance = panelWidth + gap * 1.2;

    leftPanel.position.x = -this.closedOffset;
    rightPanel.position.x = this.closedOffset;

    this.leftPanel.add(leftPanel);
    this.rightPanel.add(rightPanel);

    this.setOpenAmount(0);

    this.group.add(this.leftPanel, this.rightPanel);
  }

  public setOpenAmount(amount: number) {
    this.openAmount = Math.min(Math.max(amount, 0), 1);
    const slide = this.slideDistance * this.openAmount;
    this.leftPanel.position.x = -this.closedOffset - slide;
    this.rightPanel.position.x = this.closedOffset + slide;
  }

  public update(elapsed: number) {
    const wobble = Math.sin(elapsed * 0.8 + this.idleOffset) * 0.15;
    this.leftPanel.position.y = wobble * 0.15;
    this.rightPanel.position.y = -wobble * 0.12;
  }
}
