import { create } from 'zustand';
import { newId } from '@/lib/id';
import type { ProfileRow } from '@/storage/db';
import { repos, type NewProfile, type ProfilePatch } from '@/storage/repositories';

interface ProfileState {
  loaded: boolean;
  profiles: ProfileRow[];
  activeId: string | null;
  /** Local storage failed this session: profiles live in memory only until the app closes. */
  storageError: boolean;
  load: () => Promise<void>;
  create: (input: NewProfile) => Promise<ProfileRow>;
  update: (id: string, patch: ProfilePatch) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function selectActiveProfile(state: Pick<ProfileState, 'profiles' | 'activeId'>): ProfileRow | null {
  return state.profiles.find((profile) => profile.id === state.activeId) ?? null;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  loaded: false,
  profiles: [],
  activeId: null,
  storageError: false,

  async load() {
    try {
      const [profiles, storedActive] = await Promise.all([
        repos().profiles.list(),
        repos().settings.get('activeProfileId'),
      ]);
      // A dangling or missing pointer falls back to the first profile (and is repaired in storage).
      const activeId = profiles.some((p) => p.id === storedActive) ? storedActive! : (profiles[0]?.id ?? null);
      set({ profiles, activeId, loaded: true });
      if (activeId !== storedActive) await repos().settings.set('activeProfileId', activeId);
    } catch {
      set({ loaded: true, storageError: true });
    }
  },

  async create(input) {
    let row: ProfileRow;
    try {
      row = await repos().profiles.create(input);
      await repos().settings.set('activeProfileId', row.id);
    } catch {
      // Keep the app usable for this session even though nothing can be saved.
      const now = Date.now();
      row = { id: newId(), createdAt: now, updatedAt: now, ...input };
      set({ storageError: true });
    }
    set((state) => ({ profiles: [...state.profiles, row], activeId: row.id }));
    return row;
  },

  async update(id, patch) {
    try {
      const updated = await repos().profiles.update(id, patch);
      if (!updated) return;
      set((state) => ({ profiles: state.profiles.map((p) => (p.id === id ? updated : p)) }));
    } catch {
      set((state) => ({
        storageError: true,
        profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
      }));
    }
  },

  async setActive(id) {
    if (!get().profiles.some((p) => p.id === id)) return;
    set({ activeId: id });
    try {
      await repos().settings.set('activeProfileId', id);
    } catch {
      set({ storageError: true });
    }
  },

  async remove(id) {
    try {
      await repos().profiles.delete(id);
    } catch {
      set({ storageError: true });
    }
    const remaining = get().profiles.filter((p) => p.id !== id);
    const nextActive = get().activeId === id ? (remaining[0]?.id ?? null) : get().activeId;
    set({ profiles: remaining, activeId: nextActive });
    try {
      await repos().settings.set('activeProfileId', nextActive);
    } catch {
      set({ storageError: true });
    }
  },
}));
