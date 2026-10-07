import type { WritingScreenerResult } from './ieltsWritingScreener';
import type { IeltsDiagnosticResult } from './ieltsDiagnosticEvidenceService';

export type IeltsSavedScreenerResult =
  | { kind: 'writing'; result: WritingScreenerResult }
  | { kind: 'objective'; result: IeltsDiagnosticResult }
  | null;

/** Completed whoami responses omit the form. Identify results from saved evidence. */
export async function loadIeltsSavedScreenerResult(
  attemptId: string,
  readWriting: (id: string) => Promise<WritingScreenerResult | null>,
  readObjective: (id: string) => Promise<IeltsDiagnosticResult | null>,
): Promise<IeltsSavedScreenerResult> {
  const writing = await readWriting(attemptId);
  if (writing) return { kind: 'writing', result: writing };
  const objective = await readObjective(attemptId);
  return objective ? { kind: 'objective', result: objective } : null;
}
