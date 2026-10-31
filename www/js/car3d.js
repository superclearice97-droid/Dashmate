// The 3D view of your car on the road (three.js). An original low-poly car; road
// markings scroll with your real speed, and a car ahead appears when the camera sees one.
import * as THREE from '../vendor/three/three.module.min.js';

const PALETTE = {
  light: { road: 0xd3d6dc, shoulder: 0xe6e8ec, line: 0xffffff, edge: 0xf7f7f9 },
  dark: { road: 0x23262e, shoulder: 0x1a1c22, line: 0x8a8f9c, edge: 0x6b7080 },
};

function buildCar(color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2c3c56, roughness: 0.15, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xc0101e, emissiveIntensity: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.4), paint);
  body.position.y = 0.6;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 1.3), paint);
  hood.position.set(0, 0.93, -1.45);
  // Cabin narrows toward the roof so it reads as a car, not a box.
  const cabinGeo = new THREE.BoxGeometry(1.62, 0.52, 2.1);
  const p = cabinGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.86);
      p.setZ(i, p.getZ(i) * 0.72 + 0.1);
    }
  }
  cabinGeo.computeVertexNormals();
  const cabin = new THREE.Mesh(cabinGeo, glass);
  cabin.position.set(0, 1.13, 0.15);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.6), paint);
  roof.position.set(0, 1.42, 0.25);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 0.15), dark);
  bumper.position.set(0, 0.42, 2.2);
  car.add(body, hood, cabin, roof, bumper);
  for (const x of [-0.62, 0.62]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.06), red);
    tail.position.set(x, 0.74, 2.21);
    car.add(tail);
  }
  car.userData.wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.4, 1.4]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(x, 0.36, z);
      car.add(w);
      car.userData.wheels.push(w);
    }
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.25, 2.6, 1);
  shadow.position.y = 0.01;
  car.add(shadow);
  car.userData.paint = paint;
  return car;
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
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  camera.position.set(0, 4.8, 10.5);
  camera.lookAt(0, 0.4, -8);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  const mats = {
    road: new THREE.MeshStandardMaterial({ roughness: 1 }),
    shoulder: new THREE.MeshStandardMaterial({ roughness: 1 }),
    line: new THREE.MeshBasicMaterial(),
    edge: new THREE.MeshBasicMaterial(),
  };
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11, 400), mats.road);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -180;
  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(80, 400), mats.shoulder);
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(0, -0.02, -180);
  scene.add(shoulder, road);
  for (const x of [-5.3, 5.3]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 400), mats.edge);
    edge.position.set(x, 0.01, -180);
    scene.add(edge);
  }

  const DASH = 6;
  const dashCount = 2 * 40;
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.01, 2.6), mats.line, dashCount);
  scene.add(dashes);
  const m4 = new THREE.Matrix4();
  let offset = 0;
  const placeDashes = () => {
    let i = 0;
    for (const x of [-1.8, 1.8]) {
      for (let k = 0; k < dashCount / 2; k++) {
        m4.makeTranslation(x, 0.012, 12 - k * DASH + offset);
        dashes.setMatrixAt(i++, m4);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;
  };

  const car = buildCar(color);
  scene.add(car);
  const lead = buildCar('#3b6ff5');
  lead.position.z = -16;
  lead.visible = false;
  scene.add(lead);

  const applyTheme = (t) => {
    const p = PALETTE[t] || PALETTE.light;
    mats.road.color.setHex(p.road);
    mats.shoulder.color.setHex(p.shoulder);
    mats.line.color.setHex(p.line);
    mats.edge.color.setHex(p.edge);
  };
  applyTheme(theme);

  let speed = 0;
  let leadTarget = false;
  let running = false;
  let last = 0;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.9 ? 50 : 38;
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
    // The car ahead eases in and out instead of popping.
    const targetZ = leadTarget ? -16 : -60;
    lead.position.z += (targetZ - lead.position.z) * Math.min(1, dt * 2);
    lead.visible = lead.position.z > -55;
    renderer.render(scene, camera);
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
  placeDashes();

  return {
    setSpeed: (mps) => { speed = mps || 0; },
    setLead: (v) => { leadTarget = !!v; },
    setTheme: applyTheme,
    setColor: (hex) => car.userData.paint.color.set(hex),
    start() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
  };
}
