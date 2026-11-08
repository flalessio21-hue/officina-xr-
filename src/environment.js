import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { walnutTextures, cuttingMatTexture, concreteRoughness, glowTexture } from './textures.js';

export const DESK = { w: 1.6, d: 0.8, h: 0.75, t: 0.04, matT: 0.003 };

function rod(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 16), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

function buildLamp(mats, blockers) {
  const lamp = new THREE.Group();
  lamp.name = 'lampada';
  const Y = DESK.h;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.02, 48), mats.lampBody);
  base.position.set(0.62, Y + 0.01, -0.26);
  base.castShadow = base.receiveShadow = true;
  const p0 = new THREE.Vector3(0.62, Y + 0.03, -0.26);
  const p1 = new THREE.Vector3(0.53, Y + 0.44, -0.34);
  const p2 = new THREE.Vector3(0.24, Y + 0.45, -0.1);
  const joints = [p0, p1, p2].map((p) => {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 14), mats.chrome);
    j.position.copy(p);
    return j;
  });
  const arm1 = rod(p0, p1, 0.0065, mats.lampBody);
  const arm2 = rod(p1, p2, 0.0065, mats.lampBody);
  // molla decorativa sul primo braccio
  const spring = rod(p0.clone().lerp(p1, 0.15).add(new THREE.Vector3(0.015, 0, 0)), p0.clone().lerp(p1, 0.75).add(new THREE.Vector3(0.015, 0, 0)), 0.003, mats.chrome);

  const head = new THREE.Group();
  head.position.copy(p2);
  const target = new THREE.Vector3(0.0, Y, 0.02);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(p2).normalize());
  const shadePts = [[0.014, 0.02], [0.02, 0.0], [0.03, -0.03], [0.05, -0.07], [0.078, -0.13], [0.08, -0.133]].map(([r, y]) => new THREE.Vector2(r, y));
  const shade = new THREE.Mesh(new THREE.LatheGeometry(shadePts, 64), mats.shade);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.9, 2.4) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), bulbMat);
  bulb.position.y = -0.065;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false,
  }));
  glow.scale.setScalar(0.22);
  glow.position.y = -0.08;
  head.add(shade, bulb, glow);

  const spot = new THREE.SpotLight(0xffe1b5, 2.6, 5, Math.PI / 3.1, 0.75, 2);
  spot.position.copy(p2).add(target.clone().sub(p2).normalize().multiplyScalar(0.135));
  spot.target.position.copy(target);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.00025;
  spot.shadow.normalBias = 0.01;
  spot.shadow.camera.near = 0.03;
  spot.shadow.camera.far = 3;
  spot.shadow.radius = 4;

  // fascio di luce visibile (polvere nell'aria), morbido ai bordi
  const beamLen = p2.distanceTo(target) - 0.12;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uOn: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 2.0); float along = pow(vUv.y, 1.5); gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * edge * along * 0.11 * uOn, 1.0); }',
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, beamLen, 48, 1, true), beamMat);
  const dir = target.clone().sub(p2).normalize();
  beam.position.copy(p2).addScaledVector(dir, 0.12 + beamLen / 2);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());

  lamp.add(base, ...joints, arm1, arm2, spring, head, spot, spot.target, beam);
  blockers.push(base, arm1, arm2, shade);

  let on = true;
  lamp.userData.toggle = () => {
    on = !on;
    spot.visible = on;
    glow.visible = on;
    beam.visible = on;
    bulbMat.color.setRGB(on ? 3.2 : 0.25, on ? 2.9 : 0.24, on ? 2.4 : 0.22);
    return on;
  };
  lamp.userData.isOn = () => on;
  return lamp;
}

