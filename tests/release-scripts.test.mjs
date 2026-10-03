import { describe, expect, it } from 'vitest';
import { checkMergedManifest } from '../scripts/merged-manifest.mjs';
import { versionCodeOf, withVersion } from '../scripts/sync-version.mjs';

/** A merged manifest shaped like the one Gradle produces for this app (permissions as of Phase 3). */
function manifest({ permissions = [], application = 'android:allowBackup="false" android:usesCleartextTraffic="false"', extra = '' } = {}) {
  const uses = permissions.map((name) => `<uses-permission android:name="${name}" />`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.hsequest.separ" android:versionCode="1">
  ${uses}
  <permission android:name="app.hsequest.separ.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
  <application ${application}>
    <activity android:name="app.hsequest.separ.MainActivity" android:exported="true" />
    <receiver android:name="com.capacitorjs.plugins.localnotifications.LocalNotificationRestoreReceiver" android:exported="true" />
    <provider android:name="androidx.core.content.FileProvider" android:exported="false" />
    ${extra}
  </application>
</manifest>`;
}

const GOOD = [
  'android.permission.VIBRATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'app.hsequest.separ.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
];

describe('checkMergedManifest', () => {
  it('accepts the permissions this app is meant to have, and the one AndroidX adds under the app id', () => {
    const { problems, notes } = checkMergedManifest(manifest({ permissions: GOOD }));
    expect(problems).toEqual([]);
    expect(notes.join('\n')).toContain('VIBRATE');
    expect(notes.join('\n')).toContain('exported components: activity app.hsequest.separ.MainActivity; receiver');
  });

  it('refuses the internet permission, whoever added it', () => {
    const { problems } = checkMergedManifest(manifest({ permissions: [...GOOD, 'android.permission.INTERNET'] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('android.permission.INTERNET');
    expect(problems[0]).toContain('fully offline');
  });

  it('refuses network-state and exact-alarm permissions', () => {
    const { problems } = checkMergedManifest(
      manifest({ permissions: [...GOOD, 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.SCHEDULE_EXACT_ALARM'] }),
    );
    expect(problems).toHaveLength(2);
  });

  it('refuses a permission nobody decided on', () => {
    const { problems } = checkMergedManifest(manifest({ permissions: [...GOOD, 'android.permission.CAMERA'] }));
    expect(problems).toEqual(['permission android.permission.CAMERA is not on the allowlist (scripts/permissions.mjs).']);
  });

  it("does not wave through another app's signature permission", () => {
    const { problems } = checkMergedManifest(manifest({ permissions: ['com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'] }));
    expect(problems).toHaveLength(1);
  });

  it('requires backups and cleartext traffic to be off', () => {
    const { problems } = checkMergedManifest(manifest({ permissions: GOOD, application: 'android:allowBackup="true"' }));
    expect(problems).toHaveLength(2);
  });

  it('refuses a debuggable release build, but only when asked to check a release', () => {
    const debuggable = manifest({ permissions: GOOD, application: 'android:allowBackup="false" android:usesCleartextTraffic="false" android:debuggable="true"' });
    expect(checkMergedManifest(debuggable).problems).toEqual([]);
    expect(checkMergedManifest(debuggable, { release: true }).problems).toEqual(['a release build must not be debuggable.']);
  });

  it('ignores a forbidden permission that is only mentioned in a comment', () => {
    const xml = manifest({ permissions: GOOD }).replace('<application', '<!-- <uses-permission android:name="android.permission.INTERNET" /> --><application');
    expect(checkMergedManifest(xml).problems).toEqual([]);
  });

  it('says so when the file is not a manifest', () => {
    expect(checkMergedManifest('<html></html>').problems).toHaveLength(1);
  });
});

describe('version scheme', () => {
  it('derives the versionCode from the version, growing with every release', () => {
    expect(versionCodeOf('0.0.1')).toBe(1);
    expect(versionCodeOf('0.9.0')).toBe(900);
    expect(versionCodeOf('1.0.0')).toBe(10000);
    expect(versionCodeOf('1.2.3')).toBe(10203);
    expect(versionCodeOf('1.2.3-beta.1')).toBe(10203);
    expect(versionCodeOf('1.10.0')).toBeGreaterThan(versionCodeOf('1.9.99'));
  });

  it('rejects what it cannot order safely', () => {
    expect(() => versionCodeOf('1.0')).toThrow();
    expect(() => versionCodeOf('1.100.0')).toThrow();
    expect(() => versionCodeOf('1.0.100')).toThrow();
  });

  it('rewrites the two version lines of build.gradle and nothing else', () => {
    const gradle = 'android {\n  defaultConfig {\n    versionCode 1\n    versionName "1.0"\n    other "x"\n  }\n}\n';
    expect(withVersion(gradle, '1.2.3')).toBe('android {\n  defaultConfig {\n    versionCode 10203\n    versionName "1.2.3"\n    other "x"\n  }\n}\n');
    expect(() => withVersion('no version here', '1.0.0')).toThrow();
  });
});
