import { CalendarCheck, Eye, FileCheck, Flame, Footprints, GraduationCap, Grid3x3, Radar, ScanSearch, type LucideIcon } from 'lucide-react';
import type { BadgeId } from '@/domain/badges';

/** Exhaustive: a new medal without an icon is a compile error. */
export const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  'first-steps': Footprints,
  'quiz-ace': GraduationCap,
  'risk-analyst': Grid3x3,
  'permit-inspector': FileCheck,
  'hazard-hunter': ScanSearch,
  'eagle-eye': Eye,
  streak: Flame,
  'daily-hero': CalendarCheck,
  'all-rounder': Radar,
};
