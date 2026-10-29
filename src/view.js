// three.js rendering of a plan. Plan coordinates: x = length (cab → door), y = width, z = up.
// three.js is y-up, so a plan point (x, y, z) maps to (x, z, -y).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const STAGING_GAP = 70; // cm between van and the "not placed" area

export class View {
  constructor(el, { onPick, onHover } = {}) {
    this.el = el;
    this.onPick = onPick ?? (() => {});
    this.onHover = onHover ?? (() => {});
    this.opts = { gaps: false, estimates: true, labels: true, unplaced: true };
    this.step = Infinity;
    this.selected = null;
    this.pickables = [];

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    el.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 5, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(300, 800, -500);
    this.scene.add(sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this.onPick(this.hit(e)?.userData ?? null);
      down = null;
    });
    dom.addEventListener('pointermove', (e) => this.onHover(this.hit(e)?.userData ?? null, e.clientX, e.clientY));
    dom.addEventListener('pointerleave', () => this.onHover(null));

    new ResizeObserver(() => this.resize()).observe(el);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.plan && this.rebuild());
    const loop = () => {
      this.controls.update();
      this.render();
      requestAnimationFrame(loop);
    };
    loop();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.el;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.pickables.filter((m) => m.visible), false)[0]?.object;
  }

  setPlan(plan, colorOf) {
    const first = !this.plan;
    this.plan = plan;
    this.colorOf = colorOf;
    this.rebuild();
    if (first) this.setCamera('3d');
  }

  setOptions(o) { Object.assign(this.opts, o); if (this.plan) this.rebuild(); }

  setStep(k) {
    this.step = k;
    for (const m of this.pickables) {
      if (m.userData.kind !== 'placed') continue;
      m.visible = m.userData.step <= k;
      if (m.label) m.label.visible = m.visible; // CSS2D labels ignore the parent's visibility
    }
    this.render();
  }

  select(sel) { this.selected = sel; if (this.plan) this.rebuild(); }

  isSelected(d) {
    const s = this.selected;
    return !!s && (s.uid ? s.uid === d.uid : s.id === d.id);
  }

  clear() {
    this.root.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
      if (o.isCSS2DObject) o.element.remove();
    });
    this.root.clear();
    this.pickables = [];
  }

  box(b, color, { opacity = 1, dashed = false, edge, shrink = 0.6, data, label } = {}) {
    const g = new THREE.BoxGeometry(Math.max(1, b.dx - 2 * shrink), Math.max(1, b.dz - 2 * shrink), Math.max(1, b.dy - 2 * shrink));
    const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.copy(V(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2));
    const edgeColor = edge ?? new THREE.Color(color).multiplyScalar(0.55);
    const lm = dashed
      ? new THREE.LineDashedMaterial({ color: edgeColor, dashSize: 5, gapSize: 4 })
      : new THREE.LineBasicMaterial({ color: edgeColor });
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(g), lm);
    if (dashed) lines.computeLineDistances();
    mesh.add(lines);
    if (data) { mesh.userData = data; this.pickables.push(mesh); }
    if (label) {
      const div = document.createElement('div');
      div.className = 'label3d';
      div.textContent = label;
      const obj = new CSS2DObject(div);
      obj.position.set(0, b.dz / 2, 0);
      mesh.add(obj);
      mesh.label = obj;
    }
    this.root.add(mesh);
    return mesh;
  }

  line(points, color, dashed = false) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 8, gapSize: 6 }) : new THREE.LineBasicMaterial({ color });
    const l = new THREE.Line(g, m);
    if (dashed) l.computeLineDistances();
    this.root.add(l);
  }

  text(str, pos, cls = 'label3d tag') {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = str;
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    this.root.add(obj);
  }

  rebuild() {
    this.clear();
    const p = this.plan, C = p.container, { L, W, H } = C;
    this.scene.background = new THREE.Color(css('--scene-bg') || '#f4f3ef');
    this.root.position.set(-L / 2, 0, W / 2);
    const wire = new THREE.Color(css('--scene-wire') || '#8a8a8a');
    const accent = new THREE.Color(css('--accent') || '#2f6fdb');
    const danger = new THREE.Color(css('--danger') || '#d64545');

    // Cargo space: floor, wireframe, door opening
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshLambertMaterial({ color: css('--scene-floor') || '#dedbd2' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(V(L / 2, W / 2, -0.2));
    this.root.add(floor);
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: wire }));
    shell.position.copy(V(L / 2, W / 2, H / 2));
    this.root.add(shell);
    const [dw, dh] = C.door, y0 = (W - dw) / 2;
    this.line([V(L, y0, 0), V(L, y0, dh), V(L, y0 + dw, dh), V(L, y0 + dw, 0)], accent, true);
    this.text('cab', V(0, W / 2, H + 12));
    this.text('rear door', V(L + 8, W / 2, -12));

    for (const o of C.obstacles) this.box(o, css('--scene-obstacle') || '#9a9a96', { data: { kind: 'obstacle', title: o.name, lines: [`${o.dx}×${o.dy}×${o.dz} cm`] } });

    // Placed items; with a selection, everything else turns see-through so the selection is visible inside the load
    const xray = !!this.selected && p.placements.some((it) => this.isSelected(it));
    for (const it of p.placements) {
      const sel = this.isSelected(it);
      const mesh = this.box(it, this.colorOf(it.group), {
        opacity: xray && !sel ? 0.12 : 1,
        dashed: this.opts.estimates && it.conf !== 'measured',
        edge: sel ? accent : undefined,
        data: {
          kind: 'placed', uid: it.uid, id: it.id, step: it.step,
          title: it.name,
          lines: [`${it.dims.join(' × ')} cm · ${it.kg} kg · size ${it.conf}`, `load step ${it.step}${it.load ? ` · carries ${it.load} kg` : ''}`],
        },
        label: this.opts.labels && (sel || (it.labelled && !xray)) ? it.name : null,
      });
      if (sel) mesh.material.emissive = new THREE.Color(0x444444);
      mesh.visible = it.step <= this.step;
    }

    // Not placed: a staging area on the ground beside the van (left side, away from the default camera)
    if (this.opts.unplaced && p.unplaced.length) {
      let x = 0, edge = -STAGING_GAP, rowDepth = 0;
      this.text(`not placed (${p.unplaced.length})`, V(-10, edge, 0), 'label3d tag danger');
      for (const u of p.unplaced) {
        const [l, w, h] = u.dims;
        if (x > 0 && x + l > L) { x = 0; edge -= rowDepth + 25; rowDepth = 0; }
        const sel = this.isSelected(u);
        this.box({ x, y: edge - w, z: 0, dx: l, dy: w, dz: h }, danger, {
          opacity: sel ? 0.55 : 0.18, edge: danger,
          data: { kind: 'unplaced', uid: u.uid, id: u.id, title: `${u.name} — not placed`, lines: [u.detail, `${u.dims.join(' × ')} cm · ${u.kg} kg`] },
          label: this.opts.labels && (sel || u.labelled) ? u.name : null,
        });
        x += l + 25;
        rowDepth = Math.max(rowDepth, w);
      }
    }

    // Free gaps, and the flexible goods assigned to them
    if (this.opts.gaps) {
      p.gaps.forEach((g, i) => {
        const flex = p.flex.filter((f) => f.gap === i);
        const names = flex.map((f) => f.name);
        this.box(g, flex.length ? css('--scene-flex') || '#5fb0b7' : accent, {
          opacity: flex.length ? 0.45 : 0.16, edge: accent, dashed: true, shrink: 1,
          data: { kind: 'gap', title: `Free gap ${g.dx}×${g.dy}×${g.dz} cm`, lines: [`${(g.vol / 1e6).toFixed(2)} m³`, ...(names.length ? [`flexible goods: ${names.join(', ')}`] : [])] },
          label: i < 6 || flex.length ? `${g.dx}×${g.dy}×${g.dz}` : null,
        });
      });
    }
    this.setStep(this.step);
  }

  setCamera(name) {
    const C = this.plan?.container;
    if (!C) return;
    const d = Math.max(C.L, C.W, C.H) * 1.35;
    const t = new THREE.Vector3(0, C.H * 0.35, C.W * 0.15);
    const pos = {
      '3d': [d * 0.75, d * 0.75, -d * 0.85],
      door: [d * 1.15, C.H * 0.75, 0],
      top: [0, d * 1.55, -1],
      side: [0, C.H * 0.6, -d * 1.3],
    }[name] ?? [d, d, -d];
    this.camera.position.set(...pos);
    this.controls.target.copy(t);
    this.controls.update();
    this.render();
  }
}
