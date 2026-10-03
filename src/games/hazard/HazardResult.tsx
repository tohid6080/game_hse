import type { HazardScene } from '@/content/schema';
import type { RoundSummary } from '@/domain/round';
import { t } from '@/i18n';
import { Button } from '@/ui';
import type { FinishOutcome } from '../shared/finishRound';
import { RoundResult } from '../shared/RoundResult';
import type { HazardRound } from './engine';
import { HazardReview } from './HazardReview';

export interface HazardOutcome extends FinishOutcome {
  summary: RoundSummary;
  scene: HazardScene;
  imageUrl: string;
  round: HazardRound;
}

interface HazardResultProps {
  outcome: HazardOutcome;
  onAgain: () => void;
  onBack: () => void;
}

export function HazardResult({ outcome, onAgain, onBack }: HazardResultProps) {
  const { round } = outcome;
  const early =
    round.status === 'time-up'
      ? { title: t('hazard.result.timeUpTitle'), body: t('hazard.result.timeUpBody') }
      : round.status === 'gave-up'
        ? { title: t('hazard.result.gaveUpTitle'), body: t('hazard.result.gaveUpBody') }
        : null;

  return (
    <RoundResult
      summary={outcome.summary}
      outcome={outcome}
      countLabel={t('hazard.result.found')}
      brokenTitle={early?.title}
      brokenBody={early?.body}
      review={<HazardReview scene={outcome.scene} imageUrl={outcome.imageUrl} round={round} />}
      actions={
        <>
          <Button size="lg" fullWidth onClick={onAgain}>
            {t('hazard.result.again')}
          </Button>
          <Button variant="ghost" fullWidth onClick={onBack}>
            {t('hazard.result.back')}
          </Button>
        </>
      }
    />
  );
}
