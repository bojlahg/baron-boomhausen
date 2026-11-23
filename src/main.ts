import './style.css';
import gameAtlasUrl from './assets/game-atlas.svg';
import { gameAudio } from './audio';
import type { DebugPanel } from './debug';
import { ParticleEffects } from './effects';
import { advance, beginFlight, flightSpeed, impulse, targetTimeAt } from './flight';
import type { Flight } from './flight';
import { availableRewards, claim, isUnlock, loadProgress, saveProgress, startingProgress } from './progress';
import { badge, fromMinimap, inventoryArt, paint, paintMinimap, project, unproject } from './render';
import type { Camera, Effect, Scene, UiSprite } from './render';
import { returnAt, startReturn } from './return-ride';
import type { HorseDeparture, ReturnPose, ReturnTrip } from './return-ride';
import { mountTutorial } from './tutorial';
import type { TutorialStep } from './tutorial';
import { canPlace, chargeLimit, chargeTypes, charges, clamp, copySetup, distance, duckRangeRight, gravity, insideZone, launchers, launchPosition, map, moon, rewardNames, start, startingSetup, step, zone } from './world';
import type { Charge, ChargeType, Launcher, Point } from './world';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing game element: ${id}`);
  return node as T;
}

const canvas = element<HTMLCanvasElement>('game');
const minimap = element<HTMLCanvasElement>('minimap');
const ctx = canvas.getContext('2d');
const mapCtx = minimap.getContext('2d');
const launchButton = element<HTMLButtonElement>('launch');
const homeButton = element<HTMLButtonElement>('home');
const homeLabel = element('home-label');
const retryButton = element<HTMLButtonElement>('retry');
const wigButton = element<HTMLButtonElement>('wig');
const trailButton = element<HTMLButtonElement>('trail-toggle');
const soundButton = element<HTMLButtonElement>('sound-toggle');
const zoomInButton = element<HTMLButtonElement>('zoom-in');
const zoomOutButton = element<HTMLButtonElement>('zoom-out');
const settingsDialog = element<HTMLDialogElement>('settings-dialog');
const settingsMute = element<HTMLButtonElement>('settings-mute');
const removeButton = element<HTMLButtonElement>('remove-charge');
const clearChargesButton = element<HTMLButtonElement>('clear-charges');
const launcherSelect = element<HTMLSelectElement>('launcher');
const angleControl = element('angle-control');
const angleLabel = element('angle-label');
const angleInput = element<HTMLInputElement>('angle');
const angleValue = element('angle-value');
const inventory = element('inventory');
const chargePreview = element('charge-preview');
const result = element('result');
const toast = element('toast');
const hint = element('hint');
const stageLabel = element('stage-label');
const recordHeight = element('record-height');
const recordRange = element('record-range');
const recordDucks = element('record-ducks');
const moonLabel = element('moon-label');
const moonDistance = element('moon-distance');

for (const node of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  node.append(badge(node.dataset.icon as UiSprite));
}

type GestureAction = { kind: 'move'; target: Charge | 'baron'; offset: Point }
  | { kind: 'place'; type: ChargeType; fromInventory: boolean }
  | { kind: 'pan'; origin: Point };
type Gesture = GestureAction & { id: number; start: Point; moved: boolean };

const debugMode = import.meta.env.MODE !== 'release'
  && (import.meta.env.MODE === 'debug' || new URLSearchParams(location.search).get('debug') === '1');
const progressKey = debugMode ? 'baron-boomhausen:debug:v1' : 'baron-boomhausen:v1';
const progress = loadProgress(progressKey);
let debugPanel: DebugPanel | undefined;
let visibleRewards = availableRewards(progress);
const setup = progress.lastSetup ? copySetup(progress.lastSetup) : startingSetup();
const tutorialSetup = startingSetup();
const tutorialView = mountTutorial();
let tutorial: TutorialStep | null = null;
let mode: Scene['mode'] = 'prepare';
let flight: Flight | null = null;
let finish: { since: number; moon: boolean; moonSplit: boolean } | null = null;
let returnTrip: ReturnTrip | null = null;
let returnPose: ReturnPose | null = null;
let horseDeparture: HorseDeparture | null = null;
let freeCamera = false;
let trailVisible = true;
let assetsReady = false;
let selectedType: ChargeType = 'powder-charge';
let selected: Charge | null = null;
let gesture: Gesture | null = null;
let ghost: Scene['ghost'] = null;
let wigQueued = false;
let launchAt = -Infinity;
let wigAt = -Infinity;
let effects: Effect[] = [];
const particles = new ParticleEffects(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.45 : 1);
let toastUntil = 0;
let accumulator = 0;
let preparationTime = 0;
let lastFrame = 0;
let lastPaint = 0;
let nextHud = 0;
let dirty = true;
let initialZoom = 1;
let handledTouch: { id: number; time: number } | null = null;

const view: Camera = { x: 85, y: 110, width: 960, height: 540, zoom: initialZoom };
const flightCameraLead: Point = { x: 0, y: 0 }; // Fractions of the viewport.
const atlas = new Image();
const audio = gameAudio();
const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const meters = (value: number): string => `${formatter.format(Math.max(0, value))} m`;

function updateText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function updateSoundButton(): void {
  soundButton.setAttribute('aria-pressed', String(!audio.muted));
  soundButton.title = audio.muted ? 'Enable Sound' : 'Mute Sound';
  soundButton.replaceChildren(badge(audio.muted ? 'icon-muted' : 'icon-sound'));
  updateText(settingsMute, audio.muted ? 'Unmute All' : 'Mute All');
}

// The browser may send a synthetic click to another control after the tap changes the UI.
document.addEventListener('click', (event) => {
  if (!handledTouch || event.detail === 0 || event.timeStamp - handledTouch.time >= 500) return;
  if (event instanceof PointerEvent && (event.pointerType !== 'touch' || event.pointerId !== handledTouch.id)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, { capture: true });

function bindTap(control: HTMLElement, action: (event: MouseEvent) => void): void {
  let press: { id: number; point: Point } | null = null;
  control.addEventListener('click', action);
  control.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' && event.isPrimary) {
      press = { id: event.pointerId, point: { x: event.clientX, y: event.clientY } };
    }
  });
  control.addEventListener('pointercancel', (event) => { if (event.pointerId === press?.id) press = null; });
  control.addEventListener('pointerup', (event) => {
    if (!press || press.id !== event.pointerId) return;
    const origin = press.point;
    press = null;
    if (control instanceof HTMLButtonElement && control.disabled) return;
    const { clientX: x, clientY: y } = event;
    const bounds = control.getBoundingClientRect();
    if (distance(origin, { x, y }) > 10 || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
    handledTouch = { id: event.pointerId, time: event.timeStamp };
    action(event);
  });
}

function count(type: ChargeType): number {
  return setup.charges.filter((charge) => charge.type === type).length;
}

function startTutorial(): void {
  tutorial = !debugMode && !progress.tutorialSeen ? 'move' : null;
  if (!tutorial) return;
  Object.assign(setup, {
    baron: { x: -32, y: 42 }, charges: [], launcher: 'none',
    cannonAngle: tutorialSetup.cannonAngle, mortarTilt: tutorialSetup.mortarTilt,
  });
}

function guidingSetup(): boolean {
  return tutorial === 'move' || tutorial === 'charges' || tutorial === 'launch';
}

function tutorialTarget(): Point | null {
  if (tutorial === 'move') return tutorialSetup.baron;
  if (tutorial === 'charges') return tutorialSetup.charges[setup.charges.length] ?? null;
  return null;
}

startTutorial();

const slots = new Map<ChargeType, { button: HTMLButtonElement; label: HTMLElement }>();
for (const type of chargeTypes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.charge = type;
  const label = document.createElement('strong');
  button.append(inventoryArt(type), label);
  button.addEventListener('click', () => {
    if (!progress.counts[type] || (guidingSetup() && tutorial !== 'charges')) return;
    selectedType = type;
    selected = null;
    updateControls();
  });
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || mode !== 'prepare' || gesture || !progress.counts[type]) return;
    if (guidingSetup() && tutorial !== 'charges') return;
    selectedType = type;
    selected = null;
    if (count(type) < progress.counts[type]) {
      beginGesture(button, event, { kind: 'place', type, fromInventory: true });
    }
    updateControls();
  });
  slots.set(type, { button, label });
  inventory.append(button);
}

function updateTutorial(): void {
  hint.hidden = tutorial !== null;
  tutorialView.show(tutorial, setup.charges.length, progress.counts['powder-charge']);
  const atElement = (node: HTMLElement): Point => {
    const { left, top, width, height } = node.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
  };
  const atWorld = (point: Point): Point => {
    const p = project(view, point);
    const { left, top } = canvas.getBoundingClientRect();
    return { x: left + p.x, y: top + p.y };
  };
  const target = tutorialTarget();
  const powder = slots.get('powder-charge')!.button;
  if (tutorial === 'move' && target) {
    tutorialView.point(atWorld(setup.baron), atWorld(target));
  } else if (tutorial === 'charges' && target) tutorialView.point(atElement(powder), atWorld(target));
  else if (tutorial === 'launch') tutorialView.point(atElement(launchButton));
  else tutorialView.point(null);
}

function currentPosition(): Point {
  return returnPose?.position ?? flight?.position ?? launchPosition(setup);
}

function sceneryTime(now: number): number {
  return (flight?.tick ?? 0) * step + (finish ? (now - finish.since) / 1000 * flightSpeed : 0);
}

function updateHud(): void {
  updateText(recordHeight, meters(progress.height));
  updateText(recordRange, meters(progress.range));
  updateText(recordDucks, String(progress.duckRecord));
  updateText(moonLabel, progress.moonHits === 2 ? 'Cheese Moon' : progress.moonHits === 1 ? 'Moon Reached' : 'To the Moon');
  updateText(moonDistance, progress.moonHits > 0 ? '✓' : meters(distance(currentPosition(), moon) - moon.radius));
  updateText(stageLabel, mode === 'flight' && flight
    ? `Altitude ${meters(flight.position.y)} · Peak ${meters(flight.height)} · Range ${meters(flight.range)} · Ducks ${flight.ducks.size}`
    : returnPose?.kind === 'hop' ? 'Hopping Back'
    : returnPose ? returnPose.travel > 0 ? 'Heading Back' : 'Ride Incoming'
    : mode === 'result' ? 'Moon'
    : freeCamera ? 'Free Camera' : 'Launch Site');
}

function updateLauncherAngle(): void {
  const { launcher } = setup;
  angleControl.hidden = launcher === 'none';
  if (launcher === 'none') return;
  const angle = launcher === 'mortar' ? setup.mortarTilt : setup.cannonAngle;
  const { minAngle, maxAngle } = launchers[launcher];
  angleInput.min = String(minAngle);
  angleInput.max = String(maxAngle);
  angleInput.value = String(angle);
  updateText(angleLabel, launcher === 'mortar' ? 'Mortar Tilt' : 'Cannon Angle');
  updateText(angleValue, `${launcher === 'mortar' && angle > 0 ? '+' : ''}${angle}°`);
}

function updateControls(): void {
  const preparing = mode === 'prepare';
  const guided = guidingSetup();
  const canFollow = mode === 'flight' && freeCamera;
  element('prepare-controls').hidden = !preparing;
  launchButton.hidden = !preparing;
  launchButton.disabled = !assetsReady || (guided && tutorial !== 'launch') || (!setup.charges.length && setup.launcher === 'none');
  zoomInButton.disabled = guided;
  zoomOutButton.disabled = guided;
  minimap.tabIndex = guided ? -1 : 0;
  minimap.setAttribute('aria-disabled', String(guided));
  homeButton.hidden = preparing && !freeCamera;
  updateText(homeLabel, returnTrip?.kind === 'hop' ? 'Skip Hop' : returnTrip ? 'Skip Ride' : canFollow ? 'Follow Baron' : 'Back to Baron');
  retryButton.hidden = !!returnTrip;
  wigButton.hidden = mode !== 'flight' || !progress.unlocked.wig;
  wigButton.disabled = !!flight?.wigUsed || wigQueued;
  removeButton.hidden = guided || !selected;
  clearChargesButton.hidden = guided;
  clearChargesButton.disabled = setup.charges.length === 0;
  trailButton.setAttribute('aria-pressed', String(trailVisible));

  for (const [type, { button, label }] of slots) {
    const amount = progress.counts[type];
    const placed = count(type);
    updateText(label, `${placed}/${amount}`);
    button.title = amount ? `${charges[type].name} · ${placed} of ${amount} placed` : `${charges[type].name} · Collect its crate to unlock`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(type === selectedType && amount > 0));
    button.disabled = amount === 0 || (guided && tutorial !== 'charges');
    button.setAttribute('aria-disabled', String(button.disabled));
  }

  element('launcher-control').hidden = !progress.unlocked.mortar && !progress.unlocked.cannon;
  for (const option of launcherSelect.options) {
    if (option.value === 'mortar' || option.value === 'cannon') option.disabled = !progress.unlocked[option.value];
  }
  launcherSelect.value = setup.launcher;
  updateLauncherAngle();

  updateText(hint, preparing
    ? selected ? 'Drag the charge back to the inventory to remove it.'
      : setup.launcher !== 'none' ? 'Set the angle, arrange your charges and hit BOOM!'
      : freeCamera ? 'Drag the background to pan. Drag the Baron or charges to reposition them.'
      : progress.attempts === 0 ? 'Drag the Baron or move the charges. Hit BOOM! to try the starting setup.'
      : 'Pick a charge below and place it inside the box. The dotted trail shows your last flight.'
    : mode === 'flight' ? canFollow ? 'Drag to pan, or select Follow Baron to resume tracking.'
      : 'Drag the view or use the minimap and zoom controls to explore.'
    : returnTrip?.kind === 'hop' ? 'The Baron is hopping back to your setup.'
    : returnTrip ? 'The Baron is heading back to your setup. Skip the ride to get there sooner.'
    : 'Try Again! takes you back to the same setup.');
  updateHud();
  updateTutorial();
  debugPanel?.setReady(preparing && assetsReady);
  dirty = true;
}

function homeCenterX(): number {
  const center = view.width / initialZoom > 380 ? 94 : 68;
  const room = Math.max(0, view.width / (2 * view.zoom) - (zone.right - zone.left) / 2);
  const { x } = launchPosition(setup);
  return clamp(center, x - room, x + room);
}

function groundViewY(): number {
  return view.height / (2 * view.zoom) - 21;
}

function centerStartView(): void {
  view.x = homeCenterX();
  view.y = Math.max(groundViewY(), launchPosition(setup).y + Math.min(24, view.height / (4 * view.zoom)));
  dirty = true;
}

function focusBaron(snap = false, elapsed = 0): void {
  if (!flight) return;
  const position = currentPosition();
  const groundY = returnPose ? groundViewY() : view.height / (2 * view.zoom) - 24;
  if (mode === 'flight') {
    const lookAhead = 1.2;
    const visibleWidth = view.width / view.zoom;
    const visibleHeight = view.height / view.zoom;
    const aheadX = flight.velocity.x * lookAhead / visibleWidth;
    const aheadY = (flight.velocity.y - gravity * lookAhead / 2) * lookAhead / visibleHeight;
    const limit = Math.max(1, Math.abs(aheadX) / 0.28, Math.abs(aheadY) / 0.26);
    const share = snap ? 1 : 1 - Math.exp(-elapsed * 14);
    // Track the Baron directly and ease only the lead so speed can't make the camera fall behind.
    flightCameraLead.x += (aheadX / limit - flightCameraLead.x) * share;
    flightCameraLead.y += (aheadY / limit - flightCameraLead.y) * share;
    view.x = position.x + flightCameraLead.x * visibleWidth;
    view.y = Math.max(groundY, position.y + flightCameraLead.y * visibleHeight);
    return;
  }

  const targetX = finish?.moonSplit ? moon.x - moon.radius * 0.2
    : position.x + (returnPose && returnTrip ? (homeCenterX() - returnTrip.to.x) * returnPose.travel ** 4 : 0);
  const targetY = finish?.moonSplit ? moon.y - moon.radius * 0.1
    : Math.max(groundY, position.y + Math.min(24, view.height / (4 * view.zoom)));
  const share = snap || (returnPose && returnPose.travel > 0) ? 1 : 1 - Math.exp(-elapsed * 9);
  view.x += (targetX - view.x) * share;
  view.y += (targetY - view.y) * share;
}

function moveCamera(x: number, y: number): void {
  view.x = clamp(x, map.left, duckRangeRight);
  view.y = clamp(y, 0, Math.max(map.top, currentPosition().y));
  dirty = true;
}

function panCamera(x: number, y: number): void {
  moveCamera(x, y);
  if (!freeCamera) { freeCamera = true; updateControls(); }
}

function resetCamera(): void {
  freeCamera = false;
  if (mode === 'prepare') centerStartView();
  else focusBaron(true);
  updateControls();
}

function zoom(factor: number, screen = { x: view.width / 2, y: view.height / 2 }): void {
  if (guidingSetup()) return;
  const before = unproject(view, screen);
  view.zoom = clamp(view.zoom * factor, Math.min(initialZoom, Math.max(view.width / 5900, view.height / 3900)), initialZoom * 4);
  const after = unproject(view, screen);
  moveCamera(view.x + before.x - after.x, view.y + before.y - after.y);
}

function screenPoint(event: PointerEvent | WheelEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function placement(raw: Point): Point {
  return { x: Math.round(raw.x * 10) / 10, y: Math.round(raw.y * 10) / 10 };
}

function snapPlacement(raw: Point): Point | null {
  if (!guidingSetup()) return placement(raw);
  const target = tutorialTarget();
  const radius = Math.max(12, 24 / view.zoom);
  return target && distance(raw, target) <= radius ? target : null;
}

function nearestCharge(point: Point): Charge | null {
  let nearest: Charge | null = null;
  let gap = Math.max(6.4, 7 / view.zoom);
  for (const charge of setup.charges) {
    const candidate = distance(charge, point);
    if (candidate <= gap) { nearest = charge; gap = candidate; }
  }
  return nearest;
}

function beginGesture(surface: HTMLElement, event: PointerEvent, action: GestureAction): void {
  gesture = { ...action, id: event.pointerId, start: screenPoint(event), moved: false };
  if (action.kind === 'place') chargePreview.replaceChildren(inventoryArt(action.type));
  else if (action.kind === 'move' && action.target !== 'baron') chargePreview.replaceChildren(inventoryArt(action.target.type));
  surface.setPointerCapture(event.pointerId);
}

function clearGesture(): void {
  gesture = null;
  ghost = null;
  chargePreview.hidden = true;
  inventory.classList.remove('return-target');
  dirty = true;
}

function overInventory(event: PointerEvent): boolean {
  const { left, right, top, bottom } = inventory.getBoundingClientRect();
  return event.clientX >= left && event.clientX < right && event.clientY >= top && event.clientY < bottom;
}

canvas.addEventListener('pointerdown', (event) => {
  if (gesture || event.button !== 0) return;
  if (tutorial === 'launch') return;
  const world = unproject(view, screenPoint(event));
  const guided = guidingSetup();
  if (!guided && (mode !== 'prepare' || event.shiftKey)) {
    beginGesture(canvas, event, { kind: 'pan', origin: { x: view.x, y: view.y } });
    return;
  }
  const charge = guided ? null : nearestCharge(world);
  const baron = launchPosition(setup);
  const hero = tutorial !== 'charges' && Math.abs(world.x - baron.x) <= 14 && world.y >= baron.y - 10 && world.y <= baron.y + 38;
  if (tutorial === 'move' && !hero) return;
  if (hero && !charge && setup.launcher !== 'none') return;
  if (charge || hero) {
    const point = charge || baron;
    selected = charge;
    if (charge) selectedType = charge.type;
    beginGesture(canvas, event, { kind: 'move', target: charge || 'baron', offset: { x: world.x - point.x, y: world.y - point.y } });
    updateControls();
  } else if (!freeCamera && insideZone(world)) {
    if (count(selectedType) < progress.counts[selectedType]) {
      beginGesture(canvas, event, { kind: 'place', type: selectedType, fromInventory: false });
    }
  } else if (!guided) beginGesture(canvas, event, { kind: 'pan', origin: { x: view.x, y: view.y } });
});

document.addEventListener('pointermove', (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const screen = screenPoint(event);
  gesture.moved ||= distance(screen, gesture.start) > 3;
  if (!gesture.moved) return;
  if (gesture.kind === 'pan') {
    panCamera(gesture.origin.x + (gesture.start.x - screen.x) / view.zoom,
      gesture.origin.y + (screen.y - gesture.start.y) / view.zoom);
    return;
  }
  const point = unproject(view, screen);
  const target = gesture.kind === 'move' ? gesture.target : null;
  if (gesture.kind === 'move') { point.x -= gesture.offset.x; point.y -= gesture.offset.y; }
  const candidate = snapPlacement(point);
  ghost = {
    target,
    point: candidate ?? placement(point), valid: candidate !== null && canPlace(setup, candidate, target),
  };
  if (target !== 'baron') {
    const returning = target !== null && overInventory(event);
    const preview = project(view, ghost.point);
    chargePreview.style.left = `${event.clientX + (returning ? 0 : preview.x - screen.x)}px`;
    chargePreview.style.top = `${event.clientY + (returning ? 0 : preview.y - screen.y)}px`;
    chargePreview.style.setProperty('--charge-scale', String(clamp(view.zoom * 0.475, 0.75, 1.6)));
    chargePreview.hidden = false;
    inventory.classList.toggle('return-target', returning);
  }
  dirty = true;
});

function endGesture(event: PointerEvent): void {
  if (!gesture || gesture.id !== event.pointerId) return;
  const active = gesture;
  clearGesture();
  if (mode !== 'prepare' || active.kind === 'pan' || event.type === 'pointercancel') return;
  if (active.kind === 'move' && active.moved && active.target !== 'baron' && overInventory(event)) {
    removeCharge(active.target);
    return;
  }

  const screen = screenPoint(event);
  if (screen.x < 0 || screen.x > view.width || screen.y < 0 || screen.y > view.height) return;
  const point = unproject(view, screen);
  let placedAt: Point;
  if (active.kind === 'move') {
    if (!active.moved) return;
    const candidate = snapPlacement({ x: point.x - active.offset.x, y: point.y - active.offset.y });
    if (!candidate || !canPlace(setup, candidate, active.target)) return;
    if (active.target === 'baron') setup.baron = { ...candidate };
    else Object.assign(active.target, candidate);
    placedAt = candidate;
  } else if ((!active.fromInventory || active.moved) && count(active.type) < progress.counts[active.type]) {
    const candidate = snapPlacement(point);
    if (!candidate || !canPlace(setup, candidate, null)) return;
    selected = { ...candidate, type: active.type };
    setup.charges.push(selected);
    placedAt = candidate;
  } else return;
  if (tutorial === 'move') tutorial = 'charges';
  else if (tutorial === 'charges' && setup.charges.length === tutorialSetup.charges.length) tutorial = 'launch';
  audio.play('place');
  particles.burst('place', placedAt, performance.now());
  updateControls();
}

document.addEventListener('pointerup', endGesture);
document.addEventListener('pointercancel', endGesture);
document.addEventListener('lostpointercapture', (event) => {
  if (gesture?.id === event.pointerId) clearGesture();
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoom(event.deltaY < 0 ? 1.16 : 1 / 1.16, screenPoint(event));
}, { passive: false });

function removeCharge(item: Charge): void {
  if (mode !== 'prepare' || guidingSetup()) return;
  const index = setup.charges.indexOf(item);
  if (index < 0) return;
  setup.charges.splice(index, 1);
  if (gesture?.kind === 'move' && gesture.target === item) clearGesture();
  if (selected === item) selected = null;
  updateControls();
}

canvas.addEventListener('contextmenu', (event) => {
  if (mode !== 'prepare') return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const item = nearestCharge(unproject(view, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
  if (item) removeCharge(item);
});
bindTap(removeButton, () => { if (selected) removeCharge(selected); });
bindTap(clearChargesButton, () => {
  if (mode !== 'prepare' || guidingSetup() || !setup.charges.length) return;
  clearGesture();
  setup.charges.length = 0;
  selected = null;
  updateControls();
});

bindTap(minimap, (event) => {
  if (guidingSetup()) return;
  const bounds = minimap.getBoundingClientRect();
  const targetTime = flight ? targetTimeAt(flight, sceneryTime(performance.now())) : preparationTime;
  const point = fromMinimap(minimap.width, minimap.height, {
    x: (event.clientX - bounds.left - minimap.clientLeft) * minimap.width / minimap.clientWidth,
    y: (event.clientY - bounds.top - minimap.clientTop) * minimap.height / minimap.clientHeight,
  }, view.x, { position: currentPosition(), visibleRewards, targetTime });
  panCamera(point.x, Math.max(point.y, groundViewY()));
});
minimap.addEventListener('keydown', (event) => {
  if (guidingSetup()) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  panCamera(moon.x, moon.y);
});
bindTap(trailButton, () => { trailVisible = !trailVisible; updateControls(); });
bindTap(zoomInButton, () => zoom(1.25));
bindTap(zoomOutButton, () => zoom(0.8));
launcherSelect.addEventListener('change', () => {
  if (mode !== 'prepare') return;
  const choice = launcherSelect.value as Launcher;
  if (choice === 'none' || progress.unlocked[choice]) setup.launcher = choice;
  clearGesture();
  selected = null;
  updateControls();
});
angleInput.addEventListener('input', () => {
  if (mode !== 'prepare' || setup.launcher === 'none') return;
  if (setup.launcher === 'mortar') setup.mortarTilt = angleInput.valueAsNumber;
  else setup.cannonAngle = angleInput.valueAsNumber;
  updateLauncherAngle();
  dirty = true;
});

function notification(message: string, now: number): void {
  updateText(toast, message);
  toast.hidden = false;
  toastUntil = now + 2180;
}

function play(): void {
  if (mode !== 'prepare' || launchButton.disabled) return;
  clearGesture();
  selected = null;
  finish = null;
  wigQueued = false;
  launchAt = performance.now();
  wigAt = -Infinity;
  accumulator = 0;
  progress.lastSetup = copySetup(setup);
  saveProgress(progress, progressKey);
  flight = beginFlight(setup, preparationTime);
  audio.play('launch');
  mode = 'flight';
  if (tutorial === 'launch') tutorial = 'flight';
  visibleRewards = availableRewards(progress);
  const testReward = debugPanel?.startFlight();
  if (testReward) visibleRewards.set(testReward.type, testReward);
  effects = setup.charges.map((charge) => ({ sprite: 'launch-burst', point: charge, since: launchAt, duration: 480, size: 36 }));
  particles.clear();
  const launchPoint = { ...launchPosition(setup) };
  if (setup.launcher !== 'none') {
    effects.push({ sprite: 'launch-burst', point: launchPoint, since: launchAt, duration: 480, size: 47 });
  } else if (setup.charges.length) {
    const total = setup.charges.reduce((sum, charge) => ({ x: sum.x + charge.x, y: sum.y + charge.y }), { x: 0, y: 0 });
    launchPoint.x = total.x / setup.charges.length;
    launchPoint.y = total.y / setup.charges.length;
  } else launchPoint.y = Math.max(3, launchPoint.y - 15);
  particles.burst('launch', launchPoint, launchAt);
  centerStartView();
  flightCameraLead.x = (view.x - flight.position.x) * view.zoom / view.width;
  flightCameraLead.y = (view.y - flight.position.y) * view.zoom / view.height;
  freeCamera = false;
  updateControls();
}

function storeFlight(completed: Flight): boolean {
  const record = Math.round(completed.height) > Math.round(progress.height)
    || Math.round(completed.range) > Math.round(progress.range) || completed.ducks.size > progress.duckRecord;
  progress.height = Math.max(progress.height, completed.height);
  progress.range = Math.max(progress.range, completed.range);
  progress.duckRecord = Math.max(progress.duckRecord, completed.ducks.size);
  progress.attempts++;
  progress.lastPath = completed.path.at(-1) === completed.position ? completed.path : [...completed.path, completed.position];
  saveProgress(progress, progressKey);
  return record;
}

function complete(completed: Flight, now: number): void {
  const reachedMoon = completed.outcome === 'moon';
  const moonSplit = reachedMoon && progress.moonHits === 1;
  if (moonSplit) progress.moonHits = 2;
  else if (reachedMoon && progress.moonHits === 0) {
    const { x, y } = completed.position;
    progress.moonHits = 1;
    progress.moonCrackAngle = Math.atan2(y - moon.y, x - moon.x);
  }
  const record = storeFlight(completed);
  mode = 'result';
  finish = { since: now, moon: reachedMoon, moonSplit };
  if (!finish.moon) {
    audio.play('landing');
    if (record) audio.play('record');
    returnTrip = startReturn(completed.position, launchPosition(setup), now, progress.attempts % 7 === 0);
    returnPose = returnAt(returnTrip, now);
    if (returnTrip.kind === 'ride' && !returnTrip.deer) horseDeparture = null;
  } else audio.play('moon');
  if (freeCamera && (!reachedMoon || moonSplit)) {
    freeCamera = false;
    clearGesture();
    focusBaron(true);
  }
  effects.push({ sprite: finish.moon ? 'reward-pop' : 'landing-dust', point: completed.position,
    since: now, duration: 750, size: finish.moon ? 80 : 82 });
  if (reachedMoon) particles.burst(moonSplit ? 'cheese' : 'moon', completed.position, now);
  else particles.burst('landing', { x: completed.position.x, y: 2 }, now);
  element('result-icon').replaceChildren(badge(finish.moon ? 'icon-moon' : 'icon-record'));
  updateText(element('result-title'), moonSplit ? 'The Moon Was Cheese!' : finish.moon ? 'Baron on the Moon!' : record ? 'New Record!' : 'Touchdown!');
  updateText(element('result-stats'), `Height ${meters(completed.height)} · Range ${meters(completed.range)} · Ducks ${completed.ducks.size}`);
  updateControls();
}

function returnToStart(): void {
  debugPanel?.stopFlight();
  if (mode === 'flight' && flight && flight.tick > 0) storeFlight(flight);
  if (flight) preparationTime = targetTimeAt(flight, sceneryTime(performance.now()));
  if (tutorial === 'flight') tutorial = 'launch';
  flight = null;
  finish = null;
  returnTrip = null;
  returnPose = null;
  mode = 'prepare';
  visibleRewards = availableRewards(progress);
  wigQueued = false;
  clearGesture();
  effects = [];
  particles.clear();
  result.hidden = true;
  toast.hidden = true;
  resetCamera();
}

function resetGameProgress(): void {
  flight = null;
  horseDeparture = null;
  selected = null;
  selectedType = 'powder-charge';
  preparationTime = 0;
  view.zoom = initialZoom;
  trailVisible = true;
  Object.assign(progress, startingProgress());
  Object.assign(setup, startingSetup());
  startTutorial();
  saveProgress(progress, progressKey);
  debugPanel?.reset();
  returnToStart();
}

function finishTutorial(): void {
  if (!tutorial) return;
  const restoreSetup = guidingSetup();
  tutorial = null;
  progress.tutorialSeen = true;
  saveProgress(progress, progressKey);
  if (restoreSetup) {
    Object.assign(setup, startingSetup());
    clearGesture();
    selected = null;
    resetCamera();
  } else updateControls();
}
bindTap(tutorialView.skip, finishTutorial);
bindTap(tutorialView.confirm, finishTutorial);

function bindSettings(): void {
  const options = element('settings-options');
  const confirmation = element('reset-confirmation');
  const requestReset = element('request-reset');
  const cancelReset = element('cancel-reset');

  function showConfirmation(show: boolean): void {
    options.hidden = show;
    confirmation.hidden = !show;
    settingsDialog.setAttribute('aria-labelledby', show ? 'reset-title' : 'settings-title');
    if (show) settingsDialog.setAttribute('aria-describedby', 'reset-description');
    else settingsDialog.removeAttribute('aria-describedby');
    if (settingsDialog.open) (show ? cancelReset : requestReset).focus();
  }

  for (const channel of ['music', 'effects'] as const) {
    const slider = element<HTMLInputElement>(`${channel}-volume`);
    const level = element<HTMLOutputElement>(`${channel}-level`);
    const showVolume = () => {
      level.value = `${slider.value}%`;
      slider.setAttribute('aria-valuetext', level.value);
    };
    slider.value = String(Math.round(audio.volume(channel) * 100));
    showVolume();
    slider.addEventListener('input', () => {
      audio.setVolume(channel, slider.valueAsNumber / 100);
      showVolume();
    });
  }

  const toggleAudio = () => { audio.toggle(); updateSoundButton(); };
  bindTap(soundButton, toggleAudio);
  bindTap(settingsMute, toggleAudio);
  updateSoundButton();

  bindTap(element('open-settings'), () => {
    showConfirmation(false);
    settingsDialog.showModal();
  });
  bindTap(element('close-settings'), () => settingsDialog.close());
  bindTap(requestReset, () => showConfirmation(true));
  bindTap(cancelReset, () => showConfirmation(false));
  bindTap(element('confirm-reset'), () => {
    resetGameProgress();
    settingsDialog.close();
    notification('Progress reset. Ready to launch!', performance.now());
  });
  settingsDialog.addEventListener('cancel', (event) => {
    if (confirmation.hidden) return;
    event.preventDefault();
    showConfirmation(false);
  });
}

function requestWig(): void {
  if (mode !== 'flight' || !flight || !progress.unlocked.wig || flight.wigUsed) return;
  wigQueued = true;
  updateControls();
}

bindTap(launchButton, play);
bindTap(homeButton, () => {
  if (mode === 'flight' && freeCamera) resetCamera();
  else returnToStart();
});
bindTap(wigButton, requestWig);
bindTap(retryButton, returnToStart);
bindSettings();
document.addEventListener('keydown', (event) => {
  if (settingsDialog.open || tutorialView.rewardDialog.open || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') { returnToStart(); return; }
  if (event.target instanceof HTMLElement && event.target.matches('button, select, input, [role="button"]')) return;
  if (event.code === 'Space' && mode !== 'flight') {
    event.preventDefault();
    if (mode === 'result') returnToStart();
    else play();
  } else if (event.code === 'KeyW') requestWig();
  else if (event.key === 'Delete' && selected) removeCharge(selected);
  else if (event.key === '+' || event.key === '=') zoom(1.25);
  else if (event.key === '-') zoom(0.8);
});

function simulate(elapsed: number, now: number): void {
  if (mode !== 'flight' || !flight || tutorialView.rewardDialog.open) return;
  accumulator += elapsed * flightSpeed;
  while (accumulator >= step && mode === 'flight' && !tutorialView.rewardDialog.open) {
    accumulator -= step;
    const from = flight.position;
    const cloudHits = flight.clouds.size;
    const events = advance(flight, visibleRewards, wigQueued);
    if (flight.clouds.size > cloudHits) {
      audio.play('cloud');
      particles.burst('cloud', flight.position, now);
    }
    wigQueued = false;
    for (const event of events) {
      if (event.type === 'reward') {
        audio.play('reward');
        const { type } = event.reward;
        visibleRewards.delete(type);
        if (!claim(progress, event.reward)) continue;
        if (tutorial === 'flight' && type === 'powder-charge') {
          tutorial = 'reward';
          progress.tutorialSeen = true;
          accumulator = 0;
          clearGesture();
        } else notification(isUnlock(type) ? `${rewardNames[type]} unlocked!` : `+1 ${rewardNames[type]}`, now);
        saveProgress(progress, progressKey);
        effects.push({ sprite: 'reward-pop', point: event.point, since: now, duration: 520, size: 40 });
        particles.burst('reward', event.point, now, event.reward.color);
        updateControls();
      } else {
        if (event.type === 'wig') wigAt = now;
        audio.play(event.type);
        effects.push({ sprite: event.type === 'wig' ? 'wig-burst' : 'sparks', point: event.point, since: now, duration: 520, size: 38 });
        particles.burst(event.type, event.point, now);
      }
    }
    debugPanel?.step(flight, from);
    if (flight.outcome) complete(flight, now);
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!ctx || !mapCtx || !assetsReady) return;
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
  lastFrame = now;
  if (mode === 'prepare') preparationTime += elapsed;
  simulate(elapsed, now);
  const flying = mode === 'flight' && !tutorialView.rewardDialog.open ? flight : null;
  audio.setFlightSpeed(flying ? Math.hypot(flying.velocity.x, flying.velocity.y) : null);
  if (flying) particles.wake(flying.position, flying.velocity, now);
  if (returnTrip) {
    const wasMoving = !!returnPose?.travel;
    returnPose = returnAt(returnTrip, now);
    if (returnPose.kind === 'ride' && returnPose.travel > 0) {
      if (!wasMoving) audio.play(returnPose.deer ? 'deer' : 'horse');
      if (returnPose.bounce < 1.25) particles.hooves(returnPose.position, returnPose.direction, now);
    }
    if (returnPose.travel === 1) {
      if (returnPose.kind === 'ride' && !returnPose.deer) {
        horseDeparture = { x: returnTrip.to.x, since: now, direction: returnTrip.direction };
      }
      returnToStart();
    }
  }
  if (!freeCamera && mode !== 'prepare') focusBaron(false, elapsed);
  if (finish && returnTrip?.kind !== 'hop' && result.hidden && now - finish.since > (finish.moonSplit ? 1450 : 680)) result.hidden = false;
  if (!toast.hidden && now >= toastUntil) toast.hidden = true;
  if (now >= nextHud) { nextHud = now + 80; updateHud(); }
  // Limit idle redraws while keeping placement and camera movement responsive.
  if (!dirty && mode === 'prepare' && now - lastPaint < 1000 / 30 - 1) return;
  lastPaint = now;
  dirty = false;
  effects = effects.filter((effect) => now - effect.since < effect.duration);

  const animationTime = sceneryTime(now);
  const targetTime = flight ? targetTimeAt(flight, animationTime) : preparationTime;
  const launchVector = mode === 'prepare' ? impulse(setup) : { x: 0, y: 0 };
  const horizontalSpeed = flight?.velocity.x ?? launchVector.x;
  const moonAge = finish?.moon ? now - finish.since : Infinity;
  const rider = returnPose?.kind === 'ride' ? returnPose : null;
  const scene: Scene = {
    setup, position: currentPosition(), mode, targetTime, now, visibleRewards,
    baron: {
      facing: returnPose && returnPose.travel > 0 ? returnPose.direction : horizontalSpeed < -1e-6 ? -1 : 1,
      verticalSpeed: mode === 'flight' ? flight?.velocity.y ?? 0 : 0,
      launchAge: mode === 'flight' ? now - launchAt : Infinity,
      wigAge: mode === 'flight' ? now - wigAt : Infinity,
      landingAge: finish && !finish.moon ? now - finish.since : Infinity,
      moonAge,
      hop: returnPose?.kind === 'hop' ? returnPose.lift : 0,
      mounted: rider?.mounted ?? 0,
      stride: rider?.stride ?? 0,
    },
    lunar: {
      hits: progress.moonHits, crackAngle: progress.moonCrackAngle,
      crackAge: progress.moonHits === 1 ? moonAge : Infinity,
      splitAge: finish?.moonSplit ? moonAge : Infinity,
    },
    animationTime, duckHits: flight?.ducks ?? null,
    cloudHits: flight?.clouds ?? null,
    lastPath: trailVisible && mode !== 'result' ? progress.lastPath : [], currentPath: flight?.path ?? [],
    effects, particles, selected, ghost, tutorialTarget: tutorialTarget(), launchVector, ride: rider, horseDeparture,
  };
  ctx.setTransform(canvas.width / view.width, 0, 0, canvas.height / view.height, 0, 0);
  paint(ctx, atlas, view, scene);
  paintMinimap(mapCtx, view, scene, minimap.width, minimap.height);
}

if (ctx && mapCtx) {
  new ResizeObserver(([entry]) => {
    if (!entry || !entry.contentRect.width || !entry.contentRect.height) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    view.width = entry.contentRect.width;
    view.height = entry.contentRect.height;
    canvas.width = Math.ceil(view.width * ratio);
    canvas.height = Math.ceil(view.height * ratio);
    const scale = view.zoom / initialZoom;
    initialZoom = Math.min(view.width / 320, view.height / 194);
    view.zoom = initialZoom * scale;
    if (!freeCamera && mode === 'prepare' && scale === 1) centerStartView();
    if (tutorial) updateTutorial();
    dirty = true;
  }).observe(canvas);
  atlas.addEventListener('load', () => { assetsReady = true; updateControls(); }, { once: true });
  atlas.addEventListener('error', () => { element('load-error').hidden = false; }, { once: true });
  atlas.src = gameAtlasUrl;
  updateControls();
  requestAnimationFrame(frame);
} else element('load-error').hidden = false;

if (import.meta.env.MODE !== 'release' && debugMode) {
  void import('./debug').then(({ mountDebug }) => {
    debugPanel = mountDebug({
      inventory: progress,
      unlockAll() {
        for (const type of chargeTypes) progress.counts[type] = chargeLimit;
        Object.assign(progress.unlocked, { wig: true, mortar: true, cannon: true });
        visibleRewards = availableRewards(progress);
        saveProgress(progress, progressKey);
        updateControls();
      },
      apply(plan) {
        Object.assign(setup, plan);
        selected = null;
        clearGesture();
        resetCamera();
      },
      launch() {
        play();
        canvas.scrollIntoView({ block: 'nearest' });
      },
      report(message) { notification(message, performance.now()); },
    });
    updateControls();
  });
}
