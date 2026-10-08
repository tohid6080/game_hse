import { Lightbulb, Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import type { PermitCase } from '@/content/schema';
import { SHIELD_LAYERS, startRound, summarizeRound, type RoundState } from '@/domain/round';
import { feedback } from '@/feedback/feedback';
import { t } from '@/i18n';
import { createRng, randomSeed } from '@/lib/rng';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ProfileRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, Card, ConfirmDialog, EmptyState, ProgressBar, Tag } from '@/ui';
import { finishRound } from '../shared/finishRound';
import { ShieldMeter } from '../shared/ShieldMeter';
import { useQuestionTimer } from '../shared/useQuestionTimer';
import {
  PERMIT_MAX_HINTS,
  PERMIT_TIME_LIMIT_MS,
  judgePermit,
  lastSeenFromAttempts,
  recordPermit,
  selectPermits,
  type PermitDecision,
  type PermitJudgement,
} from './engine';
import { PermitForm } from './PermitForm';
import { PermitResult, type PermitOutcome } from './PermitResult';
import { PermitReview } from './PermitReview';
import styles from './PermitPlay.module.css';
import { loadPermitBank } from './usePermitBank';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';
type Phase = 'read' | 'review';

interface Session {
  permits: PermitCase[];
  startedAt: number;
}

interface Review {
  judgement: PermitJudgement;
  flagged: ReadonlySet<string>;
  points: number;
  timedOut: boolean;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** Picks the permits of a round. Pure data in, data out — it never touches React state. */
async function loadRound(profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [pack, attempts] = await Promise.all([loadPermitBank(), repos().attempts.listByProfileAndGame(profile.id, 'permit')]);
    const permits = selectPermits({
      permits: pack.permits,
      lastSeenAt: lastSeenFromAttempts(attempts),
      rng: createRng(randomSeed()),
      experience: profile.experience,
      industry: profile.industry,
    });
    if (permits.length === 0) return { kind: 'empty' };
    return { kind: 'ready', session: { permits, startedAt: Date.now() } };
  } catch {
    return { kind: 'error' };
  }
}

const NO_FLAGS: ReadonlySet<string> = new Set();

