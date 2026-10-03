import { Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import type { QuizQuestion } from '@/content/schema';
import { t } from '@/i18n';
import { createRng, randomSeed, type Rng } from '@/lib/rng';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ProfileRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, ConfirmDialog, EmptyState, ProgressBar } from '@/ui';
import { feedback } from '@/feedback/feedback';
import { DailyBadge } from '../shared/DailyBadge';
import { dailyKeyForRound } from '../shared/dailyFlag';
import { finishRound } from '../shared/finishRound';
import { ShieldMeter } from '../shared/ShieldMeter';
import { useQuestionTimer } from '../shared/useQuestionTimer';
import {
  TIME_LIMIT_MS,
  buildStatUpdates,
  canUseHint,
  contentIdForMode,
  hintEliminations,
  isCorrect,
  isFirstTimeEligible,
  modeToSearch,
  parseMode,
  prepareQuestion,
  recordAnswer,
  selectQuestions,
  startRound,
  summarizeRound,
  SHIELD_LAYERS,
  type PreparedQuestion,
  type QuizAnswer,
  type QuizMode,
  type RoundState,
} from './engine';
import { FeedbackPanel } from './FeedbackPanel';
import styles from './QuizPlay.module.css';
import { QuestionView } from './questions/QuestionView';
import { QuizResult, type RoundOutcome } from './QuizResult';
import { loadBank } from './useQuizBank';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';

interface Session {
  questions: QuizQuestion[];
  prepared: PreparedQuestion[];
  startedAt: number;
  /** Seeded stream used for hint choices, so the whole round stays reproducible. */
  rng: Rng;
}

interface Review {
  correct: boolean;
  timedOut: boolean;
  points: number;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** Picks and prepares the questions of a round. Pure data in, data out — it never touches React state. */
async function loadRound(mode: QuizMode, profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [bank, stats] = await Promise.all([loadBank(), repos().questionStats.getAll(profile.id)]);
    const rng = createRng(randomSeed());
    const questions = selectQuestions({
      questions: bank.questions,
      mode,
      stats,
      now: Date.now(),
      rng,
      experience: profile.experience,
      industry: profile.industry,
    });
    if (questions.length === 0) return { kind: 'empty' };
    return {
      kind: 'ready',
      session: {
        questions,
        prepared: questions.map((question) => prepareQuestion(question, rng)),
        startedAt: Date.now(),
        rng,
      },
    };
  } catch {
    return { kind: 'error' };
  }
}

