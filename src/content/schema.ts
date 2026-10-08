import { z } from 'zod';
import { INDUSTRIES } from '@/domain/industries';
import { CONTROL_LEVELS } from '@/domain/risk';
import { HSE_TOPICS } from '@/domain/topics';

/**
 * Content schema — used by tests and tooling only (the app trusts validated packs at runtime,
 * so zod is a devDependency and is never bundled). Import types with `import type`.
 *
 * Rules enforced here: ids are stable and language-neutral; every locale pack mirrors the
 * default locale's ids; items marked `reviewed` must cite at least one reference.
 *
 * NO `.default()` / transforms: the loader only casts raw JSON, so a default would never be
 * applied at runtime. Every field is therefore written out explicitly in the packs, and
 * content.test.ts asserts that parsing a pack returns it unchanged.
 */

const contentId = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'use lowercase, digits, "." and "-"');
const text = z.string().min(1);

export const ReferenceSchema = z.object({
  /** e.g. "ISO 45001:2018" */
  standard: text,
  clause: text.optional(),
  note: text.optional(),
});

/** draft = authored but not yet checked by an HSE professional; reviewed = checked. */
export const ReviewStatusSchema = z.enum(['draft', 'reviewed']);

/** Who checked an item and when (a calendar date). Present exactly when the item is `reviewed`. */
export const ReviewSchema = z.object({
  by: text,
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
});

const baseFields = {
  id: contentId,
  reviewStatus: ReviewStatusSchema,
  review: ReviewSchema.optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  topic: z.enum(HSE_TOPICS),
  industries: z.array(z.enum(INDUSTRIES)).min(1),
  prompt: text,
  explanation: text,
  references: z.array(ReferenceSchema),
};

interface Checkable {
  reviewStatus: 'draft' | 'reviewed';
  review?: unknown;
  references: unknown[];
}

function checkReviewed(question: Checkable, ctx: z.RefinementCtx): void {
  if (question.reviewStatus === 'reviewed' && question.references.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['references'],
      message: 'a reviewed question must cite at least one reference',
    });
  }
  checkReviewRecord(question, ctx);
}

/** The reviewer's name and date travel with the status: both present or both absent. */
function checkReviewRecord(item: { reviewStatus: 'draft' | 'reviewed'; review?: unknown }, ctx: z.RefinementCtx): void {
  if (item.reviewStatus === 'reviewed' && item.review === undefined) {
    ctx.addIssue({ code: 'custom', path: ['review'], message: 'a reviewed item must say who reviewed it and when' });
  }
  if (item.reviewStatus === 'draft' && item.review !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['review'], message: 'a draft item cannot carry a review record' });
  }
}

function checkUnique(values: string[], path: string, ctx: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: 'custom', path: [path], message: `${path} must be unique` });
  }
}

export const SingleChoiceSchema = z
  .object({
    ...baseFields,
    type: z.literal('single-choice'),
    choices: z.array(text).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex >= q.choices.length) {
      ctx.addIssue({ code: 'custom', path: ['correctIndex'], message: 'correctIndex is out of range' });
    }
    checkUnique(q.choices, 'choices', ctx);
    checkReviewed(q, ctx);
  });

/** `prompt` is the statement to judge. */
export const TrueFalseSchema = z
  .object({
    ...baseFields,
    type: z.literal('true-false'),
    answer: z.boolean(),
  })
  .superRefine(checkReviewed);

/** Pairs are listed in their correct matching; the UI shuffles the right-hand side. */
export const MatchingSchema = z
  .object({
    ...baseFields,
    type: z.literal('matching'),
    pairs: z.array(z.object({ left: text, right: text })).min(2).max(6),
  })
  .superRefine((q, ctx) => {
    checkUnique(
      q.pairs.map((p) => p.left),
      'pairs.left',
      ctx,
    );
    checkUnique(
      q.pairs.map((p) => p.right),
      'pairs.right',
      ctx,
    );
    checkReviewed(q, ctx);
  });

/** `items` are listed in their correct order; the UI shuffles them. */
export const OrderingSchema = z
  .object({
    ...baseFields,
    type: z.literal('ordering'),
    items: z.array(text).min(3).max(6),
  })
  .superRefine((q, ctx) => {
    checkUnique(q.items, 'items', ctx);
    checkReviewed(q, ctx);
  });

export const QuizQuestionSchema = z.discriminatedUnion('type', [
  SingleChoiceSchema,
  TrueFalseSchema,
  MatchingSchema,
  OrderingSchema,
]);

