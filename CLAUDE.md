# CLAUDE.md

## Project

HSE Quest (working name: **سپر / Separ** — brand is not final) — a standalone, fully offline
mobile-first game app that turns HSE (health, safety, environment) skills into short, interactive
games. React + TypeScript + Capacitor (Android). UI is Persian (fa) and RTL in v1; the architecture
is ready for English later.

**This project is completely independent from IHMS.** Do not import, copy, or reference IHMS code,
Supabase, its sync engine, its keystore, its `appId`, or its conventions.

## Hard rules (enforced by tooling — don't work around them)

- **No network, ever.** No `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`sendBeacon`, no external
  URLs, no CDN fonts/scripts, no analytics/crash/backend SDKs. ESLint (`no-restricted-globals`) and
  `npm run verify:offline` both fail on this. Content is bundled JSON imported as modules.
- **No network permission, nothing sensitive.** `AndroidManifest.xml` declares no permission of its own,
  `allowBackup="false"`, no cleartext. The only permissions in the merged app come from Capacitor plugins and are
  allow-listed with their reason in `scripts/permissions.mjs` (read by `verify:offline` check 7 and by `verify:merged`): `VIBRATE`, `POST_NOTIFICATIONS`,
  `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`. `SCHEDULE_EXACT_ALARM` (declared by the reminder plugin) is removed with
  `tools:node="remove"`. A new plugin or permission means editing that allowlist on purpose and documenting why in
  `docs/DECISIONS.md`; `INTERNET` can never be added this way.
- **Local-only data.** Everything lives in IndexedDB (Dexie); the app never sends anything anywhere. The *source* is on
  GitHub, in the **public** repo `tohid6080/game_hse`, by the owner's explicit decision on 2026-10-03 (until then it was
  local-only). Do not add other remotes or publish it elsewhere without the owner's say-so; never commit secrets,
  keystores or anything exported from a player's device.
- **No secrets in the repo.** Keystores (`*.keystore`, `*.jks`) are git-ignored; the release signing config reads
  its keystore from outside the repo (`HSEQUEST_KEYSTORE_PROPERTIES`, see `docs/RELEASE.md`).
- **Content is not released unreviewed.** `reviewStatus: 'reviewed'` only ever comes from `npm run content:apply`
  (which records the reviewer's name and date); never hand-edit it. `npm run verify:release` fails while anything is a draft.

## Commands

Node >= 22, JDK 21 (Capacitor 8), npm.

```bash
npm install
npm run dev              # Vite dev server
npm run check            # typecheck + lint + tests + offline guard + version sync  ← run before finishing a task
npm run e2e              # build + real-Chromium playthrough of everything, incl. axe-core and large text (196 checks); needs a Chromium
npm run perf             # build + startup/navigation timings under 4x/6x CPU throttle
npm run verify:merged    # after a real Android build: check the merged manifest that ships
npm run verify:release   # content gate: fails while any item is a draft (--allow-draft for a beta)
npm run content:export   # review sheets for the HSE expert → review-sheets/ ; content:apply -- <csv> --reviewer "…" [--write]
npm run build            # tsc -b && vite build -> dist/
npm run verify:offline -- --require-dist   # offline guard incl. built CSP
npm run cap:sync         # build + guard + sync into android/
npm run cap:open         # open android/ in Android Studio (or let GitHub Actions build the APK, see below)
```

The debug APK is built by `.github/workflows/build-android.yml` (every push to `main`, or run it by hand): check →
`cap:sync` → `gradlew assembleDebug` → `verify:merged` → artifact `hse-quest-debug-apk`. Its log is the only place the
real Gradle build and merged manifest are exercised (this sandbox has no Android SDK), so after a change that touches
`android/` or a Capacitor plugin, push and read the run (the GitHub MCP `actions_*` / `get_job_logs` tools work).

TypeScript is pinned to **6.0.x**: `typescript-eslint` does not support TS 7 yet.

## Layout (`src/`)

- `app/` shell, routes (`createHashRouter`: data router, needed for `useBlocker`; every screen but the shell and Home is `lazy`), bottom nav · `pages/` the 5 tabs · `ui/` design system (CSS Modules + tokens)
- `i18n/` flat type-safe keys (`messages/fa.ts` is the source of truth), `t()`, Intl number/Jalali formatting
- `domain/` pure logic — no React, no storage imports: levels/XP, `scoring`, `round` (the shared round
  state machine), `risk` (matrix + judging), `streak`, `daily`, `badges`, `radar`, `domains`, `topics`
- `games/` registry + shared game UI; each game gets its own folder with a pure engine and its UI.
  `games/shared/`: `finishRound` (the one place a round is saved: XP, daily bonus, medals), `RoundResult`,
  `ShieldMeter`, `DailyBadge`. `games/quiz/`, `games/risk/` (`RiskMatrix`, `ControlPyramid`),
  `games/hazard/` (`geometry`, `engine`, `PanZoomImage`, `HazardMarkers`) — each: pure `engine.ts` + hub/play/result
- `progress/` medal hexagons, medals view, radar chart + view (the Progress page's tabs) · `dev/` development-only tools (never in a release)
- `profile/` onboarding, profile form/manager, avatars, nickname validation
- `backup/` backup/restore UI (`BackupSection`, `RestoreControl`) · `reminders/` reminder service + settings section ·
  `feedback/` synthesised sounds, the sound+vibration switchboard (`feedback(kind)`), settings section
- `content/` zod schema (tests only, not bundled), `packs/<locale>/{quiz,risk,hazard}.json`, `scenes/*.webp`, loader.
  The loader only *casts* raw JSON, so the schema has **no defaults/transforms**: every field is written
  out in the pack and a test asserts `parse(pack)` equals the raw pack (this caught a real crash once)
- `storage/` Dexie schema + repositories (the only code touching tables) + `backup.ts` (file format, validation, merge planning) · `state/` zustand stores
- `platform/` Capacitor wrappers with web fallbacks: `native`, `haptics`, `reminders`, `fileExport` (never import plugins elsewhere)

## Conventions

- **Styling:** CSS Modules + CSS variables from `ui/tokens.css`. Use logical properties
  (`margin-inline-start`, `inset-inline-end`…) so RTL/LTR both work. No inline-style theming.
- **i18n:** never hardcode user-visible text in components — add a key to `i18n/messages/fa.ts`.
  Numbers shown to the player go through `formatNumber`/`t()` params (Persian digits). Dates are
  stored as timestamps and displayed with `formatDate` (Jalali).
- **Content:** items have stable, language-neutral ids; `reviewStatus: 'draft' | 'reviewed'`; a
  `reviewed` item must cite a reference. Validate with `npm test`. HSE accuracy matters — don't
  invent standard clauses; leave `references` empty and keep the item `draft` if unsure.
- **Progress is derived** from the append-only `attempts` log; never store totals as source of truth.
- **Engines are pure functions** (seedable RNG for the daily challenge) with unit tests.
- **Medals, streak, daily progress and the radar are derived too** (`domain/badges|streak|daily|radar`): no tables,
  recomputed from `attempts`; `finishRound` diffs medals before/after to report "new medal". Day streak ignores
  days after today. Daily missions count only when started from the Daily page (`?daily=1`), completed, and not
  yet counted that day — `finishRound` decides, the URL flag alone never does.
- **Find the Hazard hotspots are normalised** (x,y = fractions of width/height; radius = fraction of WIDTH).
  A scene is a `.webp` + an entry in `packs/<locale>/hazard.json`; see `docs/SCENES.md`. `site-01` is a placeholder crop.
- **Dev-only code** is registered behind `import.meta.env.DEV` and `verify:offline` fails if it appears in `dist/`.
- **Backups only ever add.** Restoring plans a merge (`planMerge`): known ids are skipped, a repeated nickname is
  renamed, nothing is replaced or deleted; the whole merge is one transaction. The checksum detects damage, it is not
  a signature. Files are validated by hand (zod is not in the bundle).
- **Reminders are re-planned, not repeated:** next 7 days, minus today once played (`domain/reminder.ts`), rebuilt on
  app start, resume, round end and any setting change (`syncReminders`). Off by default; Android app only.
- **Sound is synthesised (WebAudio, no files) and off by default; vibration is on.** Games call `feedback(kind)`,
  never the sound or haptics modules. Every animation is neutralised by the global reduced-motion rule in `ui/global.css`.
- **Accessibility is tested, not assumed.** The E2E runs axe-core and a 44px touch-target check on every screen it photographs,
  in dark and light, and checks 130%/200% text for sideways scroll and clipping. New screens: one `main`, one `h1` (use
  `className="sr-only"` for a visually hidden one), radiogroups are `div`s (not lists), no meaning by opacity alone,
  page-level grids use `grid-template-columns: minmax(0, 1fr)` so large text can shrink them.
- **Routes are lazy, so a bare "some element exists" wait in a test can match the screen being left.** Wait for something
  only the destination has (`playScreen()`, or `nav(...).click()` which waits for `aria-current`).
- **Timers stop in the background:** use `useQuestionTimer` (backed by `games/shared/stopwatch.ts`), never `performance.now()` deltas directly.
- **Find the Hazard can be played without touching the picture** (keys / on-screen arrows move an aiming mark; the
  geometry is `moveCursor`/`followCursor` in `games/hazard/geometry.ts`). Keep it working when changing `PanZoomImage`.
- **Version has one source:** `package.json`. `npm run cap:sync` writes it to `android/app/build.gradle`; never edit those two lines by hand.
- **Nothing is written mid-round.** A round is persisted once, at its end, in one transaction
  (`repos().rounds.record`: attempt + spaced-repetition stats). Leaving a round asks first (`useBlocker`).
- **Scoring/XP/Leitner constants live in `domain/`** (`scoring.ts`, `leitner.ts`, `levels.ts`) — tune them there only.
- **React hooks lint is strict** (react-hooks v7): no `Date.now()` in render, no setState directly in an
  effect body, no ref writes in render. Load data in a promise callback (see `QuizPlay`'s `loadRound`).
- **XP is read through `useActiveXp()`**, never straight from the store, so a profile switch can't show the old profile's XP.
- Code comments are in English; docs are in Persian.
- Dependencies: keep lean; defer a Capacitor plugin until the phase that uses it (each can add permissions).
