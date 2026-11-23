import { sequence, silence, slowcat } from '@strudel/core/pattern.mjs';
import type { MusicNote, MusicScore, MusicVoice } from './audio-types';

const tempo = 116;
const barLength = 4 * 60 / tempo;

// An eight-bar march. Pitches are MIDI notes, with null marking a rest.
const march = {
  lead: [
    [72, null, 76, 79, 81, 79, 76, null],
    [74, 77, 81, null, 79, 77, 74, null],
    [72, null, 76, 79, 84, 83, 79, null],
    [74, 77, 79, 77, 74, 71, null, null],
    [69, 72, 76, null, 81, 79, 76, null],
    [77, null, 81, 84, 81, 77, 76, null],
    [74, 77, 79, null, 83, 81, 79, 77],
    [76, 74, 72, null, 67, null, 72, null],
  ],
  bass: [
    [48, 55, 48, 55], [50, 57, 50, 57], [48, 55, 52, 55], [43, 50, 43, 50],
    [45, 52, 45, 52], [41, 48, 41, 48], [43, 50, 47, 50], [48, 55, 48, null],
  ],
  pluck: [
    [null, 60, null, 64, null, 67, null, 64],
    [null, 62, null, 65, null, 69, null, 65],
    [null, 60, null, 64, null, 67, null, 72],
    [null, 59, null, 62, null, 65, null, 67],
    [null, 57, null, 60, null, 64, null, 60],
    [null, 57, null, 60, null, 65, null, 60],
    [null, 59, null, 62, null, 65, null, 67],
    [null, 60, null, 64, null, 67, null, null],
  ],
} satisfies Record<MusicVoice, (number | null)[][]>;

export function buildScore(): MusicScore {
  const notes: MusicNote[] = [];
  for (const voice of ['lead', 'bass', 'pluck'] as const) {
    const bars = march[voice];
    const pattern = slowcat(...bars.map((bar) => sequence(...bar.map((pitch) => pitch ?? silence))));
    for (const event of pattern.queryArc(0, bars.length)) {
      notes.push({
        at: Number((Number(event.whole.begin) * barLength).toFixed(4)),
        length: Number((Number(event.duration) * barLength).toFixed(4)),
        pitch: event.value,
        voice,
      });
    }
  }
  notes.sort((a, b) => a.at - b.at);
  return { duration: march.lead.length * barLength, notes };
}
