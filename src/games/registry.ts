import {
  FileCheck,
  GraduationCap,
  Grid3x3,
  ScanSearch,
  Siren,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Competency } from '@/domain/competencies';
import type { GameId } from './ids';

/** `core` games ship in v1 with full depth; `later` games arrive in later phases. */
export type GameTier = 'core' | 'later';
export type GameStatus = 'planned' | 'in-development' | 'available';

export interface GameDefinition {
  id: GameId;
  tier: GameTier;
  status: GameStatus;
  competency: Competency;
  icon: LucideIcon;
  /** Entry route once the game is `available`. */
  route?: string;
}

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'quiz',
    tier: 'core',
    status: 'available',
    competency: 'knowledge',
    icon: GraduationCap,
    route: '/games/quiz',
  },
  {
    id: 'findHazard',
    tier: 'core',
    status: 'available',
    competency: 'hazardId',
    icon: ScanSearch,
    route: '/games/hazard',
  },
  {
    id: 'riskAssessment',
    tier: 'core',
    status: 'available',
    competency: 'riskAssessment',
    icon: Grid3x3,
    route: '/games/risk',
  },
  { id: 'emergency', tier: 'later', status: 'planned', competency: 'emergency', icon: Siren },
  { id: 'permit', tier: 'later', status: 'planned', competency: 'permit', icon: FileCheck },
  { id: 'bowtie', tier: 'later', status: 'planned', competency: 'barrierThinking', icon: Workflow },
];

export function gamesByTier(tier: GameTier): GameDefinition[] {
  return GAMES.filter((game) => game.tier === tier);
}