export const QuizPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    questions: z.array(QuizQuestionSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({ code: 'custom', path: ['questions', index, 'id'], message: `duplicate id ${question.id}` });
      }
      seen.add(question.id);
    });
  });

export type Reference = z.output<typeof ReferenceSchema>;
export type ReviewStatus = z.output<typeof ReviewStatusSchema>;
export type QuizQuestion = z.output<typeof QuizQuestionSchema>;
export type SingleChoiceQuestion = z.output<typeof SingleChoiceSchema>;
export type TrueFalseQuestion = z.output<typeof TrueFalseSchema>;
export type MatchingQuestion = z.output<typeof MatchingSchema>;
export type OrderingQuestion = z.output<typeof OrderingSchema>;
export type QuizPack = z.output<typeof QuizPackSchema>;

/* ── Risk assessment scenarios ─────────────────────────────────────────────────────────────── */

const rating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

/** One control option. Levels must be distinct within a scenario so "best" is unambiguous. */
export const ControlOptionSchema = z.object({ text: text, level: z.enum(CONTROL_LEVELS) });

export const RiskScenarioSchema = z
  .object({
    id: contentId,
    reviewStatus: ReviewStatusSchema,
    review: ReviewSchema.optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.enum(HSE_TOPICS),
    industries: z.array(z.enum(INDUSTRIES)).min(1),
    /** Short title shown as a chip. */
    title: text,
    /** The situation to assess. */
    prompt: text,
    /** The expert rating the player is compared with. */
    likelihood: rating,
    severity: rating,
    controls: z.array(ControlOptionSchema).min(3).max(5),
    explanation: text,
    references: z.array(ReferenceSchema),
  })
  .superRefine((scenario, ctx) => {
    checkUnique(
      scenario.controls.map((control) => control.level),
      'controls.level',
      ctx,
    );
    checkUnique(
      scenario.controls.map((control) => control.text),
      'controls.text',
      ctx,
    );
    checkReviewed(scenario, ctx);
  });

export const RiskPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    scenarios: z.array(RiskScenarioSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.scenarios.forEach((scenario, index) => {
      if (seen.has(scenario.id)) {
        ctx.addIssue({ code: 'custom', path: ['scenarios', index, 'id'], message: `duplicate id ${scenario.id}` });
      }
      seen.add(scenario.id);
    });
  });

export type RiskScenario = z.output<typeof RiskScenarioSchema>;
export type RiskPack = z.output<typeof RiskPackSchema>;

/* ── Find the Hazard scenes ────────────────────────────────────────────────────────────────── */

const unit = z.number().min(0).max(1);

/**
 * One hazard hidden in a scene. The hotspot is a circle in *normalised* image coordinates so it
 * survives any image size: `x`/`y` are fractions of the image width/height, and `radius` is a
 * fraction of the image WIDTH (so the circle stays round on any aspect ratio).
 */
export const HazardSpotSchema = z
  .object({
    id: contentId,
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.enum(HSE_TOPICS),
    x: unit,
    y: unit,
    radius: z.number().min(0.03).max(0.2),
    /** Short name of the hazard, shown when it is found. */
    title: text,
    explanation: text,
    /** Expert rating of the *unmitigated* risk, shown after the hazard is found. */
    likelihood: rating,
    severity: rating,
    /** The control the review recommends, with its place in the hierarchy of controls. */
    control: ControlOptionSchema,
    references: z.array(ReferenceSchema),
  });

export const HazardSceneSchema = z
  .object({
    id: contentId,
    reviewStatus: ReviewStatusSchema,
    review: ReviewSchema.optional(),
    industries: z.array(z.enum(INDUSTRIES)).min(1),
    title: text,
    /** Where this is and what is going on (shown in the hub and above the picture). */
    description: text,
    /** File stem in src/content/scenes/ (WebP, no extension). */
    image: contentId,
    imageAlt: text,
    /** Pixel size of the image file; the layout reserves the space before the image decodes. */
    width: z.number().int().min(300),
    height: z.number().int().min(300),
    hazards: z.array(HazardSpotSchema).min(3).max(15),
  })
  .superRefine((scene, ctx) => {
    checkReviewRecord(scene, ctx);
    checkUnique(
      scene.hazards.map((hazard) => hazard.id),
      'hazards.id',
      ctx,
    );
    scene.hazards.forEach((hazard, index) => {
      if (!hazard.id.startsWith(`${scene.id}.`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['hazards', index, 'id'],
          message: `hazard id must start with "${scene.id}."`,
        });
      }
      if (scene.reviewStatus === 'reviewed' && hazard.references.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['hazards', index, 'references'],
          message: 'a hazard of a reviewed scene must cite at least one reference',
        });
      }
    });
  });

