import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise2 } from './textures.js';

/**
 * Scenografie degli ambienti: oggetti 3D attorno alla scrivania, animati dove serve.
 * Vicino alla scrivania (raggio ~7 m) il terreno resta piano: ci si teletrasporta lì.
 */
const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const R = (a, b) => a + (b - a) * rnd();

function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

/** Roccia: icosaedro deformato. */
function rockGeometry(seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm2(v.x * 1.7 + seed, v.y * 1.7 + v.z * 1.3 + seed * 2, 3);
    v.multiplyScalar(0.7 + n * 0.6);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Terreno: piano vicino alla scrivania, rilievi più lontano. */
function terrain(heightFn, material, size = 400, seg = 220) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z + 0.6);
    p.setY(i, heightFn(x, z) * THREE.MathUtils.smoothstep(r, 7, 22) - 0.02);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

/** Shader leggero per aggiungere animazioni ai materiali standard. */
function animate(material, hook) {
  material.userData.time = { value: 0 };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = material.userData.time;
    hook(sh);
  };
  return material;
}

// ---------------------------------------------------------------- spazio
function buildSpace() {
  const g = new THREE.Group();
  const tick = [];
  // piattaforma di vetro sotto la scrivania
  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 0.04, 6),
    new THREE.MeshPhysicalMaterial({ color: 0x0b1a2a, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55, clearcoat: 1 }),
  );
  plat.position.set(0, -0.02, -0.6);
  plat.receiveShadow = true;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fa9ff, toneMapped: false }));
  edge.rotation.x = Math.PI / 2;
  edge.position.copy(plat.position);
  g.add(plat, edge);

  // pianeta con bande, atmosfera e anelli
  const sun = new THREE.Vector3(-0.75, 0.22, -0.62).normalize();
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
    fragmentShader: `uniform vec3 uSun; uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main(){
        vec3 p = normalize(vP);
        float lat = p.y * 9.0 + n1(atan(p.z, p.x) * 6.0 + p.y * 30.0) * 0.6 + sin(atan(p.z, p.x) * 3.0 + uTime * 0.02) * 0.15;
        vec3 c = mix(vec3(0.75, 0.52, 0.32), vec3(0.95, 0.85, 0.65), 0.5 + 0.5 * sin(lat * 3.0));
        c = mix(c, vec3(0.55, 0.3, 0.2), smoothstep(0.6, 1.0, n1(lat * 2.0 + 5.0)) * 0.6);
        float diff = max(dot(vN, uSun), 0.0);
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(vN, V), 0.0), 3.0);
        vec3 col = c * (0.04 + 1.1 * diff) + rim * vec3(0.5, 0.65, 1.0) * (0.25 + diff);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(14, 96, 64), planetMat);
  planet.position.set(55, 22, -110);
  planet.rotation.z = 0.35;
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 4;
    const x = c.getContext('2d');
    for (let i = 0; i < 512; i++) {
      const a = Math.max(0, Math.sin(i * 0.07) * 0.4 + Math.sin(i * 0.31) * 0.25 + 0.45) * (i > 20 && i < 500 ? 1 : 0) * (i > 300 && i < 330 ? 0.1 : 1);
      x.fillStyle = `rgba(${210 + (i % 40)}, ${185 + (i % 25)}, ${150}, ${a})`;
      x.fillRect(i, 0, 1, 4);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ringGeo = new THREE.RingGeometry(18, 30, 128, 1);
  const uv = ringGeo.attributes.uv, pos = ringGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - 18) / 12, 0.5);
  }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = Math.PI / 2.3;
  planet.add(ring);
  tick.push((dt, t) => { planet.rotation.y += dt * 0.01; planetMat.uniforms.uTime.value = t; });

  // luna
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 1 }));
  moon.geometry = rockGeometry(4, 4); moon.scale.setScalar(3);
  moon.position.set(-38, 12, -70);
  g.add(planet, moon);

  // fascia di asteroidi che ruota lentamente
  const astGeo = rockGeometry(9, 1);
  const ast = new THREE.InstancedMesh(astGeo, new THREE.MeshStandardMaterial({ color: 0x9a8f84, roughness: 0.9, flatShading: true }), 260);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < ast.count; i++) {
    const a = rnd() * Math.PI * 2, r = R(55, 95);
    v.set(Math.cos(a) * r, R(-4, 14), Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler(R(0, 6), R(0, 6), R(0, 6)));
    s.setScalar(R(0.1, 0.9) * (rnd() < 0.06 ? 2.5 : 1));
    ast.setMatrixAt(i, m4.compose(v, q, s));
  }
  const belt = new THREE.Group();
  belt.add(ast);
  belt.rotation.x = 0.12;
  g.add(belt);
  tick.push((dt) => { belt.rotation.y += dt * 0.006; });
  return { group: g, tick, flatFloor: false };
}

// ---------------------------------------------------------------- sott'acqua
function buildUnderwater(sandTex) {
  const g = new THREE.Group();
  const tick = [];
  const sandMat = animate(new THREE.MeshStandardMaterial({ map: sandTex, color: 0xc8b48c, roughness: 1 }), (sh) => {
    sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vWp;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 cp = vWp.xz * 1.6;
      float c1 = sin(cp.x * 2.1 + sin(cp.y * 1.7 + uTime * 0.9) * 1.4 + uTime * 0.5);
      float c2 = sin(cp.y * 2.3 + sin(cp.x * 1.9 - uTime * 0.8) * 1.5 - uTime * 0.4);
      float caus = pow(abs(c1 * c2), 3.0) + 0.5 * pow(abs(sin(cp.x * 5.0 + c2 * 2.0) * sin(cp.y * 5.0 + c1 * 2.0)), 6.0);
      totalEmissiveRadiance += vec3(0.2, 0.45, 0.5) * caus * 0.22 * exp(-length(vWp.xz) * 0.05);`);
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  });
  sandTex.repeat.set(60, 60);
  const ground = terrain((x, z) => fbm2(x * 0.03, z * 0.03) * 6 - 2 + Math.sin(x * 0.05) * 1.5, sandMat);
  g.add(ground);
  tick.push((dt, t) => { sandMat.userData.time.value = t; });

  // rocce e coralli
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a5458, roughness: 0.95, flatShading: true });
  const corals = [0xff6f61, 0xffb347, 0xc06cff, 0xff4f9a, 0x4fd1c5];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = R(6, 30);
    const rock = new THREE.Mesh(rockGeometry(i * 3.1), rockMat);
    const sc = R(0.5, 2.6);
    rock.scale.set(sc * R(0.8, 1.6), sc * R(0.5, 1), sc * R(0.8, 1.4));
    rock.position.set(Math.cos(a) * r, sc * 0.2, Math.sin(a) * r - 0.6);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
    // corallo sopra la roccia
    const col = corals[i % corals.length];
    const cm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.15 });
    for (let k = 0; k < 4; k++) {
      const branch = new THREE.Mesh(k % 2 ? new THREE.ConeGeometry(0.08, R(0.3, 0.8), 6) : new THREE.SphereGeometry(R(0.1, 0.25), 10, 8), cm);
      branch.position.set(rock.position.x + R(-0.5, 0.5) * sc, rock.position.y + sc * 0.55, rock.position.z + R(-0.5, 0.5) * sc);
      branch.rotation.set(R(-0.4, 0.4), 0, R(-0.4, 0.4));
      g.add(branch);
    }
  }

  // alghe che ondeggiano (un solo oggetto con tante copie)
  const weedGeo = new THREE.PlaneGeometry(0.16, 1.8, 1, 10).translate(0, 0.9, 0);
  const weedMat = animate(new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.8, side: THREE.DoubleSide }), (sh) => {
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
      #else
        float ph = 0.0;
      #endif
      float k = pow(uv.y, 1.6);
      transformed.x += sin(uTime * 1.2 + ph + uv.y * 3.0) * 0.28 * k;
      transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.18 * k;`);
  });
  const weeds = new THREE.InstancedMesh(weedGeo, weedMat, 260);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < weeds.count; i++) {
    const a = rnd() * Math.PI * 2, r = R(3.5, 28);
    v.set(Math.cos(a) * r, 0, Math.sin(a) * r - 0.6);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    s.set(1, R(0.5, 1.8), 1);
    weeds.setMatrixAt(i, m4.compose(v, q, s));
  }
  g.add(weeds);
  tick.push((dt, t) => { weedMat.userData.time.value = t; });

  // banchi di pesci
  const body = new THREE.SphereGeometry(0.1, 12, 8).scale(1.8, 0.75, 0.45);
  const tail = new THREE.ConeGeometry(0.07, 0.12, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-0.22, 0, 0);
  const fishGeo = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
  const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), 90);
  const fishData = [];
  const palette = [0xffa500, 0x4fc3ff, 0xffe066, 0xff6f91, 0xc0c8d0];
  for (let i = 0; i < fish.count; i++) {
    const school = i % 6;
    fishData.push({ r: 4 + school * 2.2 + R(-0.6, 0.6), y: 1.2 + (school % 3) * 1.1 + R(-0.4, 0.4), sp: (0.12 + school * 0.015) * (school % 2 ? 1 : -1), ph: school * 1.3 + R(-0.25, 0.25), size: R(0.7, 1.4) });
    fish.setColorAt(i, new THREE.Color(palette[school % palette.length]));
  }
  g.add(fish);
  tick.push((dt, t) => {
    for (let i = 0; i < fish.count; i++) {
      const f = fishData[i];
      const a = f.ph + t * f.sp;
      v.set(Math.cos(a) * f.r, f.y + Math.sin(t * 0.8 + i) * 0.15, Math.sin(a) * f.r - 0.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (f.sp > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.sin(t * 8 + i) * 0.15);
      s.setScalar(f.size);
      fish.setMatrixAt(i, m4.compose(v, q, s));
    }
    fish.instanceMatrix.needsUpdate = true;
  });

  // raggi di luce dall'alto
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float f = smoothstep(0.0, 0.6, vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0); float fl = 0.6 + 0.4 * sin(uTime * 0.7 + vUv.x * 6.0); gl_FragColor = vec4(vec3(0.35, 0.7, 0.75) * f * fl * 0.18, 1.0); }',
  });
  for (let i = 0; i < 10; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(R(1, 2.5), 14), rayMat);
    const a = rnd() * Math.PI * 2, r = R(2, 14);
    ray.position.set(Math.cos(a) * r, 7, Math.sin(a) * r - 0.6);
    ray.rotation.set(0.25, rnd() * Math.PI, 0.15);
    g.add(ray);
  }
  tick.push((dt, t) => { rayMat.uniforms.uTime.value = t; });
  return { group: g, tick, flatFloor: true };
}

// ---------------------------------------------------------------- deserto al tramonto
function buildDesert(sandTex) {
  const g = new THREE.Group();
  const tick = [];
  sandTex.repeat.set(80, 80);
  const sand = new THREE.MeshStandardMaterial({ map: sandTex, color: 0xf0c08a, roughness: 1 });
  const dunes = terrain((x, z) => {
    const ridge = Math.abs(Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2.2 + fbm2(x * 0.01, z * 0.01) * 3));
    const far = THREE.MathUtils.smoothstep(Math.hypot(x, z), 25, 90);
    return (ridge * 3.5 + fbm2(x * 0.02, z * 0.02) * 2.5) * (0.4 + 0.6 * far);
  }, sand);
  g.add(dunes);

  // mesas e rocce rosse in lontananza
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x9a4a2c, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = -1.8 + i * 0.45 + R(-0.15, 0.15), r = R(120, 170);
    const h = R(14, 34);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(R(8, 16), R(14, 24), h, 9, 3), mesaMat);
    mesa.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    g.add(mesa);
  }
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2, r = R(9, 40);
    const rock = new THREE.Mesh(rockGeometry(i * 1.7), mesaMat);
    rock.scale.setScalar(R(0.3, 1.4));
    rock.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    rock.castShadow = true;
    g.add(rock);
  }

  // cactus
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.8 });
  const trunk = new THREE.CapsuleGeometry(0.18, 1.8, 4, 10).translate(0, 1.1, 0);
  const armL = new THREE.CapsuleGeometry(0.11, 0.6, 4, 8).translate(-0.4, 1.3, 0);
  const armLb = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8).rotateZ(Math.PI / 2).translate(-0.25, 1.0, 0);
  const armR = new THREE.CapsuleGeometry(0.11, 0.5, 4, 8).translate(0.38, 1.6, 0);
  const armRb = new THREE.CapsuleGeometry(0.1, 0.35, 4, 8).rotateZ(Math.PI / 2).translate(0.22, 1.35, 0);
  const cactusGeo = mergeGeometries([trunk, armL, armLb, armR, armRb].map((x) => x.toNonIndexed()));
  const cacti = new THREE.InstancedMesh(cactusGeo, cactusMat, 24);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < cacti.count; i++) {
    const a = rnd() * Math.PI * 2, r = R(7, 45);
    v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    s.setScalar(R(0.7, 1.6));
    cacti.setMatrixAt(i, m4.compose(v, q, s));
  }
  cacti.castShadow = true;
  g.add(cacti);
  return { group: g, tick, flatFloor: false };
}

// ---------------------------------------------------------------- aurora boreale
function buildArctic(snowTex) {
  const g = new THREE.Group();
  const tick = [];
  snowTex.repeat.set(70, 70);
  const snow = new THREE.MeshStandardMaterial({ map: snowTex, color: 0xdfe8f5, roughness: 0.75 });
  g.add(terrain((x, z) => fbm2(x * 0.02, z * 0.02) * 10 + Math.max(0, Math.hypot(x, z) - 60) * 0.12, snow));

  // montagne innevate
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x8090a4, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + R(-0.1, 0.1), r = R(130, 180);
    const h = R(30, 70);
    const geo = new THREE.ConeGeometry(R(28, 50), h, 9, 6);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      const n = fbm2(p.getX(k) * 0.08 + i, p.getZ(k) * 0.08 + y * 0.05, 3);
      p.setX(k, p.getX(k) * (0.8 + n * 0.5));
      p.setZ(k, p.getZ(k) * (0.8 + n * 0.5));
    }
    geo.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + h / 2) / h;
      const white = t > 0.45 ? 1 : t > 0.35 ? 0.5 : 0.15;
      col.set([0.45 + 0.55 * white, 0.5 + 0.5 * white, 0.58 + 0.42 * white], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mt = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    mt.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    g.add(mt);
  }
  void mountMat;

  // abeti innevati
  const cone = (r, h, y) => new THREE.ConeGeometry(r, h, 9).translate(0, y, 0).toNonIndexed();
  const treeGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6).translate(0, 0.4, 0).toNonIndexed(),
    cone(1.1, 1.6, 1.3), cone(0.85, 1.4, 2.1), cone(0.55, 1.2, 2.8),
  ]);
  const tc = new Float32Array(treeGeo.attributes.position.count * 3);
  for (let k = 0; k < treeGeo.attributes.position.count; k++) {
    const y = treeGeo.attributes.position.getY(k);
    const trunk = y < 0.75;
    const tipSnow = !trunk && (k % 3 === 0);
    tc.set(trunk ? [0.25, 0.16, 0.1] : tipSnow ? [0.85, 0.9, 0.95] : [0.08, 0.22, 0.14], k * 3);
  }
  treeGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 140);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < trees.count; i++) {
    const a = rnd() * Math.PI * 2, r = R(9, 70);
    v.set(Math.cos(a) * r, -0.05, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
    s.setScalar(R(0.8, 2.2));
    trees.setMatrixAt(i, m4.compose(v, q, s));
  }
  trees.castShadow = true;
  g.add(trees);

  // aurora animata: tende di luce su un anello alto nel cielo
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){
        float x = vUv.x * 60.0;
        float wave = n(vec2(x * 0.15 + uTime * 0.03, uTime * 0.05)) * 0.35;
        float y = vUv.y - wave;
        float curtain = pow(n(vec2(x * 1.6 + uTime * 0.25, uTime * 0.1)), 2.0) * 0.7 + pow(n(vec2(x * 4.0 - uTime * 0.4, 3.0)), 3.0) * 0.6;
        float base = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.08, 0.75, y));
        float strand = smoothstep(0.35, 0.9, n(vec2(x * 0.5 + 9.0, uTime * 0.07)));
        vec3 col = mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 1.0), smoothstep(0.15, 0.7, y));
        float a = base * curtain * (0.35 + strand) * 1.4;
        gl_FragColor = vec4(col * a, 1.0);
      }`,
  });
  const aurora = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 46, 160, 1, true), auroraMat);
  aurora.position.set(0, 42, 0);
  g.add(aurora);
  tick.push((dt, t) => { auroraMat.uniforms.uTime.value = t; aurora.rotation.y += dt * 0.004; });
  return { group: g, tick, flatFloor: false };
}

/** Costruisce la scenografia di un ambiente (solo quando serve). [tex] carica una texture ripetibile. */
export function buildWorld(id, tex) {
  if (id === 'spazio') return buildSpace();
  if (id === 'acqua') return buildUnderwater(tex('floor_sand.jpg'));
  if (id === 'tramonto') return buildDesert(tex('floor_sand.jpg'));
  if (id === 'aurora') return buildArctic(tex('floor_snow.jpg'));
  return null;
}
