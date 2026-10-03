/** Industry sectors a player can pick; content items are tagged with the sectors they apply to. */
export const INDUSTRIES = ['general', 'construction', 'oil-gas', 'manufacturing', 'energy'] as const;

export type IndustryId = (typeof INDUSTRIES)[number];

/** A "general" player sees everything; a sector player sees general items plus their own sector. */
export function appliesToIndustry(itemIndustries: readonly IndustryId[], player: IndustryId): boolean {
  return player === 'general' || itemIndustries.includes('general') || itemIndustries.includes(player);
}