export const HazardPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    scenes: z.array(HazardSceneSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.scenes.forEach((scene, index) => {
      if (seen.has(scene.id)) {
        ctx.addIssue({ code: 'custom', path: ['scenes', index, 'id'], message: `duplicate id ${scene.id}` });
      }
      seen.add(scene.id);
    });
  });

export type HazardSpot = z.output<typeof HazardSpotSchema>;
export type HazardScene = z.output<typeof HazardSceneSchema>;
export type HazardPack = z.output<typeof HazardPackSchema>;

/* ── Permit to Work cases ──────────────────────────────────────────────────────────────────── */

export const PERMIT_TYPES = ['hot-work', 'confined-space', 'work-at-height', 'electrical', 'excavation', 'lifting'] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

/** One line of the permit form. A missing item is written as a field too (e.g. value "ندارد"). */
export const PermitFieldSchema = z.object({ id: contentId, label: text, value: text });

export const PermitSectionSchema = z.object({
  title: text,
  fields: z.array(PermitFieldSchema).min(1).max(8),
});

/**
 * A hidden error. Every defect sits on at least one field of the form; flagging any one of
 * `fieldIds` counts as finding it. A permit with no defects is valid and should be approved.
 */
export const PermitDefectSchema = z.object({
  fieldIds: z.array(contentId).min(1).max(3),
  /** Approving a permit with this defect could kill someone: missing it fails the permit. */
  critical: z.boolean(),
  /** What is wrong, shown in the review. */
  why: text,
});

export const PermitCaseSchema = z
  .object({
    id: contentId,
    reviewStatus: ReviewStatusSchema,
    review: ReviewSchema.optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.literal('permit-to-work'),
    industries: z.array(z.enum(INDUSTRIES)).min(1),
    /** Short title of the job, shown as a chip. */
    title: text,
    /** The situation: who asks for what, where. */
    prompt: text,
    permitType: z.enum(PERMIT_TYPES),
    sections: z.array(PermitSectionSchema).min(2).max(6),
    defects: z.array(PermitDefectSchema).max(4),
    /** The lesson: what a careful issuer checks (and, for a valid permit, why it is valid). */
    explanation: text,
    references: z.array(ReferenceSchema),
  })
  .superRefine((permit, ctx) => {
    const fieldIds = permit.sections.flatMap((section) => section.fields.map((field) => field.id));
    checkUnique(fieldIds, 'sections.fields.id', ctx);
    const known = new Set(fieldIds);
    const used = new Set<string>();
    permit.defects.forEach((defect, index) => {
      checkUnique(defect.fieldIds, `defects.${index}.fieldIds`, ctx);
      for (const id of defect.fieldIds) {
        if (!known.has(id)) {
          ctx.addIssue({ code: 'custom', path: ['defects', index, 'fieldIds'], message: `unknown field "${id}"` });
        }
        if (used.has(id)) {
          ctx.addIssue({ code: 'custom', path: ['defects', index, 'fieldIds'], message: `field "${id}" belongs to two defects` });
        }
        used.add(id);
      }
    });
    checkReviewed(permit, ctx);
  });

export const PermitPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    permits: z.array(PermitCaseSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.permits.forEach((permit, index) => {
      if (seen.has(permit.id)) {
        ctx.addIssue({ code: 'custom', path: ['permits', index, 'id'], message: `duplicate id ${permit.id}` });
      }
      seen.add(permit.id);
    });
  });

export type PermitField = z.output<typeof PermitFieldSchema>;
export type PermitDefect = z.output<typeof PermitDefectSchema>;
export type PermitCase = z.output<typeof PermitCaseSchema>;
export type PermitPack = z.output<typeof PermitPackSchema>;

/* ── Emergency Response cases ──────────────────────────────────────────────────────────────── */

