// The 3D view of your car on the road (three.js), in the style of modern EV dashboards:
// a multi-lane road that fades into the distance, lane lines that move with your real
// speed, and the cars, people and traffic lights the camera sees, placed where they are.
// All models are original low-poly shapes.
import * as THREE from '../vendor/three/three.module.min.js';

const PALETTE = {
  light: { bg: 0xf4f5f7, road: 0xdcdee3, line: 0xffffff, edge: 0xffffff, other: 0xa9adb6, person: 0x9da2ab },
  dark: { bg: 0x0e1014, road: 0x1f2228, line: 0x7c818c, edge: 0x9aa0ab, other: 0x5b606b, person: 0x6f7480 },
};
const LANE = 3.6;
const LIGHT_COLORS = { red: 0xff3b30, yellow: 0xffc400, green: 0x2ee66b };

function buildCar(paint) {
  const car = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.15, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xc0101e, emissiveIntensity: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.5), paint);
  body.position.y = 0.6;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 1.3), paint);
  hood.position.set(0, 0.93, -1.5);
  // Cabin narrows toward the roof so it reads as a car, not a box.
  const cabinGeo = new THREE.BoxGeometry(1.62, 0.5, 2.3);
  const p = cabinGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.84);
      p.setZ(i, p.getZ(i) * 0.68 + 0.12);
    }
  }
  cabinGeo.computeVertexNormals();
  const cabin = new THREE.Mesh(cabinGeo, glass);
  cabin.position.set(0, 1.12, 0.15);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, 0.15), dark);
  bumper.position.set(0, 0.42, 2.25);
  car.add(body, hood, cabin, bumper);
  // One light bar across the back.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.05), red);
  tail.position.set(0, 0.8, 2.26);
  car.add(tail);
  car.userData.wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.45, 1.45]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(x, 0.36, z);
      car.add(w);
      car.userData.wheels.push(w);
    }
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.3, 2.7, 1);
  shadow.position.y = 0.01;
  car.add(shadow);
  return car;
}

// A simple, featureless car shape for traffic around you.
function buildOther(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 4.4), mat);
  body.position.y = 0.62;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.2), mat);
  top.position.set(0, 1.15, 0.2);
  g.add(body, top);
  return g;
}

function buildPerson(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.85, 4, 10), mat);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat);
  head.position.y = 1.55;
  g.add(body, head);
  return g;
}

function buildLight() {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.6 }));
  g.add(housing);
  g.userData.lamps = ['red', 'yellow', 'green'].map((name, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x3a3d44, emissive: 0x000000 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), m);
    lamp.position.set(0, 0.34 - i * 0.34, 0.16);
    lamp.userData.name = name;
    g.add(lamp);
    return lamp;
  });
  g.position.y = 5.2;
  return g;
}

export function createCar3d(canvas, { theme = 'light', color = '#eef0f3' } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null; // no WebGL: the dashboard simply shows no 3D view
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 12, 78);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  camera.position.set(0, 5.4, 16);
  camera.lookAt(0, 2.2, -14);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ roughness: 1 }),
    line: new THREE.MeshBasicMaterial(),
    edge: new THREE.MeshBasicMaterial(),
    paint: new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }),
    other: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    person: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
  };
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 5, 400), mats.road);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -180;
  scene.add(road);
  for (const x of [-2.5 * LANE, 2.5 * LANE]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 400), mats.edge);
    edge.position.set(x, 0.01, -180);
    scene.add(edge);
  }

  const DASH = 8;
  const dashX = [-1.5 * LANE, -0.5 * LANE, 0.5 * LANE, 1.5 * LANE];
  const perLine = 30;
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 3), mats.line, dashX.length * perLine);
  scene.add(dashes);
  const m4 = new THREE.Matrix4();
  let offset = 0;
  const placeDashes = () => {
    let i = 0;
    for (const x of dashX) {
      for (let k = 0; k < perLine; k++) {
        m4.makeTranslation(x, 0.012, 14 - k * DASH + offset);
        dashes.setMatrixAt(i++, m4);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;
  };

  const car = buildCar(mats.paint);
  scene.add(car);

  // Pools of things around you, reused frame to frame.
  const pools = {
    car: Array.from({ length: 8 }, () => buildOther(mats.other)),
    person: Array.from({ length: 6 }, () => buildPerson(mats.person)),
    light: Array.from({ length: 3 }, buildLight),
  };
  for (const list of Object.values(pools)) {
    for (const o of list) {
      o.visible = false;
      o.userData.target = null;
      scene.add(o);
    }
  }

  const applyTheme = (t) => {
    const p = PALETTE[t] || PALETTE.light;
    scene.fog.color.setHex(p.bg);
    mats.road.color.setHex(p.road);
    mats.line.color.setHex(p.line);
    mats.edge.color.setHex(p.edge);
    mats.other.color.setHex(p.other);
    mats.person.color.setHex(p.person);
  };
  applyTheme(theme);

  // objects: [{kind, x, z, color}] from core/scene.js (z = metres ahead).
  const setObjects = (objects) => {
    for (const [kind, list] of Object.entries(pools)) {
      const mine = (objects || []).filter((o) => o.kind === kind);
      list.forEach((o, i) => {
        const t = mine[i];
        o.userData.target = t ? { x: t.x, z: -t.z, color: t.color } : null;
        if (t && !o.visible) {
          o.position.x = t.x;
          o.position.z = -t.z;
          o.visible = true;
        }
        if (kind === 'light' && t) {
          for (const lamp of o.userData.lamps) {
            const on = lamp.userData.name === t.color;
            lamp.material.emissive.setHex(on ? LIGHT_COLORS[t.color] : 0x000000);
            lamp.material.color.setHex(on ? LIGHT_COLORS[t.color] : 0x3a3d44);
          }
        }
      });
    }
  };

  let speed = 0;
  let running = false;
  let last = 0;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 52 : 40;
    camera.updateProjectionMatrix();
  };
  const frame = (now) => {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 30 || document.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    offset = (offset + speed * dt) % DASH;
    placeDashes();
    for (const w of car.userData.wheels) w.rotation.x -= (speed * dt) / 0.36;
    const ease = Math.min(1, dt * 4);
    for (const list of Object.values(pools)) {
      for (const o of list) {
        const t = o.userData.target;
        if (!t) {
          o.visible = false;
          continue;
        }
        o.position.x += (t.x - o.position.x) * ease;
        o.position.z += (t.z - o.position.z) * ease;
      }
    }
    renderer.render(scene, camera);
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
  placeDashes();

  return {
    setSpeed: (mps) => { speed = mps || 0; },
    setObjects,
    setTheme: applyTheme,
    setColor: (hex) => mats.paint.color.set(hex),
    start() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
  };
}
