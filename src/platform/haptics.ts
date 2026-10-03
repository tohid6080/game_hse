import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './native';

export type HapticKind = 'tap' | 'success' | 'warning' | 'heavy';

const WEB_PATTERN: Record<HapticKind, number | number[]> = {
  tap: 10,
  success: [12, 40, 12],
  warning: [30, 50, 30],
  heavy: 60,
};

/**
 * One short vibration. Never throws and never blocks: haptics are decoration. In a browser it falls
 * back to `navigator.vibrate`, but only after the user has interacted (otherwise Chrome logs an
 * intervention warning).
 */
export async function vibrate(kind: HapticKind): Promise<void> {
  try {
    if (isNative()) {
      if (kind === 'tap') await Haptics.impact({ style: ImpactStyle.Light });
      else if (kind === 'heavy') await Haptics.impact({ style: ImpactStyle.Heavy });
      else await Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning });
      return;
    }
    if (typeof navigator.vibrate === 'function' && navigator.userActivation?.hasBeenActive) {
      navigator.vibrate(WEB_PATTERN[kind]);
    }
  } catch {
    // Unsupported device or revoked permission: nothing to do.
  }
}