export const EMERGENCY_TYPES = ['fire', 'gas-leak', 'electric-shock', 'chemical-exposure', 'fall-injury', 'confined-space-rescue', 'bleeding', 'evacuation'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

/** best = the right move; acceptable = safe but slower, incomplete or less effective; harmful = makes it worse or endangers someone. */
export const EMERGENCY_GRADES = ['best', 'acceptable', 'harmful'] as const;
export type EmergencyGrade = (typeof EMERGENCY_GRADES)[number];

export const EmergencyOptionSchema = z.object({
  text: text,
  grade: z.enum(EMERGENCY_GRADES),
  /** What happens next because of this choice (one or two sentences). */
  consequence: text,
});

export const EmergencyStepSchema = z
  .object({
    /** What is going on right now, and what the player has to decide. */
    situation: text,
    options: z.array(EmergencyOptionSchema).min(3).max(4),
    /** Why the best option is the best. */
    why: text,
  })
  .superRefine((step, ctx) => {
    if (step.options.filter((option) => option.grade === 'best').length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'a step needs exactly one "best" option' });
    }
    if (!step.options.some((option) => option.grade === 'harmful')) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'a step needs at least one "harmful" option' });
    }
    checkUnique(
      step.options.map((option) => option.text),
      'options.text',
      ctx,
    );
  });

export const EmergencyCaseSchema = z
  .object({
    id: contentId,
    reviewStatus: ReviewStatusSchema,
    review: ReviewSchema.optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.literal('emergency'),
    industries: z.array(z.enum(INDUSTRIES)).min(1),
    /** Short title of the emergency, shown as a chip. */
    title: text,
    /** The first moments: where the player is and what they see. */
    prompt: text,
    emergencyType: z.enum(EMERGENCY_TYPES),
    steps: z.array(EmergencyStepSchema).min(3).max(5),
    /** The lesson of the whole case. */
    explanation: text,
    references: z.array(ReferenceSchema),
  })
  .superRefine(checkReviewed);

export const EmergencyPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    cases: z.array(EmergencyCaseSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.cases.forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: ['cases', index, 'id'], message: `duplicate id ${item.id}` });
      seen.add(item.id);
    });
  });

export type EmergencyOption = z.output<typeof EmergencyOptionSchema>;
export type EmergencyStep = z.output<typeof EmergencyStepSchema>;
export type EmergencyCase = z.output<typeof EmergencyCaseSchema>;
export type EmergencyPack = z.output<typeof EmergencyPackSchema>;

/* ── BowTie cases ──────────────────────────────────────────────────────────────────────────── */

/** threat = a cause; preventive = a barrier before the top event; mitigating = a barrier after it; consequence = what may follow; none = does not belong in this bowtie. */
export const BOWTIE_CATEGORIES = ['threat', 'preventive', 'mitigating', 'consequence', 'none'] as const;
export type BowtieCategory = (typeof BOWTIE_CATEGORIES)[number];

export const BowtieCardSchema = z.object({
  id: contentId,
  text: text,
  category: z.enum(BOWTIE_CATEGORIES),
  /** Why it belongs there (shown in the review). */
  why: text,
});

export const BowtieCaseSchema = z
  .object({
    id: contentId,
    reviewStatus: ReviewStatusSchema,
    review: ReviewSchema.optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.enum(HSE_TOPICS),
    industries: z.array(z.enum(INDUSTRIES)).min(1),
    /** Short title shown as a chip. */
    title: text,
    /** The hazard at the centre (something with the potential to cause harm). */
    hazard: text,
    /** The top event: the moment control of the hazard is lost. */
    topEvent: text,
    prompt: text,
    cards: z.array(BowtieCardSchema).min(8).max(14),
    explanation: text,
    references: z.array(ReferenceSchema),
  })
  .superRefine((bowtie, ctx) => {
    checkUnique(
      bowtie.cards.map((card) => card.id),
      'cards.id',
      ctx,
    );
    checkUnique(
      bowtie.cards.map((card) => card.text),
      'cards.text',
      ctx,
    );
    for (const category of ['threat', 'preventive', 'mitigating', 'consequence'] as const) {
      if (bowtie.cards.filter((card) => card.category === category).length < 2) {
        ctx.addIssue({ code: 'custom', path: ['cards'], message: `needs at least two "${category}" cards` });
      }
    }
    if (bowtie.cards.filter((card) => card.category === 'none').length > 2) {
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'at most two "none" cards' });
    }
    checkReviewed(bowtie, ctx);
  });

export const BowtiePackSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.string().min(2),
    bowties: z.array(BowtieCaseSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.bowties.forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: ['bowties', index, 'id'], message: `duplicate id ${item.id}` });
      seen.add(item.id);
    });
  });

export type BowtieCard = z.output<typeof BowtieCardSchema>;
export type BowtieCase = z.output<typeof BowtieCaseSchema>;
export type BowtiePack = z.output<typeof BowtiePackSchema>;
