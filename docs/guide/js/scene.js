// The 3D side of the guide: what is visible at a step, how the new part travels
// to its seat, and where the camera stands to watch it.
//
// Units are metres, Z is up, and every part sits where it sits in the CAD model
// at the home pose - the manifest says which step brings it and from where.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchPack } from './pack.js';

const MM = 0.001;
const UP = new THREE.Vector3(0, 0, 1);
const DEFAULT_DIRECTION = new THREE.Vector3(-0.46, -0.76, 0.46).normalize();
const TIMING = { hold: 450, travel: 1150, rest: 1500, repeats: 2, camera: 650 };
const BACKGROUND = { light: 0xeef2f7, dark: 0x0c131c };

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Scene3D {
  constructor(host, guide, hooks = {}) {
    this.host = host;
    this.guide = guide;
    this.hooks = hooks;
    this.mode = 'detail';
    this.xray = false;
    this.loop = false;
    this.lock = false;
    this.theme = 'light';
    this.current = 1;
    this.intro = null;
    this.objects = new Map();
    this.packState = guide.chapters.map(() => 'idle');
    this.queue = [];
    this.pumping = false;
    this.loadedBytes = 0;
    this.totalBytes = guide.chapters.reduce((sum, chapter) => sum + chapter.bytes, 0);
    this.activeUntil = 0;
    this.frameHandle = 0;
    this.tween = null;
    this.motion = null;
    this.ok = false;
    this.tick = this.tick.bind(this);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      hooks.onUnsupported?.(error);
      return;
    }
    this.ok = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.004, 30);
    this.camera.up.copy(UP);
    this.camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(1.2);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8c99ad, 1.5));
    const headlight = new THREE.DirectionalLight(0xffffff, 2.1);
    headlight.position.set(0.35, 0.55, 1);
    headlight.target.position.set(0, 0, -1);
    this.camera.add(headlight);
    this.camera.add(headlight.target);

    this.root = new THREE.Group();
    this.guides = new THREE.Group();
    this.scene.add(this.root, this.guides);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.02;
    this.controls.maxDistance = 6;
    this.controls.addEventListener('change', () => this.invalidate(250));
    this.controls.addEventListener('start', () => { this.tween = null; });

    this.makeMaterials();
    this.makeGizmo();
    this.setTheme('light');
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  // ---- materials ---------------------------------------------------------

  makeMaterials() {
    const roles = this.guide.roles;
    const lifted = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    this.mat = { role: {}, overlay: {}, trail: {} };
    for (const [key, role] of Object.entries(roles)) {
      if (key === 'context') continue;
      this.mat.role[key] = new THREE.MeshLambertMaterial({ color: role.color, ...lifted });
      // drawn over everything, faintly: the new part stays findable behind what hides it
      this.mat.overlay[key] = new THREE.MeshBasicMaterial({
        color: role.color, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false });
      this.mat.trail[key] = new THREE.MeshBasicMaterial({
        color: role.color, transparent: true, opacity: 0.14, depthWrite: false });
    }
    this.mat.solid = new THREE.MeshLambertMaterial({ color: roles.context.color, ...lifted });
    this.mat.xray = new THREE.MeshLambertMaterial({
      color: roles.context.color, transparent: true, opacity: 0.26, depthWrite: false });
    this.mat.ghost = new THREE.MeshBasicMaterial({
      color: 0x8593a8, transparent: true, opacity: 0.075, depthWrite: false });
    this.mat.later = new THREE.MeshBasicMaterial({
      color: 0x00a6c8, transparent: true, opacity: 0.16, depthWrite: false });
    this.mat.lineNew = new THREE.LineBasicMaterial({ color: 0x142338 });
    this.mat.lineSolid = new THREE.LineBasicMaterial({ color: 0x7a8798 });
    this.mat.lineXray = new THREE.LineBasicMaterial({
      color: 0x7a8798, transparent: true, opacity: 0.45 });
  }

  setTheme(theme) {
    this.theme = theme;
    if (!this.ok) return;
    this.renderer.setClearColor(BACKGROUND[theme] ?? BACKGROUND.light);
    this.mat.ghost.color.set(theme === 'dark' ? 0xa9b6c8 : 0x8593a8);
    this.mat.ghost.opacity = theme === 'dark' ? 0.06 : 0.075;
    this.invalidate();
  }

  // ---- loading -----------------------------------------------------------

  chapterOf(n) {
    return this.guide.steps[n - 1].ch;
  }

  // Packs in the order they are worth having: the step itself, what its picture
  // needs, then the rest of the robot outward from here.
  prioritise(n) {
    const step = this.guide.steps[n - 1];
    const wanted = [step.ch];
    for (const moved of step.moves || []) wanted.push(this.chapterOf(moved));
    const context = step.ctx === 'all' ? [] : step.ctx;
    for (let index = context.length - 1; index >= 0; index -= 1) wanted.push(this.chapterOf(context[index]));
    for (let chapter = step.ch - 1; chapter >= 0; chapter -= 1) wanted.push(chapter);
    for (let chapter = step.ch + 1; chapter < this.guide.chapters.length; chapter += 1) wanted.push(chapter);
    this.queue = [...new Set(wanted)];
    this.pump();
  }

  async pump() {
    if (this.pumping || !this.ok) return;
    this.pumping = true;
    for (;;) {
      const index = this.queue.find((candidate) => this.packState[candidate] === 'idle');
      if (index === undefined) break;
      this.packState[index] = 'loading';
      this.report();
      try {
        const nodes = await fetchPack(`data/${this.guide.chapters[index].pack}`);
        this.install(nodes);
        this.packState[index] = 'ready';
        this.loadedBytes += this.guide.chapters[index].bytes;
        this.refresh();
        if (this.intro === null && this.holdsCurrent(index)) this.play();
      } catch (error) {
        this.packState[index] = 'failed';
        this.hooks.onLoadError?.(index, error);
      }
      this.report();
    }
    this.pumping = false;
  }

  retry() {
    this.packState = this.packState.map((state) => (state === 'failed' ? 'idle' : state));
    this.pump();
  }

  report() {
    const step = this.guide.steps[this.current - 1];
    const needed = [step.ch, ...(step.moves || []).map((n) => this.chapterOf(n))];
    this.hooks.onProgress?.({
      loaded: this.loadedBytes,
      total: this.totalBytes,
      stepReady: needed.every((index) => this.packState[index] === 'ready'),
      allReady: this.packState.every((state) => state === 'ready'),
    });
  }

  holdsCurrent(chapterIndex) {
    const step = this.guide.steps[this.current - 1];
    return step.ch === chapterIndex || (step.moves || []).some((n) => this.chapterOf(n) === chapterIndex);
  }

  install(nodes) {
    for (const [name, entry] of nodes) {
      const match = /^s(\d+)_(\d+)$/.exec(name);
      if (!match || !entry.mesh) continue;
      const n = Number(match[1]);
      const meta = this.guide.steps[n - 1].groups[Number(match[2])];
      const pivot = new THREE.Group();
      pivot.visible = false;
      pivot.add(entry.holder);
      const overlay = new THREE.Mesh(entry.mesh.geometry, this.mat.overlay[meta.role]);
      overlay.renderOrder = 10;
      overlay.visible = false;
      entry.holder.add(overlay);
      this.root.add(pivot);
      const object = {
        n, pivot, holder: entry.holder, mesh: entry.mesh, lines: entry.lines, overlay,
        role: meta.role, state: 'hidden',
        off: new THREE.Vector3().fromArray(meta.off).multiplyScalar(MM),
        travel: new THREE.Vector3(),
      };
      if (!this.objects.has(n)) this.objects.set(n, []);
      this.objects.get(n).push(object);
    }
  }

  // ---- what is visible ---------------------------------------------------

  // The parts this step moves, straight from the manifest, so the camera can be
  // placed before their geometry has arrived.
  parts(n = this.current) {
    const step = this.guide.steps[n - 1];
    const out = [];
    const push = (group, offset) => out.push({
      role: group.role,
      off: new THREE.Vector3().fromArray(offset).multiplyScalar(MM),
      box: new THREE.Box3(
        new THREE.Vector3().fromArray(group.box[0]).multiplyScalar(MM),
        new THREE.Vector3().fromArray(group.box[1]).multiplyScalar(MM)),
    });
    if (step.moves) {
      for (const moved of step.moves) {
        for (const group of this.guide.steps[moved - 1].groups) push(group, step.off);
      }
    } else {
      for (const group of step.groups) push(group, group.off);
    }
    return out;
  }

  refresh() {
    if (!this.ok) return;
    const step = this.guide.steps[this.current - 1];
    const moving = new Set(step.moves || []);
    const context = step.ctx === 'all' ? null : new Set(step.ctx);
    const later = new Set(step.later || []);
    const chapter = this.intro === null ? null : this.guide.chapters[this.intro];
    const stepTravel = step.off ? new THREE.Vector3().fromArray(step.off).multiplyScalar(MM) : null;
    for (const [n, objects] of this.objects) {
      let state;
      if (chapter) {
        state = n < chapter.first ? 'solid' : n <= chapter.last ? 'preview' : 'hidden';
      } else if (n === this.current || moving.has(n)) {
        state = 'current';
      } else if (n < this.current) {
        if (this.mode === 'part') state = 'hidden';
        else state = this.mode === 'whole' || !context || context.has(n) ? 'solid' : 'ghost';
      } else {
        state = later.has(n) && this.mode !== 'part' ? 'later' : 'hidden';
      }
      for (const object of objects) this.setState(object, state, moving.has(n) ? stepTravel : object.off);
    }
    this.rebuildGuides();
    this.invalidate();
  }

  setState(object, state, travel) {
    object.state = state;
    object.pivot.visible = state !== 'hidden';
    object.pivot.position.set(0, 0, 0);
    object.overlay.visible = state === 'current';
    const lines = object.lines;
    if (state === 'current' || state === 'preview') {
      object.mesh.material = this.mat.role[object.role];
      object.travel.copy(travel);
      if (lines) { lines.visible = true; lines.material = this.mat.lineNew; }
    } else if (state === 'solid') {
      object.mesh.material = this.xray ? this.mat.xray : this.mat.solid;
      if (lines) { lines.visible = true; lines.material = this.xray ? this.mat.lineXray : this.mat.lineSolid; }
    } else if (state === 'ghost' || state === 'later') {
      object.mesh.material = state === 'ghost' ? this.mat.ghost : this.mat.later;
      if (lines) lines.visible = false;
    }
  }

  currentObjects() {
    const out = [];
    for (const objects of this.objects.values()) {
      for (const object of objects) if (object.state === 'current') out.push(object);
    }
    return out;
  }

  // A faint copy where the part starts and an arrow along its way in: the
  // direction stays readable once the animation has stopped.
  rebuildGuides() {
    for (const child of [...this.guides.children]) {
      this.guides.remove(child);
      child.dispose?.();
    }
    // "part only" is for recognising the piece in your hand: no journey shown
    if (this.intro !== null || this.mode === 'part') return;
    for (const object of this.currentObjects()) {
      if (object.travel.lengthSq() === 0) continue;
      const trail = new THREE.Mesh(object.mesh.geometry, this.mat.trail[object.role]);
      trail.position.copy(object.holder.position).add(object.travel);
      trail.scale.copy(object.holder.scale);
      this.guides.add(trail);
    }
    const ways = new Map();
    for (const part of this.parts()) {
      if (part.off.lengthSq() === 0) continue;
      const key = part.off.toArray().map((value) => value.toFixed(5)).join();
      if (!ways.has(key)) ways.set(key, { off: part.off, box: new THREE.Box3() });
      ways.get(key).box.union(part.box);
    }
    for (const way of ways.values()) {
      const length = way.off.length();
      const head = Math.min(length * 0.34, 0.012);
      const arrow = new THREE.ArrowHelper(
        way.off.clone().negate().normalize(),
        way.box.getCenter(new THREE.Vector3()).add(way.off),
        length, 0x00a6c8, head, head * 0.6);
      for (const material of [arrow.line.material, arrow.cone.material]) {
        material.depthTest = false;
        material.transparent = true;
        material.opacity = 0.9;
      }
      arrow.line.renderOrder = 20;
      arrow.cone.renderOrder = 20;
      this.guides.add(arrow);
    }
  }

  // ---- public state ------------------------------------------------------

  show(n, { animate = true, instant = false } = {}) {
    this.current = n;
    this.intro = null;
    if (!this.ok) return;
    this.prioritise(n);
    this.refresh();
    this.frame({ instant });
    if (animate) this.play(); else this.motion = null;
    this.report();
  }

  showChapter(index, { instant = false } = {}) {
    const chapter = this.guide.chapters[index];
    this.current = chapter.first;
    this.intro = index;
    this.motion = null;
    if (!this.ok) return;
    this.prioritise(chapter.first);
    this.refresh();
    this.frame({ instant });
    this.report();
  }

  setMode(mode) {
    const was = this.mode;
    this.mode = mode;
    this.refresh();
    // only the part-only view needs its own framing; the other two share one
    if (mode === 'part' || was === 'part') this.frame();
    if (was === 'part' && mode !== 'part') this.play();
  }

  setXray(on) {
    this.xray = on;
    this.refresh();
  }

  setLoop(on) {
    this.loop = on;
    if (on && this.intro === null) this.play();
  }

  setLock(on) {
    this.lock = on;
  }

  play() {
    if (!this.ok || this.intro !== null) return;
    this.motion = { start: performance.now() };
    this.invalidate();
  }

  resetView() {
    this.frame({ direction: DEFAULT_DIRECTION });
  }

  // ---- camera ------------------------------------------------------------

  frame({ instant = false, direction = null } = {}) {
    if (!this.ok) return;
    const whole = new THREE.Box3();
    const seat = new THREE.Box3();
    const ways = [];
    if (this.intro !== null) {
      const chapter = this.guide.chapters[this.intro];
      for (let n = 1; n <= chapter.last; n += 1) {
        for (const part of this.parts(n)) { whole.union(part.box); if (n >= chapter.first) seat.union(part.box); }
      }
    } else {
      for (const part of this.parts()) {
        seat.union(part.box);
        whole.union(part.box);
        if (this.mode === 'part') continue;
        whole.union(part.box.clone().translate(part.off));
        if (part.off.lengthSq() > 0) ways.push(part.off.clone().normalize());
      }
    }
    if (whole.isEmpty()) return;
    const target = seat.getCenter(new THREE.Vector3()).lerp(whole.getCenter(new THREE.Vector3()), 0.4);
    const radius = Math.max(whole.getSize(new THREE.Vector3()).length() * 0.5 * 1.3, 0.042);
    const now = this.camera.position.clone().sub(this.controls.target).normalize();
    const view = direction || (this.lock ? now : this.watchFrom(ways, now));
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2);
    this.moveCamera(target, target.clone().addScaledVector(view, distance), instant);
  }

  // Stand where the part comes from, a little to the side and above, so both
  // the part and the hole it goes into are in sight.
  watchFrom(ways, now) {
    if (this.intro !== null || this.mode === 'part' || !ways.length) return DEFAULT_DIRECTION.clone();
    const flat = new THREE.Vector3(now.x, now.y, 0);
    if (flat.lengthSq() < 1e-6) flat.set(DEFAULT_DIRECTION.x, DEFAULT_DIRECTION.y, 0);
    flat.normalize();
    const sum = ways.reduce((total, way) => total.add(way), new THREE.Vector3());
    const out = new THREE.Vector3();
    if (sum.length() / ways.length > 0.6) {
      const way = sum.normalize();
      if (Math.abs(way.z) > 0.7) return out.copy(way).multiplyScalar(0.74).addScaledVector(flat, 0.67).normalize();
      const side = new THREE.Vector3().crossVectors(UP, way).normalize();
      if (side.dot(now) < 0) side.negate();
      return out.copy(way).multiplyScalar(0.62).addScaledVector(side, 0.56).addScaledVector(UP, 0.55).normalize();
    }
    // parts arriving from opposite sides: look across their line of travel
    const axis = ways[0];
    if (Math.abs(axis.z) > 0.7) return out.copy(flat).multiplyScalar(0.95).addScaledVector(UP, 0.3).normalize();
    const across = flat.clone().addScaledVector(axis, -flat.dot(axis));
    if (across.lengthSq() < 0.05) across.crossVectors(UP, axis);
    return out.copy(across.normalize()).multiplyScalar(0.84).addScaledVector(UP, 0.54).normalize();
  }

  moveCamera(target, position, instant) {
    if (instant) {
      this.tween = null;
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      this.invalidate();
      return;
    }
    this.tween = {
      start: performance.now(),
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromOffset: this.camera.position.clone().sub(this.controls.target),
      toOffset: position.clone().sub(target),
    };
    this.invalidate();
  }

  updateCamera(now) {
    const tween = this.tween;
    if (!tween) return false;
    const t = Math.min(1, (now - tween.start) / TIMING.camera);
    const e = ease(t);
    const from = tween.fromOffset.clone().normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(from, tween.toOffset.clone().normalize());
    const offset = from.applyQuaternion(new THREE.Quaternion().slerp(turn, e))
      .multiplyScalar(THREE.MathUtils.lerp(tween.fromOffset.length(), tween.toOffset.length(), e));
    this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
    this.camera.position.copy(this.controls.target).add(offset);
    if (t >= 1) this.tween = null;
    return t < 1;
  }

  // ---- animation ---------------------------------------------------------

  updateParts(now) {
    if (!this.motion || this.intro !== null) return false;
    const cycle = TIMING.hold + TIMING.travel + TIMING.rest;
    const elapsed = now - this.motion.start;
    const round = Math.floor(elapsed / cycle);
    let progress = 1;
    let running = true;
    if (this.mode === 'part' || (!this.loop && round >= TIMING.repeats)) {
      running = false;
    } else {
      const t = elapsed - round * cycle;
      progress = t < TIMING.hold ? 0 : Math.min(1, ease((t - TIMING.hold) / TIMING.travel));
    }
    for (const object of this.currentObjects()) {
      object.pivot.position.copy(object.travel).multiplyScalar(1 - progress);
    }
    if (!running) this.motion = null;
    return running;
  }

  invalidate(keepAlive = 0) {
    if (!this.ok) return;
    this.activeUntil = Math.max(this.activeUntil, performance.now() + keepAlive);
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.frameHandle = 0;
    const moving = this.updateCamera(now);
    const travelling = this.updateParts(now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateGizmo();
    if (moving || travelling || now < this.activeUntil) {
      this.frameHandle = requestAnimationFrame(this.tick);
    }
  }

  resize() {
    if (!this.ok) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  // ---- axis cross --------------------------------------------------------

  makeGizmo() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-40 -40 80 80');
    svg.setAttribute('class', 'gizmo');
    svg.setAttribute('aria-hidden', 'true');
    this.gizmo = ['X', 'Y', 'Z'].map((label, index) => {
      const group = document.createElementNS(svg.namespaceURI, 'g');
      group.setAttribute('class', `axis axis-${label.toLowerCase()}`);
      const line = document.createElementNS(svg.namespaceURI, 'line');
      const text = document.createElementNS(svg.namespaceURI, 'text');
      text.textContent = label;
      group.append(line, text);
      svg.append(group);
      const axis = new THREE.Vector3();
      axis.setComponent(index, 1);
      return { group, line, text, axis };
    });
    this.host.append(svg);
  }

  updateGizmo() {
    const inverse = this.camera.quaternion.clone().invert();
    const seen = this.gizmo.map((item) => ({ item, v: item.axis.clone().applyQuaternion(inverse) }));
    seen.sort((a, b) => a.v.z - b.v.z);
    for (const { item, v } of seen) {
      item.line.setAttribute('x2', (v.x * 24).toFixed(1));
      item.line.setAttribute('y2', (-v.y * 24).toFixed(1));
      item.text.setAttribute('x', (v.x * 33).toFixed(1));
      item.text.setAttribute('y', (-v.y * 33).toFixed(1));
      item.group.style.opacity = v.z < -0.2 ? '0.45' : '1';
      item.group.parentNode.append(item.group);
    }
  }

  // ---- for the self-test -------------------------------------------------

  // Draws one frame at once; a hidden tab gets no animation frames to wait for.
  renderNow() {
    if (!this.ok) return;
    this.updateCamera(Infinity);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateGizmo();
  }

  stats() {
    const counts = { current: 0, solid: 0, ghost: 0, later: 0, preview: 0, hidden: 0 };
    for (const objects of this.objects.values()) {
      for (const object of objects) counts[object.state] += 1;
    }
    return {
      packs: this.packState.slice(),
      stepsLoaded: this.objects.size,
      objects: counts,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
}
