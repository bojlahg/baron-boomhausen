import { badge, inventoryArt } from './render';
import type { Point } from './world';

export type TutorialStep = 'move' | 'charges' | 'launch' | 'flight' | 'reward';

export function mountTutorial() {
  const panel = document.querySelector<HTMLElement>('#tutorial')!;
  const copy = document.querySelector<HTMLParagraphElement>('#tutorial-copy')!;
  const rewardDialog = document.querySelector<HTMLDialogElement>('#tutorial-reward')!;
  const rewardCopy = document.querySelector<HTMLParagraphElement>('#tutorial-reward-copy')!;
  const rewardIcon = document.querySelector<HTMLElement>('#tutorial-reward-icon')!;
  const confirm = document.querySelector<HTMLButtonElement>('#confirm-tutorial-reward')!;
  const pointer = document.querySelector<HTMLElement>('#tutorial-pointer')!;
  const skip = document.querySelector<HTMLButtonElement>('#skip-tutorial')!;
  const playfield = panel.parentElement!;
  pointer.append(badge('tutorial-hand', 54));
  rewardIcon.append(inventoryArt('powder-charge'));
  rewardDialog.addEventListener('cancel', (event) => event.preventDefault());
  rewardDialog.addEventListener('click', (event) => {
    if (event.target === rewardDialog) confirm.focus();
  });

  function show(step: TutorialStep | null, placed: number, available: number): void {
    panel.hidden = step === null || step === 'reward';
    panel.dataset.step = step ?? '';
    if (step === 'reward') {
      if (!rewardDialog.open) {
        rewardCopy.textContent = `You now have ${available} Powder Charges for future launches.`;
        rewardDialog.showModal();
      }
      return;
    }
    if (rewardDialog.open) rewardDialog.close();
    const text = step === 'move' ? 'Drag the Baron to the glowing circle.'
      : step === 'charges' ? `Drag a Powder Charge from the tray to the glowing slot. ${placed} of 3 placed.`
      : step === 'launch' ? 'Press BOOM! to launch the Baron toward the first gift.'
      : step === 'flight' ? 'Fly into the gift box to collect the charge.'
      : '';
    if (copy.textContent !== text) copy.textContent = text;
  }

  function point(from: Point | null, to = from): void {
    pointer.hidden = !from;
    if (!from || !to) return;
    const bounds = playfield.getBoundingClientRect();
    pointer.style.setProperty('--from-x', `${from.x - bounds.left}px`);
    pointer.style.setProperty('--from-y', `${from.y - bounds.top}px`);
    pointer.style.setProperty('--to-x', `${to.x - bounds.left}px`);
    pointer.style.setProperty('--to-y', `${to.y - bounds.top}px`);
  }

  return { show, point, skip, rewardDialog, confirm };
}
