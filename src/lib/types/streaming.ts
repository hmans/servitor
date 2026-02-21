import type { AskUserQuestion } from '$lib/server/agents/types';

export type StreamingPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool: string; input: string; toolUseId: string }
  | { type: 'enter_plan'; toolUseId: string; answered: boolean }
  | {
      type: 'ask_user';
      toolUseId: string;
      questions: AskUserQuestion[];
      answered: boolean;
      submittedAnswers?: Record<string, string>;
    }
  | {
      type: 'exit_plan';
      toolUseId: string;
      allowedPrompts?: Array<{ tool: string; prompt: string }>;
      planContent?: string;
      planFilePath?: string;
      answered: boolean;
    };

/** Format ask_user answers into a human-readable string for the message content. */
export function formatAnswer(
  questions: AskUserQuestion[],
  answers: Record<string, string>
): string {
  const parts: string[] = [];
  for (const q of questions) {
    const answer = answers[q.question];
    if (answer) {
      parts.push(`For "${q.question}", I selected: ${answer}`);
    }
  }
  return parts.join('\n\n');
}
