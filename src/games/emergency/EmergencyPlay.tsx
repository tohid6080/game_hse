import { Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import type { EmergencyCase } from '@/content/schema';
import { SHIELD_LAYERS, startRound, summarizeRound, type RoundState } from '@/domain/round';
import { feedback } from '@/feedback/feedback';
import { t } from '@/i18n';
import { createRng, randomSeed } from '@/lib/rng';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ProfileRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, Card, ConfirmDialog, EmptyState, ProgressBar, Tag, cx } from '@/ui';
import { finishRound } from '../shared/finishRound';
import { ShieldMeter } from '../shared/ShieldMeter';
import { useQuestionTimer } from '../shared/useQuestionTimer';
import {
  EMERGENCY_STEP_TIME_LIMIT_MS,
  judgeCase,
  judgeStep,
  lastSeenFromAttempts,
  prepareEmergency,
  recordEmergency,
  selectEmergencies,
  type CaseJudgement,
  type PreparedEmergency,
  type StepJudgement,
} from './engine';
import { EmergencyFeedback } from './EmergencyFeedback';
import { EmergencyResult, type EmergencyOutcome } from './EmergencyResult';
import { EmergencySummary } from './EmergencySummary';
import styles from './EmergencyPlay.module.css';
import { loadEmergencyBank } from './useEmergencyBank';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';
/** choose = deciding; feedback = what that decision led to; summary = the whole case, once its last step is decided. */
type Phase = 'choose' | 'feedback' | 'summary';

interface Session {
  cases: EmergencyCase[];
  prepared: PreparedEmergency[];
  startedAt: number;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** Picks and prepares the cases of a round. Pure data in, data out — it never touches React state. */
async function loadRound(profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [pack, attempts] = await Promise.all([loadEmergencyBank(), repos().attempts.listByProfileAndGame(profile.id, 'emergency')]);
    const rng = createRng(randomSeed());
    const cases = selectEmergencies({
      cases: pack.cases,
      lastSeenAt: lastSeenFromAttempts(attempts),
      rng,
      experience: profile.experience,
      industry: profile.industry,
    });
    if (cases.length === 0) return { kind: 'empty' };
    return { kind: 'ready', session: { cases, prepared: cases.map((item) => prepareEmergency(item, rng)), startedAt: Date.now() } };
  } catch {
    return { kind: 'error' };
  }
}

