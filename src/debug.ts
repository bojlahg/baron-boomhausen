import './debug.css';
import { buildShot, reachedTarget } from './shot-bot';
import type { ShotTarget } from './shot-bot';
import type { Flight } from './flight';
import { isUnlock, startingProgress } from './progress';
import type { Progress } from './progress';
import { ballRadius, chargeLimit, map, rewardFor, rewardNames, rewardRoutes } from './world';
import type { Point, Reward, Setup } from './world';

interface DebugGame {
  inventory: Pick<Progress, 'counts' | 'unlocked'>;
  unlockAll(): void;
  apply(setup: Setup): void;
  launch(): void;
  report(message: string): void;
}

export interface DebugPanel {
  setReady(ready: boolean): void;
  startFlight(): Reward | undefined;
  step(flight: Flight, from: Point): void;
  stopFlight(): void;
  reset(): void;
}

function targetName(target: ShotTarget): string {
  if (target.kind === 'moon') return 'the Moon';
  if (target.kind === 'reward') {
    const { type, slot } = target.reward;
    return isUnlock(type) ? rewardNames[type] : `${rewardNames[type]} #${slot + 1}`;
  }
  return `(${target.point.x}, ${target.point.y})`;
}

export function mountDebug(game: DebugGame): DebugPanel {
  const panel = document.createElement('section');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-labelledby', 'debug-title');
  panel.innerHTML = `
    <h2 id="debug-title">Debug</h2>
    <div class="debug-tools">
      <button id="debug-unlock" class="action" type="button">Unlock Everything</button>
      <label>Target <select id="debug-target"><option value="moon">Moon</option></select></label>
      <label id="debug-stage-control" hidden>Reward Stage <select id="debug-stage"><option value="">Next</option></select></label>
      <div id="debug-point" class="debug-tools" hidden>
        <label>X <input id="debug-x" type="number" min="${map.left}" max="${map.right}" value="850" step="any" required></label>
        <label>Y <input id="debug-y" type="number" min="${ballRadius}" max="${map.top}" value="600" step="any" required></label>
      </div>
      <button id="debug-build" class="action" type="button">Build Setup</button>
      <button id="debug-run" class="action" type="button">Run Bot</button>
    </div>
    <p id="debug-status" role="status">Debug progress is saved separately.</p>`;
  document.querySelector('.app')!.append(panel);

  const targetSelect = panel.querySelector<HTMLSelectElement>('#debug-target')!;
  const stageControl = panel.querySelector<HTMLElement>('#debug-stage-control')!;
  const stageSelect = panel.querySelector<HTMLSelectElement>('#debug-stage')!;
  const pointInputs = panel.querySelector<HTMLElement>('#debug-point')!;
  const x = panel.querySelector<HTMLInputElement>('#debug-x')!;
  const y = panel.querySelector<HTMLInputElement>('#debug-y')!;
  const status = panel.querySelector<HTMLElement>('#debug-status')!;
  const unlock = panel.querySelector<HTMLButtonElement>('#debug-unlock')!;
  const build = panel.querySelector<HTMLButtonElement>('#debug-build')!;
  const run = panel.querySelector<HTMLButtonElement>('#debug-run')!;
  for (const { type } of rewardRoutes) targetSelect.add(new Option(rewardNames[type], type));
  for (let stage = 1; stage <= chargeLimit; stage++) stageSelect.add(new Option(String(stage), String(stage)));
  targetSelect.add(new Option('Custom Point', 'point'));
  const startingCounts = startingProgress().counts;

  let planned: ShotTarget | null = null;
  let inFlight: ShotTarget | null = null;

  function readTarget(): ShotTarget | null {
    if (targetSelect.value === 'moon') return { kind: 'moon' };
    if (targetSelect.value === 'point') {
      if (!x.reportValidity() || !y.reportValidity()) return null;
      return { kind: 'point', point: { x: x.valueAsNumber, y: y.valueAsNumber } };
    }
    const route = rewardRoutes.find(({ type }) => type === targetSelect.value);
    if (!route) return null;
    const { type } = route;
    let slot = 0;
    if (!isUnlock(type)) {
      const count = game.inventory.counts[type];
      slot = stageSelect.value ? Number(stageSelect.value) - 1 : count < chargeLimit ? count : startingCounts[type];
    }
    const reward = rewardFor(route, slot);
    return reward ? { kind: 'reward', reward } : null;
  }

  function buildSelected(): boolean {
    const target = readTarget();
    if (!target) return false;
    const setup = buildShot(target, game.inventory);
    if (!setup) {
      status.textContent = 'No setup found with the current inventory. Try Unlock Everything or another target.';
      return false;
    }
    planned = target;
    game.apply(setup);
    status.textContent = `Setup verified for ${targetName(target)} · ${setup.charges.length} charges. Press BOOM! to fly.`;
    return true;
  }

  targetSelect.addEventListener('change', () => {
    pointInputs.hidden = targetSelect.value !== 'point';
    stageSelect.value = '';
    stageControl.hidden = !rewardRoutes.some(({ type }) => type === targetSelect.value && !isUnlock(type));
  });
  panel.addEventListener('change', () => { planned = null; });
  unlock.addEventListener('click', () => {
    game.unlockAll();
    status.textContent = 'All charge types, launchers and the wig are unlocked.';
  });
  build.addEventListener('click', buildSelected);
  run.addEventListener('click', () => { if (buildSelected()) game.launch(); });

  return {
    setReady(ready) {
      for (const control of [targetSelect, stageSelect, x, y, unlock, build, run]) control.disabled = !ready;
    },
    startFlight() {
      inFlight = planned;
      planned = null;
      if (inFlight) status.textContent = `Flying to ${targetName(inFlight)}…`;
      return inFlight?.kind === 'reward' ? inFlight.reward : undefined;
    },
    step(flight, from) {
      if (!inFlight) return;
      if (reachedTarget(inFlight, flight, from)) {
        const message = `Reached ${targetName(inFlight)}.`;
        status.textContent = message;
        game.report(message);
        inFlight = null;
      } else if (flight.outcome) {
        status.textContent = `Missed ${targetName(inFlight)}.`;
        inFlight = null;
      }
    },
    stopFlight() {
      if (inFlight) status.textContent = 'Flight stopped.';
      inFlight = null;
    },
    reset() {
      planned = null;
      inFlight = null;
      stageSelect.value = '';
      status.textContent = 'Debug progress is saved separately.';
    },
  };
}
