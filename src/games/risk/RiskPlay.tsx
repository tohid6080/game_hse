import { Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import type { RiskScenario } from '@/content/schema';
import { riskBand, riskScore, type RiskRating } from '@/domain/risk';
import { SHIELD_LAYERS, startRound, summarizeRound, type RoundState } from '@/domain/round';
import { t } from '@/i18n';
import { createRng, randomSeed } from '@/lib/rng';
import { selectActiveProfile, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { ProfileRow } from '@/storage/db';
import { repos } from '@/storage/repositories';
import { Button, Card, ConfirmDialog, EmptyState, ProgressBar, Tag, cx } from '@/ui';
import { feedback } from '@/feedback/feedback';
import { DailyBadge } from '../shared/DailyBadge';
import { dailyKeyForRound } from '../shared/dailyFlag';
import { finishRound } from '../shared/finishRound';
import { ShieldMeter } from '../shared/ShieldMeter';
import { useQuestionTimer } from '../shared/useQuestionTimer';
import { ControlPyramid } from './ControlPyramid';
import {
  RISK_TIME_LIMIT_MS,
  judgeAnswer,
  lastSeenFromAttempts,
  prepareScenario,
  recordScenario,
  selectScenarios,
  type PreparedScenario,
  type ScenarioJudgementDetail,
} from './engine';
import { RiskResult, type RiskOutcome } from './RiskResult';
import { RiskLegend, RiskMatrix } from './RiskMatrix';
import { RiskReview } from './RiskReview';
import styles from './RiskPlay.module.css';
import { ScaleGuide } from './ScaleGuide';
import { loadRiskBank } from './useRiskBank';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';
type Phase = 'rate' | 'control' | 'review';

interface Session {
  scenarios: RiskScenario[];
  prepared: PreparedScenario[];
  startedAt: number;
}

interface Review {
  detail: ScenarioJudgementDetail;
  chosenControlId: number | null;
  points: number;
  timedOut: boolean;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** Picks and prepares the scenarios of a round. Pure data in, data out — it never touches React state. */
async function loadRound(profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [pack, attempts] = await Promise.all([
      loadRiskBank(),
      repos().attempts.listByProfileAndGame(profile.id, 'riskAssessment'),
    ]);
    const rng = createRng(randomSeed());
    const scenarios = selectScenarios({
      scenarios: pack.scenarios,
      lastSeenAt: lastSeenFromAttempts(attempts),
      rng,
      experience: profile.experience,
      industry: profile.industry,
    });
    if (scenarios.length === 0) return { kind: 'empty' };
    return {
      kind: 'ready',
      session: {
        scenarios,
        prepared: scenarios.map((scenario) => prepareScenario(scenario, rng)),
        startedAt: Date.now(),
      },
    };
  } catch {
    return { kind: 'error' };
  }
}

export function RiskPlay() {
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<Phase>('rate');
  const [rating, setRating] = useState<RiskRating | null>(null);
  const [controlId, setControlId] = useState<number | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [outcome, setOutcome] = useState<RiskOutcome | null>(null);

  const finishing = useRef(false);

  // `submit` is defined below; the timer only needs a stable way to call the latest one.
  const submitRef = useRef<(timedOut: boolean) => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && phase !== 'review',
    limitMs: RISK_TIME_LIMIT_MS,
    resetKey: round?.index ?? 0,
    onExpire: () => submitRef.current(true),
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
      setRound(startRound(result.session.scenarios));
      setPhase('rate');
      setRating(null);
      setControlId(null);
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

  /* Answering ------------------------------------------------------------------------------ */
  const submit = useCallback(
    (timedOut: boolean) => {
      if (!session || !round || phase === 'review' || round.status !== 'playing') return;
      const scenario = session.scenarios[round.index];
      if (!scenario) return;

      const detail = judgeAnswer(scenario, { rating, controlId });
      feedback(detail.correct ? 'correct' : 'shield');
      const next = recordScenario(round, { scenario, judgement: detail, elapsedMs: elapsedMs() }, timedMode);
      setRound(next);
      setReview({
        detail,
        chosenControlId: controlId,
        points: next.results[next.results.length - 1]?.points ?? 0,
        timedOut,
      });
      setPhase('review');
    },
    [session, round, phase, rating, controlId, timedMode, elapsedMs],
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
      gameId: 'riskAssessment',
      contentId: 'risk.mixed',
      mode: 'mixed',
      firstTimeEligible: true,
      startedAt: session.startedAt,
      results: final.results,
      summary,
      daily: dailyKeyForRound(params, 'riskAssessment', session.startedAt),
    });

    const creditById = new Map(final.results.map((result) => [result.questionId, result.credit]));
    setOutcome({
      ...saved,
      summary,
      toReview: session.scenarios
        .filter((scenario) => (creditById.get(scenario.id) ?? 1) < 1)
        .map((scenario) => ({ scenario, credit: creditById.get(scenario.id) ?? 0 })),
    });
    setView('result');
  }

  function proceed() {
    if (!round) return;
    if (round.status !== 'playing') {
      void finish(round);
      return;
    }
    setPhase('rate');
    setRating(null);
    setControlId(null);
    setReview(null);
    restartTimer();
  }

  /* Rendering ------------------------------------------------------------------------------ */
  if (!profile) return null;

  const backToHub = () => navigate('/games/risk');

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
          title={view === 'empty' ? t('risk.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('risk.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('risk.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return <RiskResult outcome={outcome} onAgain={restart} onBack={backToHub} />;
  }

  if (!session || !round) return null;

  const currentIndex = phase === 'review' ? round.index - 1 : round.index;
  const prepared = session.prepared[currentIndex];
  const scenario = session.scenarios[currentIndex];
  if (!prepared || !scenario) return null;

  const shownNumber = Math.min(round.index + (phase === 'review' ? 0 : 1), round.total);
  const progressLabel = t('quiz.play.question', { current: shownNumber, total: round.total });
  const ratingScore = rating ? riskScore(rating.likelihood, rating.severity) : null;
  const seconds = Math.ceil(timer.remainingMs / 1000);

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.riskAssessment.name')}</h1>
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

      <DailyBadge gameId="riskAssessment" />

      {timedMode && phase !== 'review' ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / RISK_TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds })}</span>
        </div>
      ) : null}

      <Card>
        <div className={styles.scenario}>
          <Tag tone="info">{scenario.title}</Tag>
          <h2 className={styles.prompt}>{scenario.prompt}</h2>
        </div>
      </Card>

      {phase === 'rate' ? (
        <section className={styles.step} aria-label={t('risk.play.stepRate')}>
          <p className={styles.stepLabel}>{t('risk.play.stepRate')}</p>
          <p>{t('risk.play.rateInstruction')}</p>
          <ScaleGuide />
          <RiskMatrix selected={rating} onSelect={setRating} />
          <p className={styles.readout} role="status">
            {rating && ratingScore !== null
              ? t('risk.play.picked', {
                  likelihood: rating.likelihood,
                  severity: rating.severity,
                  score: ratingScore,
                  band: t(`risk.band.${riskBand(ratingScore)}`),
                })
              : t('risk.play.pick')}
          </p>
          <RiskLegend />
          <Button size="lg" fullWidth disabled={!rating} onClick={() => setPhase('control')}>
            {t('risk.play.submitRating')}
          </Button>
        </section>
      ) : null}

      {phase === 'control' ? (
        <section className={styles.step} aria-label={t('risk.play.stepControl')}>
          <p className={styles.stepLabel}>{t('risk.play.stepControl')}</p>
          {rating && ratingScore !== null ? (
            <Tag tone="primary">
              {t('risk.play.picked', {
                likelihood: rating.likelihood,
                severity: rating.severity,
                score: ratingScore,
                band: t(`risk.band.${riskBand(ratingScore)}`),
              })}
            </Tag>
          ) : null}
          <p className={styles.instruction}>{t('risk.play.controlInstruction')}</p>
          <p className={styles.hint}>{t('risk.play.hierarchyHint')}</p>
          <div className={styles.options} role="radiogroup" aria-label={t('risk.play.controlInstruction')}>
            {prepared.options.map((option, index) => {
              const selected = controlId === option.id;
              return (
                <div key={option.id} role="presentation">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={cx(styles.option, selected && styles.selected)}
                    onClick={() => setControlId(option.id)}
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
          <details className={styles.hierarchy}>
            <summary>{t('risk.play.hierarchy')}</summary>
            <ControlPyramid />
          </details>
          <div className={styles.actions}>
            <Button size="lg" disabled={controlId === null} onClick={() => submit(false)}>
              {t('quiz.play.submit')}
            </Button>
            <Button variant="secondary" onClick={() => setPhase('rate')}>
              {t('risk.play.changeRating')}
            </Button>
          </div>
        </section>
      ) : null}

      {phase === 'review' && review ? (
        <RiskReview
          prepared={prepared}
          detail={review.detail}
          chosenControlId={review.chosenControlId}
          points={review.points}
          streak={round.streak}
          timedOut={review.timedOut}
          layerBroken={!review.detail.correct}
          shieldGone={round.layersLeft <= 0}
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
