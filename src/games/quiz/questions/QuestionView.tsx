import type { PreparedQuestion, QuizAnswer } from '../engine';
import { ChoiceQuestion } from './ChoiceQuestion';
import { MatchingQuestion } from './MatchingQuestion';
import { OrderingQuestion } from './OrderingQuestion';
import { TrueFalseQuestion } from './TrueFalseQuestion';

interface QuestionViewProps {
  prepared: PreparedQuestion;
  phase: 'answering' | 'reviewing';
  hidden: ReadonlySet<number>;
  hint: { available: boolean; onUse: () => void };
  onSubmit: (answer: QuizAnswer) => void;
}

/** Renders the right input for a question type. Mount with `key={question.id}` so state resets per question. */
export function QuestionView({ prepared, phase, hidden, hint, onSubmit }: QuestionViewProps) {
  switch (prepared.type) {
    case 'single-choice':
      return <ChoiceQuestion prepared={prepared} phase={phase} hidden={hidden} hint={hint} onSubmit={onSubmit} />;
    case 'true-false':
      return <TrueFalseQuestion prepared={prepared} phase={phase} onSubmit={onSubmit} />;
    case 'matching':
      return <MatchingQuestion prepared={prepared} phase={phase} onSubmit={onSubmit} />;
    case 'ordering':
      return <OrderingQuestion prepared={prepared} phase={phase} onSubmit={onSubmit} />;
  }
}
