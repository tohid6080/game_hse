import { vibrate, type HapticKind } from '@/platform/haptics';
import { useSettingsStore } from '@/state/settingsStore';
import { playSound, type SoundKind } from './sounds';

/** What just happened, in game terms; each maps to a sound and a vibration. */
export type FeedbackKind = 'correct' | 'shield' | 'found' | 'complete' | 'levelUp' | 'medal' | 'preview';

const SOUND: Record<FeedbackKind, SoundKind> = {
  correct: 'correct',
  shield: 'shield',
  found: 'found',
  complete: 'complete',
  levelUp: 'levelUp',
  medal: 'medal',
  preview: 'preview',
};

const HAPTIC: Record<FeedbackKind, HapticKind> = {
  correct: 'success',
  shield: 'heavy',
  found: 'success',
  complete: 'success',
  levelUp: 'success',
  medal: 'success',
  preview: 'tap',
};

/** Plays the sound and/or vibration for `kind`, as far as the player's settings allow. Never throws. */
export function feedback(kind: FeedbackKind): void {
  const { soundEnabled, hapticsEnabled } = useSettingsStore.getState();
  if (soundEnabled) playSound(SOUND[kind]);
  if (hapticsEnabled) void vibrate(HAPTIC[kind]);
}