export function createEnvironment(scene, renderer) {
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.055);

  // riflessi morbidi (lo sfondo resta nero)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.18;

  const blockers = [];

  // pavimento: cemento scuro lucido, illuminato solo dalla lampada e dall'AI
  const floorRough = concreteRoughness();
  floorRough.repeat.set(60, 60);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.9, roughnessMap: floorRough, metalness: 0, envMapIntensity: 0.25 })
  );
  floor.name = 'floor';
  floor.receiveShadow = true;
  scene.add(floor);

  const deskRig = new THREE.Group();
  deskRig.position.set(0, 0, -0.62);
  scene.add(deskRig);

  const wood = walnutTextures();
  const mats = {
    wood: new THREE.MeshPhysicalMaterial({
      map: wood.map, roughnessMap: wood.roughnessMap, bumpMap: wood.bumpMap, bumpScale: 0.6,
      roughness: 0.6, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25,
    }),
    steel: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.42, metalness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 }),
    lampBody: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.35, metalness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.12, metalness: 1 }),
    shade: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
  };

  // piano in noce massello con spigoli arrotondati
  const top = new THREE.Mesh(new RoundedBoxGeometry(DESK.w, DESK.t, DESK.d, 4, 0.01), mats.wood);
  top.position.y = DESK.h - DESK.t / 2;
  top.castShadow = top.receiveShadow = true;
  deskRig.add(top);
  blockers.push(top);

  // tappetino da taglio
  const matTex = cuttingMatTexture(90, 45);
  const mat = new THREE.Mesh(
    new RoundedBoxGeometry(0.9, DESK.matT, 0.45, 2, 0.0012),
    new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.82, metalness: 0 })
  );
  mat.position.set(-0.05, DESK.h + DESK.matT / 2, 0.06);
  mat.receiveShadow = true;
  deskRig.add(mat);
  blockers.push(mat);

  // telaio in acciaio verniciato a polvere: due gambe a "T" rovesciata + traverso
  const legs = new THREE.Group();
  const legH = DESK.h - DESK.t;
  for (const sx of [-1, 1]) {
    const x = sx * (DESK.w / 2 - 0.09);
    const column = new THREE.Mesh(new RoundedBoxGeometry(0.07, legH - 0.04, 0.045, 3, 0.006), mats.steel);
    column.position.set(x, (legH - 0.04) / 2 + 0.03, 0);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.03, DESK.d - 0.06, 3, 0.006), mats.steel);
    foot.position.set(x, 0.022, 0);
    const bracket = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.025, DESK.d - 0.12, 3, 0.005), mats.steel);
    bracket.position.set(x, legH - 0.0125, 0);
    legs.add(column, foot, bracket);
    for (const sz of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.008, 20), mats.rubber);
      pad.position.set(x, 0.004, sz * (DESK.d / 2 - 0.06));
      legs.add(pad);
    }
  }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(DESK.w - 0.24, 0.06, 0.025, 3, 0.006), mats.steel);
  beam.position.set(0, legH - 0.12, -0.12);
  legs.add(beam);
  legs.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; blockers.push(o); } });
  deskRig.add(legs);

  const lamp = buildLamp(mats, blockers);
  deskRig.add(lamp);

  // luce ambiente molto debole + una morbida luce dall'alto, senza ombre
  const hemi = new THREE.HemisphereLight(0x9fb4d0, 0x000000, 0.08);
  scene.add(hemi);
  const fill = new THREE.SpotLight(0xdfe8ff, 1.4, 6, Math.PI / 4, 1, 2);
  fill.position.set(-0.3, 2.6, 0.5);
  fill.target.position.set(0, DESK.h, 0);
  deskRig.add(fill, fill.target);

  // cestino accanto alla scrivania: ci lasci cadere un oggetto e sparisce
  const bin = new THREE.Group();
  bin.name = 'cestino';
  bin.position.set(1.05, 0, -0.42);
  const binMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
  const binWall = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 48, 1, true), binMat);
  binWall.position.y = 0.21;
  const binBottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 48).rotateX(-Math.PI / 2), binMat);
  binBottom.position.y = 0.005;
  const binRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4a3d }));
  binRim.position.y = 0.42;
  binWall.castShadow = binWall.receiveShadow = true;
  bin.add(binWall, binBottom, binRim);
  scene.add(bin);
  const binInfo = { center: bin.position.clone(), radius: 0.17, height: 0.44 };

  const workspaceRoot = new THREE.Group();
  workspaceRoot.name = 'workspace';
  workspaceRoot.position.y = DESK.h + DESK.matT;
  deskRig.add(workspaceRoot);

  // l'altezza regolabile allunga le gambe invece di farle galleggiare
  function setDeskHeight(dy) {
    deskRig.position.y = dy;
    legs.position.y = -dy;
    legs.scale.y = (legH + dy) / legH;
  }

  return {
    deskRig, workspaceRoot, floor, hemi, blockers, setDeskHeight, bin: binInfo, deskTop: top, mat,
    toggleLamp: () => lamp.userData.toggle(),
    lampOn: () => lamp.userData.isOn(),
  };
}
