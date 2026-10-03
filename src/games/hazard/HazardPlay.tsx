import { Lightbulb, Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { loadHazardBank } from './useHazardBank';
import { sceneImageUrl } from '@/content/loader';
import type { HazardScene } from '@/content/schema';
import { SHIELD_LAYERS } from '@/domain/round';
import { formatNumber, t } from '@/i18n';
import { createRng, randomSeed } from '@/lib/rng';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ProfileRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, ConfirmDialog, EmptyState, ProgressBar } from '@/ui';
import { feedback as playFeedback } from '@/feedback/feedback';
import { DailyBadge } from '../shared/DailyBadge';
import { dailyKeyForRound } from '../shared/dailyFlag';
import { finishRound } from '../shared/finishRound';
import { ShieldMeter } from '../shared/ShieldMeter';
import { useQuestionTimer } from '../shared/useQuestionTimer';
import {
  HAZARD_MAX_HINTS,
  HAZARD_TIME_LIMIT_MS,
  activeHintIds,
  endRound,
  hazardContentId,
  hazardResults,
  hintsLeft,
  isFound,
  lastSeenScenes,
  requestHint,
  selectScene,
  startHazardRound,
  summarizeHazardRound,
  tapScene,
  type HazardRound,
} from './engine';
import { hintRing, type Point } from './geometry';
import { HazardFeedback, type Feedback } from './HazardFeedback';
import { HazardMarkers, type Marker } from './HazardMarkers';
import type { HazardOutcome } from './HazardResult';
import { HazardResult } from './HazardResult';
import styles from './HazardPlay.module.css';
import { PanZoomImage, type PanZoomHandle } from './PanZoomImage';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';

interface Session {
  scene: HazardScene;
  imageUrl: string;
  startedAt: number;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** A tap that hit nothing: shown as a short red ripple at the spot. */
interface Ripple {
  id: number;
  point: Point;
}

const RIPPLE_RADIUS = 0.05;

/** Picks the scene of a round. Pure data in, data out — it never touches React state. */
async function loadRound(profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [pack, attempts] = await Promise.all([
      loadHazardBank(),
      repos().attempts.listByProfileAndGame(profile.id, 'findHazard'),
    ]);
    const scene = selectScene({
      scenes: pack.scenes,
      lastSeenAt: lastSeenScenes(attempts),
      rng: createRng(randomSeed()),
      industry: profile.industry,
    });
    if (!scene) return { kind: 'empty' };
    const imageUrl = sceneImageUrl(scene.image);
    if (!imageUrl) return { kind: 'error' };
    return { kind: 'ready', session: { scene, imageUrl, startedAt: Date.now() } };
  } catch {
    return { kind: 'error' };
  }
}

function buildMarkers(scene: HazardScene, round: HazardRound, ripples: readonly Ripple[]): Marker[] {
  const ended = round.status !== 'playing';
  const aspect = scene.height / scene.width;
  const markers: Marker[] = [];

  scene.hazards.forEach((hazard, index) => {
    const wasFound = isFound(round, hazard.id);
    // Numbers only once the round is over: that is when the review list refers to them.
    const label = ended ? formatNumber(index + 1) : undefined;
    if (wasFound) markers.push({ key: hazard.id, kind: 'found', x: hazard.x, y: hazard.y, radius: hazard.radius, label });
    else if (ended) markers.push({ key: hazard.id, kind: 'missed', x: hazard.x, y: hazard.y, radius: hazard.radius, label });
  });

  if (!ended) {
    for (const id of activeHintIds(round)) {
      const hazard = scene.hazards.find((candidate) => candidate.id === id);
      if (hazard) markers.push({ key: `hint-${id}`, kind: 'hint', ...hintRing(hazard, aspect) });
    }
  }

  for (const ripple of ripples) {
    markers.push({ key: `miss-${ripple.id}`, kind: 'tap-miss', x: ripple.point.x, y: ripple.point.y, radius: RIPPLE_RADIUS });
  }
  return markers;
}