export function QuizPlay() {
  const [params] = useSearchParams();
  const mode = useMemo(() => parseMode(params), [params]);
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<'answering' | 'reviewing'>('answering');
  const [review, setReview] = useState<Review | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);

  const finishing = useRef(false);

  // `submit` is defined below; the timer only needs a stable way to call the latest one.
  const submitRef = useRef<(answer: QuizAnswer | null) => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && phase === 'answering',
    limitMs: TIME_LIMIT_MS,
    resetKey: round?.index ?? 0,
    onExpire: () => submitRef.current(null),
  });
  const { restart: restartTimer, elapsedMs } = timer;

  /* Applying a loaded round to state. Always called from a promise callback or an event handler. */
  const apply = useCallback((result: LoadedRound) => {
    if (result.kind !== 'ready') {
      setView(result.kind);
      return;
    }
    finishing.current = false;
    setOutcome(null);
    setSession(result.session);
    setRound(startRound(result.session.questions));
    setPhase('answering');
    setReview(null);
    setHintsUsed(0);
    setHidden(new Set());
    restartTimer();
    setView('playing');
  }, [restartTimer]);

  useEffect(() => {
    if (!mode || !profile) return;
    let cancelled = false;
    void loadRound(mode, profile).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, profile, apply]);

  function showLoading() {
    setView('loading');
    setOutcome(null);
    finishing.current = false;
  }

  /** New round on the same mode, with fresh spaced-repetition stats. */
  function restart() {
    if (!mode || !profile) return;
    showLoading();
    void loadRound(mode, profile).then(apply);
  }

  /* Leaving mid-round (tab, back button, close) asks first; nothing is saved until the round ends. */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      view === 'playing' &&
      currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search,
  );

  /* Answering ------------------------------------------------------------------------------ */
  const submit = useCallback(
    (answer: QuizAnswer | null) => {
      if (!session || !round || phase !== 'answering' || round.status !== 'playing') return;
      const prepared = session.prepared[round.index];
      const question = session.questions[round.index];
      if (!prepared || !question) return;

      const correct = answer !== null && isCorrect(prepared, answer);
      feedback(correct ? 'correct' : 'shield');
      const next = recordAnswer(
        round,
        { question, correct, hintsUsed, elapsedMs: elapsedMs() },
        timedMode,
      );
      setRound(next);
      setReview({ correct, timedOut: answer === null, points: next.results[next.results.length - 1]?.points ?? 0 });
      setPhase('reviewing');
    },
    [session, round, phase, hintsUsed, timedMode, elapsedMs],
  );

  useEffect(() => {
    submitRef.current = submit;
  });

  function applyHint() {
    if (!session || !round || hintsUsed > 0) return;
    const prepared = session.prepared[round.index];
    if (!prepared || !canUseHint(prepared)) return;
    setHidden(new Set(hintEliminations(prepared, session.rng)));
    setHintsUsed(1);
  }

  /* Finishing: one atomic write of the attempt plus the spaced-repetition updates. */
  async function finish(final: RoundState) {
    if (!session || !profile || !mode || finishing.current) return;
    finishing.current = true;
    setView('saving');

    const summary = summarizeRound(final);
    const saved = await finishRound({
      profile,
      gameId: 'quiz',
      contentId: contentIdForMode(mode),
      mode: mode.kind,
      firstTimeEligible: isFirstTimeEligible(mode),
      startedAt: session.startedAt,
      results: final.results,
      summary,
      daily: dailyKeyForRound(params, 'quiz', session.startedAt, mode.kind === 'topic' ? mode.topic : undefined),
      buildStats: (previous, now) => buildStatUpdates(profile.id, final.results, previous, now),
    });

    const missedIds = new Set(final.results.filter((result) => !result.correct).map((result) => result.questionId));
    setOutcome({
      ...saved,
      summary,
      missed: session.questions.filter((question) => missedIds.has(question.id)),
    });
    setView('result');
  }

  function proceed() {
    if (!round) return;
    if (round.status !== 'playing') {
      void finish(round);
      return;
    }
    setPhase('answering');
    setReview(null);
    setHintsUsed(0);
    setHidden(new Set());
    restartTimer();
  }

  /* Rendering ------------------------------------------------------------------------------ */
  if (!mode) return <Navigate to="/games/quiz" replace />;
  if (!profile) return null;

  const backToHub = () => navigate('/games/quiz');
  const startWeakSpots = (target: QuizMode) => {
    showLoading();
    navigate(`/games/quiz/play?${modeToSearch(target)}`, { replace: true });
  };

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
          title={view === 'empty' ? t('quiz.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('quiz.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('quiz.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return (
      <QuizResult
        outcome={outcome}
        onAgain={restart}
        onWeakSpots={() => startWeakSpots({ kind: 'weak' })}
        onBack={backToHub}
      />
    );
  }

  if (!session || !round) return null;

  const answeringIndex = phase === 'reviewing' ? round.index - 1 : round.index;
  const prepared = session.prepared[answeringIndex];
  const question = session.questions[answeringIndex];
  if (!prepared || !question) return null;

  const shownNumber = Math.min(round.index + (phase === 'answering' ? 1 : 0), round.total);

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.quiz.name')}</h1>
      <header className={styles.top}>
        <Button variant="ghost" onClick={backToHub} aria-label={t('quiz.play.exit')}>
          <X size={22} aria-hidden="true" />
        </Button>
        <div className={styles.progress}>
          <ProgressBar value={round.index / round.total} label={t('quiz.play.question', { current: shownNumber, total: round.total })} />
          <span className={styles.count}>{t('quiz.play.question', { current: shownNumber, total: round.total })}</span>
        </div>
        <ShieldMeter layersLeft={round.layersLeft} total={SHIELD_LAYERS} />
      </header>

      <DailyBadge gameId="quiz" topic={mode?.kind === 'topic' ? mode.topic : undefined} />

      {timedMode && phase === 'answering' ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds: Math.ceil(timer.remainingMs / 1000) })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds: Math.ceil(timer.remainingMs / 1000) })}</span>
        </div>
      ) : null}

      <QuestionView
        key={question.id}
        prepared={prepared}
        phase={phase}
        hidden={hidden}
        hint={{ available: phase === 'answering' && hintsUsed === 0 && canUseHint(prepared), onUse: applyHint }}
        onSubmit={submit}
      />

      {phase === 'reviewing' && review ? (
        <FeedbackPanel
          correct={review.correct}
          timedOut={review.timedOut}
          points={review.points}
          streak={round.streak}
          layerBroken={!review.correct}
          shieldGone={round.layersLeft <= 0}
          explanation={question.explanation}
          references={question.references}
          nextLabel={round.status === 'playing' ? t('quiz.play.next') : t('quiz.play.finish')}
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