export function PermitPlay() {
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<Phase>('read');
  // The marks are a local draft: nothing is saved until the round ends.
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(NO_FLAGS);
  const [hintUsed, setHintUsed] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [outcome, setOutcome] = useState<PermitOutcome | null>(null);

  const finishing = useRef(false);
  /** Judgement of every permit played, for the result screen. */
  const judgements = useRef(new Map<string, PermitJudgement>());

  const submitRef = useRef<(decision: PermitDecision | null, timedOut: boolean) => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && phase === 'read',
    limitMs: PERMIT_TIME_LIMIT_MS,
    resetKey: round?.index ?? 0,
    onExpire: () => submitRef.current(null, true),
  });
  const { restart: restartTimer, elapsedMs } = timer;

  const apply = useCallback(
    (result: LoadedRound) => {
      if (result.kind !== 'ready') {
        setView(result.kind);
        return;
      }
      finishing.current = false;
      judgements.current = new Map();
      setOutcome(null);
      setSession(result.session);
      setRound(startRound(result.session.permits));
      setPhase('read');
      setFlagged(NO_FLAGS);
      setHintUsed(false);
      setReview(null);
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

  function toggle(fieldId: string) {
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  /* Deciding is the one explicit commit of a permit: the marks and the decision are judged together. */
  const submit = useCallback(
    (decision: PermitDecision | null, timedOut: boolean) => {
      if (!session || !round || phase !== 'read' || round.status !== 'playing') return;
      const permit = session.permits[round.index];
      if (!permit) return;

      const judgement = judgePermit(permit, { flagged: [...flagged], decision });
      feedback(judgement.correct ? 'correct' : 'shield');
      const next = recordPermit(round, { permit, judgement, hintsUsed: hintUsed ? PERMIT_MAX_HINTS : 0, elapsedMs: elapsedMs() }, timedMode);
      judgements.current.set(permit.id, judgement);
      setRound(next);
      setReview({ judgement, flagged, points: next.results[next.results.length - 1]?.points ?? 0, timedOut });
      setPhase('review');
    },
    [session, round, phase, flagged, hintUsed, timedMode, elapsedMs],
  );

  useEffect(() => {
    submitRef.current = submit;
  });

  /* Finishing: one atomic write of the attempt. */
  async function finish(final: RoundState) {
    if (!session || !profile || finishing.current) return;
    finishing.current = true;
    setView('saving');

    const summary = summarizeRound(final);
    const saved = await finishRound({
      profile,
      gameId: 'permit',
      contentId: 'permit.mixed',
      mode: 'mixed',
      firstTimeEligible: true,
      startedAt: session.startedAt,
      results: final.results,
      summary,
    });

    const creditById = new Map(final.results.map((result) => [result.questionId, result.credit]));
    setOutcome({
      ...saved,
      summary,
      toReview: session.permits
        .filter((permit) => (creditById.get(permit.id) ?? 1) < 1)
        .map((permit) => {
          const judged = judgements.current.get(permit.id);
          const missed = permit.defects.filter((_, index) => judged?.defects[index]?.found === false).map((defect) => defect.why);
          return { permit, credit: creditById.get(permit.id) ?? 0, missed };
        }),
    });
    setView('result');
  }

  function proceed() {
    if (!round) return;
    if (round.status !== 'playing') {
      void finish(round);
      return;
    }
    setPhase('read');
    setFlagged(NO_FLAGS);
    setHintUsed(false);
    setReview(null);
    restartTimer();
  }

  /* Rendering ------------------------------------------------------------------------------ */
  if (!profile) return null;

  const backToHub = () => navigate('/games/permit');

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
          title={view === 'empty' ? t('permit.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('permit.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('permit.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return <PermitResult outcome={outcome} onAgain={restart} onBack={backToHub} />;
  }

  if (!session || !round) return null;

  const currentIndex = phase === 'review' ? round.index - 1 : round.index;
  const permit = session.permits[currentIndex];
  if (!permit) return null;

  const shownNumber = Math.min(round.index + (phase === 'review' ? 0 : 1), round.total);
  const progressLabel = t('quiz.play.question', { current: shownNumber, total: round.total });
  const seconds = Math.ceil(timer.remainingMs / 1000);

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.permit.name')}</h1>
      <header className={styles.top}>
        <Button variant="ghost" onClick={backToHub} aria-label={t('quiz.play.exit')}>
          <X size={22} aria-hidden="true" />
        </Button>
        <div className={styles.progress}>
          <ProgressBar value={round.index / round.total} label={progressLabel} />
          <span className={styles.count}>{progressLabel}</span>
        </div>
        <ShieldMeter layersLeft={round.layersLeft} total={SHIELD_LAYERS} />
      </header>

      {timedMode && phase === 'read' ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / PERMIT_TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds })}</span>
        </div>
      ) : null}

      <Card>
        <div className={styles.scenario}>
          <Tag tone="info">{t(`permit.type.${permit.permitType}`)}</Tag>
          <h2 className={styles.prompt}>{permit.title}</h2>
          <p>{permit.prompt}</p>
        </div>
      </Card>

      {phase === 'read' ? (
        <section className={styles.form} aria-label={t('permit.play.formLabel')}>
          <p className={styles.instruction}>{t('permit.play.instruction')}</p>
          <PermitForm permit={permit} flagged={flagged} onToggle={toggle} />
          <p className={styles.flaggedCount} role="status">
            {t('permit.play.flagged', { count: flagged.size })}
          </p>

          <div className={styles.decide}>
            <Button variant="secondary" disabled={hintUsed} onClick={() => setHintUsed(true)}>
              <Lightbulb size={18} aria-hidden="true" />
              {hintUsed
                ? permit.defects.length === 0
                  ? t('permit.play.hintNone')
                  : t('permit.play.hintShown', { count: permit.defects.length })
                : `${t('permit.play.hint')} ${t('permit.play.hintCost')}`}
            </Button>
            <p className={styles.instruction}>{t('permit.play.decide')}</p>
            <div className={styles.decisions}>
              <Button size="lg" variant="danger" onClick={() => submit('reject', false)}>
                {t('permit.play.reject')}
              </Button>
              <Button size="lg" onClick={() => submit('approve', false)}>
                {t('permit.play.approve')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {phase === 'review' && review ? (
        <PermitReview
          permit={permit}
          judgement={review.judgement}
          flagged={review.flagged}
          points={review.points}
          streak={round.streak}
          timedOut={review.timedOut}
          layerBroken={!review.judgement.correct}
          shieldGone={round.layersLeft <= 0}
          nextLabel={round.status === 'playing' ? t('permit.review.next') : t('quiz.play.finish')}
          onNext={proceed}
        />
      ) : null}

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