export function HazardPlay() {
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<HazardRound | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [outcome, setOutcome] = useState<HazardOutcome | null>(null);

  const finishing = useRef(false);
  const rippleSeq = useRef(0);
  const panZoom = useRef<PanZoomHandle>(null);

  // The countdown calls the latest handler (it needs the current round); `expireRef` is kept fresh below.
  const expireRef = useRef<() => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && round?.status === 'playing',
    limitMs: HAZARD_TIME_LIMIT_MS,
    resetKey: 0,
    onExpire: () => expireRef.current(),
  });
  const { restart: restartTimer, elapsedMs } = timer;

  /* Applying a loaded round to state. Always called from a promise callback or an event handler. */
  const apply = useCallback(
    (result: LoadedRound) => {
      if (result.kind !== 'ready') {
        setView(result.kind);
        return;
      }
      finishing.current = false;
      setOutcome(null);
      setSession(result.session);
      setRound(startHazardRound());
      setFeedback(null);
      setRipples([]);
      setConfirmGiveUp(false);
      restartTimer();
      setView('playing');
    },
    [restartTimer],
  );

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void loadRound(profile).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, apply]);

  function restart() {
    if (!profile) return;
    setView('loading');
    setOutcome(null);
    finishing.current = false;
    void loadRound(profile).then(apply);
  }

  /* Leaving mid-round asks first; nothing is saved until the round ends. */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      view === 'playing' &&
      currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search,
  );

  /* Playing ------------------------------------------------------------------------------- */
  function onTap(point: Point, slop: number) {
    if (!session || !round || round.status !== 'playing') return;
    const result = tapScene(round, session.scene, point, { slop, elapsedMs: elapsedMs(), timed: timedMode });
    if (result.kind === 'ignored') return;
    setRound(result.round);

    if (result.kind === 'miss') {
      playFeedback('shield');
      rippleSeq.current += 1;
      setRipples((current) => [...current.slice(-3), { id: rippleSeq.current, point }]);
      setFeedback({ kind: 'miss', shieldGone: result.round.status === 'shield-broken' });
      return;
    }
    if (result.hazard) {
      if (result.kind === 'found') playFeedback('found');
      setFeedback({
        kind: 'found',
        hazard: result.hazard,
        points: result.points,
        streak: result.round.streak,
        again: result.kind === 'repeat',
        all: result.round.status === 'completed',
      });
    }
  }

  function onHint() {
    if (!session || !round) return;
    const next = requestHint(round, session.scene);
    if (!next.hazardId) return;
    setRound(next.round);
    setFeedback({ kind: 'hint' });
    // The ring may be outside a zoomed-in view.
    panZoom.current?.reset();
  }

  function giveUp() {
    if (!round) return;
    setConfirmGiveUp(false);
    setRound(endRound(round, 'gave-up', elapsedMs()));
    setFeedback({ kind: 'ended', reason: 'gave-up' });
  }

  useEffect(() => {
    expireRef.current = () => {
      if (!round || round.status !== 'playing') return;
      setRound(endRound(round, 'time-up', HAZARD_TIME_LIMIT_MS));
      setFeedback({ kind: 'ended', reason: 'time-up' });
    };
  });

  /* Finishing: one atomic write of the attempt. */
  async function finish() {
    if (!session || !round || !profile || finishing.current || round.status === 'playing') return;
    finishing.current = true;
    setView('saving');

    const summary = summarizeHazardRound(round, session.scene);
    const saved = await finishRound({
      profile,
      gameId: 'findHazard',
      contentId: hazardContentId(session.scene.id),
      mode: 'scene',
      firstTimeEligible: true,
      startedAt: session.startedAt,
      results: hazardResults(round, session.scene),
      summary,
      endedBy: round.status,
      misses: round.misses,
      daily: dailyKeyForRound(params, 'findHazard', session.startedAt),
    });
    setOutcome({ ...saved, summary, scene: session.scene, imageUrl: session.imageUrl, round });
    setView('result');
  }

  /* Rendering ----------------------------------------------------------------------------- */
  if (!profile) return null;

  const backToHub = () => navigate('/games/hazard');

  if (view === 'loading' || view === 'saving') {
    return (
      <div className={styles.center} role="status">
        <Loader size={28} aria-hidden="true" />
        <p>{t('quiz.play.loading')}</p>
      </div>
    );
  }

  if (view === 'empty' || view === 'error') {
    return (
      <div className={styles.center}>
        <EmptyState
          icon={SearchX}
          title={view === 'empty' ? t('hazard.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('hazard.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('hazard.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return <HazardResult outcome={outcome} onAgain={restart} onBack={backToHub} />;
  }

  if (!session || !round) return null;

  const { scene } = session;
  const playing = round.status === 'playing';
  const found = round.found.length;
  const progressLabel = t('hazard.play.progress', { found, total: scene.hazards.length });
  const seconds = Math.ceil(timer.remainingMs / 1000);
  const left = hintsLeft(round);
  const hintPossible =
    playing && left > 0 && scene.hazards.some((hazard) => !isFound(round, hazard.id) && !round.hinted.includes(hazard.id));

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.findHazard.name')}</h1>
      <header className={styles.top}>
        <Button variant="ghost" onClick={backToHub} aria-label={t('quiz.play.exit')}>
          <X size={22} aria-hidden="true" />
        </Button>
        <div className={styles.progress}>
          <ProgressBar value={found / scene.hazards.length} label={progressLabel} />
          <span className={styles.count}>{progressLabel}</span>
        </div>
        <ShieldMeter layersLeft={round.layersLeft} total={SHIELD_LAYERS} />
      </header>

      <DailyBadge gameId="findHazard" />

      {timedMode && playing ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / HAZARD_TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds })}</span>
        </div>
      ) : null}

      <PanZoomImage
        src={session.imageUrl}
        alt={scene.imageAlt}
        width={scene.width}
        height={scene.height}
        onTap={onTap}
        handle={panZoom}
      >
        <HazardMarkers
          markers={buildMarkers(scene, round, ripples)}
          width={scene.width}
          height={scene.height}
          onRippleEnd={(key) => setRipples((current) => current.filter((ripple) => `miss-${ripple.id}` !== key))}
        />
      </PanZoomImage>

      <HazardFeedback feedback={feedback} />

      {playing ? (
        <div className={styles.actions}>
          <Button variant="secondary" disabled={!hintPossible} onClick={onHint}>
            <Lightbulb size={18} aria-hidden="true" />
            {t('hazard.play.hint')} ({t('hazard.play.hintsLeft', { left: Math.min(left, HAZARD_MAX_HINTS) })})
          </Button>
          <Button variant="ghost" onClick={() => setConfirmGiveUp(true)}>
            {t('hazard.play.giveUp')}
          </Button>
        </div>
      ) : (
        <Button size="lg" fullWidth onClick={() => void finish()}>
          {t('quiz.play.finish')}
        </Button>
      )}

      <ConfirmDialog
        open={confirmGiveUp}
        title={t('hazard.play.giveUpTitle')}
        body={t('hazard.play.giveUpBody')}
        confirmLabel={t('hazard.play.giveUpConfirm')}
        cancelLabel={t('hazard.play.giveUpStay')}
        danger
        onCancel={() => setConfirmGiveUp(false)}
        onConfirm={giveUp}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('quiz.play.leaveTitle')}
        body={t('quiz.play.leaveBody')}
        confirmLabel={t('quiz.play.leaveConfirm')}
        cancelLabel={t('quiz.play.leaveStay')}
        danger
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
