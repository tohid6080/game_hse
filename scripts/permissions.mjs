/**
 * The only Android permissions HSE Quest may end up with. They come from Capacitor plugins (the app
 * declares none of its own) and every one is a decision: adding a line means adding its reason here
 * AND in docs/DECISIONS.md. Used by `verify:offline` (plugin manifests, before any build) and by
 * `verify:merged` (the merged manifest of a real build).
 */
export const ALLOWED_PERMISSIONS = {
  'android.permission.VIBRATE': '@capacitor/haptics — vibration feedback (a normal permission, no prompt)',
  'android.permission.POST_NOTIFICATIONS': '@capacitor/local-notifications — daily reminder (asked at runtime, only when the player turns it on)',
  'android.permission.RECEIVE_BOOT_COMPLETED': '@capacitor/local-notifications — restores a scheduled reminder after a reboot',
  'android.permission.WAKE_LOCK': '@capacitor/local-notifications — lets the alarm deliver the notification',
};

/** Permissions that must never appear, with the reason, so the failure message can say why. */
export const FORBIDDEN_PERMISSIONS = {
  'android.permission.INTERNET': 'the app is fully offline',
  'android.permission.ACCESS_NETWORK_STATE': 'the app is fully offline',
  'android.permission.ACCESS_WIFI_STATE': 'the app is fully offline',
  'android.permission.SCHEDULE_EXACT_ALARM': 'the reminder does not need an exact time (removed with tools:node="remove")',
  'android.permission.USE_EXACT_ALARM': 'the reminder does not need an exact time',
};