export function EmergencyPlay() {
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [caseIndex, setCaseIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('choose');
  // The selected option is a local draft: "ثبت تصمیم" is the one explicit commit of a step.
  const [selected, setSelected] = useState<number | null>(null);
  const [lastStep, setLastStep] = useState<StepJudgement | null>(null);
  const [caseResult, setCaseResult] = useState<{ judgement: CaseJudgement; points: number } | null>(null);
  const [outcome, setOutcome] = useState<EmergencyOutcome | null>(null);

  const finishing = useRef(false);
  /** The options chosen so far in the case being played, and the time its decisions took. */
  const chosen = useRef<Array<number | null>>([]);
  const caseElapsed = useRef(0);
  /** Judgement of every case played, for the result screen. */
  const judgements = useRef(new Map<string, CaseJudgement>());

  const submitRef = useRef<(optionId: number | null) => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && phase === 'choose',
    limitMs: EMERGENCY_STEP_TIME_LIMIT_MS,
    resetKey: caseIndex * 100 + stepIndex,
    onExpire: () => submitRef.current(null),
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
      chosen.current = [];
      caseElapsed.current = 0;
      setOutcome(null);
      setSession(result.session);
      setRound(startRound(result.session.cases));
      setCaseIndex(0);
      setStepIndex(0);
      setPhase('choose');
      setSelected(null);
      setLastStep(null);
      setCaseResult(null);
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

  /* Deciding a step. The last step of a case also judges the whole case on the shared machine. */
  const submit = useCallback(
    (optionId: number | null) => {
      if (!session || !round || phase !== 'choose' || round.status !== 'playing') return;
      const emergency = session.cases[caseIndex];
      const step = emergency?.steps[stepIndex];
      if (!emergency || !step) return;

      const judgement = judgeStep(step, optionId);
      // A safe but weaker action gets no cue either way; only the best move and a harmful one are marked.
      if (judgement.grade === 'best') feedback('correct');
      else if (judgement.grade !== 'acceptable') feedback('shield');
      chosen.current = [...chosen.current, judgement.chosenId];
      caseElapsed.current += elapsedMs();
      setLastStep(judgement);

      if (stepIndex === emergency.steps.length - 1) {
        const whole = judgeCase(emergency, chosen.current);
        const next = recordEmergency(round, { emergency, judgement: whole, elapsedMs: caseElapsed.current }, timedMode);
        judgements.current.set(emergency.id, whole);
        setRound(next);
        setCaseResult({ judgement: whole, points: next.results[next.results.length - 1]?.points ?? 0 });
      }
      setPhase('feedback');
    },
    [session, round, phase, caseIndex, stepIndex, timedMode, elapsedMs],
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
      gameId: 'emergency',
      contentId: 'emergency.mixed',
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
      toReview: session.cases
        .filter((item) => (creditById.get(item.id) ?? 1) < 1)
        .map((item) => {
          const judged = judgements.current.get(item.id);
          const better = item.steps.flatMap((step, index) => {
            const given = judged?.steps[index];
            return given && given.grade !== 'best' ? [{ step: index + 1, text: step.options[given.bestId]!.text }] : [];
          });
          return { emergency: item, credit: creditById.get(item.id) ?? 0, better };
        }),
    });
    setView('result');
  }

  function nextAfterFeedback() {
    if (!session) return;
    const emergency = session.cases[caseIndex];
    if (!emergency) return;
    if (stepIndex < emergency.steps.length - 1) {
      setStepIndex(stepIndex + 1);
      setSelected(null);
      setLastStep(null);
      setPhase('choose');
      restartTimer();
    } else {
      setPhase('summary');
    }
  }

  function nextAfterSummary() {
    if (!round) return;
    if (round.status !== 'playing') {
      void finish(round);
      return;
    }
    chosen.current = [];
    caseElapsed.current = 0;
    setCaseIndex(caseIndex + 1);
    setStepIndex(0);
    setSelected(null);
    setLastStep(null);
    setCaseResult(null);
    setPhase('choose');
    restartTimer();
  }

  /* Rendering ------------------------------------------------------------------------------ */
  if (!profile) return null;

  const backToHub = () => navigate('/games/emergency');

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
          title={view === 'empty' ? t('emergency.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('emergency.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('emergency.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return <EmergencyResult outcome={outcome} onAgain={restart} onBack={backToHub} />;
  }

  if (!session || !round) return null;

  const prepared = session.prepared[caseIndex];
  const emergency = session.cases[caseIndex];
  const step = emergency?.steps[stepIndex];
  if (!prepared || !emergency || !step) return null;

  const isLastStep = stepIndex === emergency.steps.length - 1;
  const caseLabel = t('emergency.play.caseOf', { current: caseIndex + 1, total: round.total });
  const seconds = Math.ceil(timer.remainingMs / 1000);
  const options = prepared.options[stepIndex] ?? [];

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.emergency.name')}</h1>
      <header className={styles.top}>
        <Button variant="ghost" onClick={backToHub} aria-label={t('quiz.play.exit')}>
          <X size={22} aria-hidden="true" />
        </Button>
        <div className={styles.progress}>
          <ProgressBar value={caseIndex / round.total} label={caseLabel} />
          <span className={styles.count}>{caseLabel}</span>
        </div>
        <ShieldMeter layersLeft={round.layersLeft} total={SHIELD_LAYERS} />
      </header>

      {timedMode && phase === 'choose' ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / EMERGENCY_STEP_TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds })}</span>
        </div>
      ) : null}

      {phase !== 'summary' ? (
        <Card>
          <div className={styles.scenario}>
            <div className={styles.meta}>
              <Tag tone="info">{t(`emergency.type.${emergency.emergencyType}`)}</Tag>
              <Tag>{t('emergency.play.stepOf', { current: stepIndex + 1, total: emergency.steps.length })}</Tag>
            </div>
            <h2 className={styles.prompt}>{emergency.title}</h2>
            {stepIndex === 0 ? <p className={styles.situation}>{emergency.prompt}</p> : <p className={styles.recap}>{t('emergency.play.recap')}</p>}
            <p className={styles.situation}>{step.situation}</p>
          </div>
        </Card>
      ) : null}

      {phase === 'choose' ? (
        <section className={styles.step} aria-label={t('emergency.play.choose')}>
          <p className={styles.instruction}>{t('emergency.play.choose')}</p>
          <div className={styles.options} role="radiogroup" aria-label={t('emergency.play.choose')}>
            {options.map((option, index) => {
              const isSelected = selected === option.id;
              return (
                <div key={option.id} role="presentation">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={cx(styles.option, isSelected && styles.selected)}
                    onClick={() => setSelected(option.id)}
                  >
                    <span className={styles.marker} aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className={styles.optionText}>{option.text}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <Button size="lg" fullWidth disabled={selected === null} onClick={() => submit(selected)}>
            {t('emergency.play.submit')}
          </Button>
        </section>
      ) : null}

      {phase === 'feedback' && lastStep ? (
        <EmergencyFeedback
          step={step}
          judgement={lastStep}
          nextLabel={isLastStep ? t('emergency.play.seeSummary') : t('emergency.play.nextStep')}
          onNext={nextAfterFeedback}
        />
      ) : null}

      {phase === 'summary' && caseResult ? (
        <EmergencySummary
          emergency={emergency}
          judgement={caseResult.judgement}
          points={caseResult.points}
          streak={round.streak}
          layerBroken={!caseResult.judgement.correct}
          shieldGone={round.layersLeft <= 0}
          nextLabel={round.status === 'playing' ? t('emergency.summary.next') : t('quiz.play.finish')}
          onNext={nextAfterSummary}
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
