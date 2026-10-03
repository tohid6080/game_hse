import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './native';

export type ExportResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Hands a text file to the user. In the Android app it is written to the app's private cache (no
 * storage permission needed) and offered through the system share sheet; in a browser it is a plain
 * download. The file never leaves the device unless the user picks a destination.
 */
export async function saveAndShareFile(name: string, text: string, shareTitle: string): Promise<ExportResult> {
  if (isNative()) {
    try {
      const written = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: shareTitle, dialogTitle: shareTitle, files: [written.uri] });
      return 'shared';
    } catch (error) {
      return /cancel/i.test(error instanceof Error ? error.message : String(error)) ? 'cancelled' : 'failed';
    }
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
