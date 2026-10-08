import { Loader, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import type { BowtieCategory } from '@/content/schema';
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
import { PlayBoard } from './BowtieBoard';
import { BowtieResult, type BowtieOutcome } from './BowtieResult';
import { BowtieReview } from './BowtieReview';
import {
  BOWTIE_TIME_LIMIT_MS,
  judgeBowtie,
  lastSeenFromAttempts,
  prepareBowtie,
  recordBowtie,
  selectBowties,
  type BowtieJudgement,
  type Placements,
  type PreparedBowtie,
} from './engine';
import styles from './BowtiePlay.module.css';
import { loadBowtieBank } from './useBowtieBank';

type View = 'loading' | 'empty' | 'error' | 'playing' | 'saving' | 'result';
type Phase = 'place' | 'review';

interface Session {
  prepared: PreparedBowtie[];
  startedAt: number;
}

interface Review {
  judgement: BowtieJudgement;
  points: number;
  timedOut: boolean;
}

type LoadedRound = { kind: 'ready'; session: Session } | { kind: 'empty' } | { kind: 'error' };

/** Picks and prepares the bowties of a round. Pure data in, data out — it never touches React state. */
async function loadRound(profile: ProfileRow): Promise<LoadedRound> {
  try {
    const [pack, attempts] = await Promise.all([loadBowtieBank(), repos().attempts.listByProfileAndGame(profile.id, 'bowtie')]);
    const rng = createRng(randomSeed());
    const bowties = selectBowties({
      bowties: pack.bowties,
      lastSeenAt: lastSeenFromAttempts(attempts),
      rng,
      experience: profile.experience,
      industry: profile.industry,
    });
    if (bowties.length === 0) return { kind: 'empty' };
    return { kind: 'ready', session: { prepared: bowties.map((bowtie) => prepareBowtie(bowtie, rng)), startedAt: Date.now() } };
  } catch {
    return { kind: 'error' };
  }
}

export function BowtiePlay() {
  const profile = useProfileStore(selectActiveProfile);
  const timedMode = useSettingsStore((state) => state.timedMode);
  const navigate = useNavigate();

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [phase, setPhase] = useState<Phase>('place');
  // The placements are a local draft: "ثبت چیدمان" is the one explicit commit of a bowtie.
  const [placements, setPlacements] = useState<Placements>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [outcome, setOutcome] = useState<BowtieOutcome | null>(null);

  const finishing = useRef(false);
  /** Judgement of every bowtie played, for the result screen. */
  const judgements = useRef(new Map<string, BowtieJudgement>());

  const submitRef = useRef<(timedOut: boolean) => void>(() => undefined);
  const timer = useQuestionTimer({
    enabled: timedMode,
    active: view === 'playing' && phase === 'place',
    limitMs: BOWTIE_TIME_LIMIT_MS,
    resetKey: round?.index ?? 0,
    onExpire: () => submitRef.current(true),
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
      setRound(startRound(result.session.prepared.map((prepared) => prepared.bowtie)));
      setPhase('place');
      setPlacements({});
      setSelected(null);
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

  function place(group: BowtieCategory) {
    if (selected === null) return;
    setPlacements((current) => ({ ...current, [selected]: group }));
    setSelected(null);
  }

  function unplace(cardId: string) {
    setPlacements((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== cardId)));
    setSelected(cardId);
  }

  /* Submitting is the one explicit commit of a bowtie: the whole arrangement is judged at once. */
  const submit = useCallback(
    (timedOut: boolean) => {
      if (!session || !round || phase !== 'place' || round.status !== 'playing') return;
      const prepared = session.prepared[round.index];
      if (!prepared) return;

      const judgement = judgeBowtie(prepared.bowtie, placements);
      feedback(judgement.correct ? 'correct' : 'shield');
      const next = recordBowtie(round, { bowtie: prepared.bowtie, judgement, elapsedMs: elapsedMs() }, timedMode);
      judgements.current.set(prepared.bowtie.id, judgement);
      setRound(next);
      setReview({ judgement, points: next.results[next.results.length - 1]?.points ?? 0, timedOut });
      setPhase('review');
    },
    [session, round, phase, placements, timedMode, elapsedMs],
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
      gameId: 'bowtie',
      contentId: 'bowtie.mixed',
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
      toReview: session.prepared
        .filter(({ bowtie }) => (creditById.get(bowtie.id) ?? 1) < 1)
        .map(({ bowtie }) => {
          const judged = judgements.current.get(bowtie.id);
          const wrong = (judged?.cards ?? []).filter((card) => !card.right).map((card) => ({ text: bowtie.cards.find((c) => c.id === card.id)!.text, belongs: card.expected }));
          return { bowtie, credit: creditById.get(bowtie.id) ?? 0, wrong };
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
    setPhase('place');
    setPlacements({});
    setSelected(null);
    setReview(null);
    restartTimer();
  }

  /* Rendering ------------------------------------------------------------------------------ */
  if (!profile) return null;

  const backToHub = () => navigate('/games/bowtie');

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
          title={view === 'empty' ? t('bowtie.empty.title') : t('quiz.error.title')}
          body={view === 'empty' ? t('bowtie.empty.body') : t('quiz.error.body')}
        />
        <Button onClick={backToHub}>{t('bowtie.result.back')}</Button>
      </div>
    );
  }

  if (view === 'result' && outcome) {
    return <BowtieResult outcome={outcome} onAgain={restart} onBack={backToHub} />;
  }

  if (!session || !round) return null;

  const currentIndex = phase === 'review' ? round.index - 1 : round.index;
  const prepared = session.prepared[currentIndex];
  if (!prepared) return null;
  const { bowtie, cards } = prepared;

  const shownNumber = Math.min(round.index + (phase === 'review' ? 0 : 1), round.total);
  const progressLabel = t('bowtie.play.of', { current: shownNumber, total: round.total });
  const seconds = Math.ceil(timer.remainingMs / 1000);
  const allPlaced = cards.every((card) => placements[card.id] !== undefined);

  return (
    <div className={styles.play}>
      <h1 className="sr-only">{t('game.bowtie.name')}</h1>
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

      {timedMode && phase === 'place' ? (
        <div className={styles.timer}>
          <ProgressBar value={timer.remainingMs / BOWTIE_TIME_LIMIT_MS} label={t('quiz.play.timeLeft', { seconds })} />
          <span className={styles.count}>{t('quiz.play.timeLeft', { seconds })}</span>
        </div>
      ) : null}

      <Card>
        <div className={styles.scenario}>
          <div className={styles.meta}>
            <Tag tone="info">{t(`topic.${bowtie.topic}`)}</Tag>
          </div>
          <h2 className={styles.prompt}>{bowtie.title}</h2>
          <p>{bowtie.prompt}</p>
        </div>
      </Card>

      {phase === 'place' ? (
        <section className={styles.step} aria-label={t('bowtie.title')}>
          <PlayBoard bowtie={bowtie} cards={cards} placements={placements} selected={selected} onSelect={setSelected} onPlace={place} onUnplace={unplace} />
          <Button size="lg" fullWidth disabled={!allPlaced} onClick={() => submit(false)}>
            {t('bowtie.play.submit')}
          </Button>
          {!allPlaced ? <p className={styles.hint}>{t('bowtie.play.submitDisabled')}</p> : null}
        </section>
      ) : null}

      {phase === 'review' && review ? (
        <BowtieReview
          bowtie={bowtie}
          judgement={review.judgement}
          points={review.points}
          streak={round.streak}
          timedOut={review.timedOut}
          layerBroken={!review.judgement.correct}
          shieldGone={round.layersLeft <= 0}
          nextLabel={round.status === 'playing' ? t('bowtie.review.next') : t('quiz.play.finish')}
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
