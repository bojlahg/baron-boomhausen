export type MusicVoice = 'lead' | 'bass' | 'pluck';
export type AudioChannel = 'music' | 'effects';

export interface MusicNote {
  at: number;
  length: number;
  pitch: number;
  voice: MusicVoice;
}

export interface MusicScore {
  duration: number;
  notes: MusicNote[];
}

export type SoundCue = 'place' | 'launch' | 'reward' | 'duck' | 'cloud' | 'wig' | 'landing' | 'horse' | 'deer' | 'record' | 'moon';
