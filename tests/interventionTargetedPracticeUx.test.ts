import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const intervention = readFileSync('components/student-progress/TeacherInterventionIntelligencePageV2.tsx', 'utf8');
const workspace = readFileSync('components/student-progress/InterventionTargetedPracticeWorkspace.tsx', 'utf8');
const shell = readFileSync('components/TeacherPortalShell.tsx', 'utf8');

const occurrences = (source: string, value: string) => source.split(value).length - 1;

describe('Brains Heist intervention targeted-practice workflow', () => {
  it('separates actionable needs from evidence still being gathered', () => {
    expect(intervention).toContain('What can I act on now?');
    expect(intervention).toContain('What is Brains Heist watching?');
    expect(intervention).not.toContain('Lower priority');
    expect(intervention).toContain('aggregateRecommendations');
  });

  it('uses a clear evidence-review flow before targeted practice', () => {
    expect(intervention).toContain('Review evidence');
    expect(intervention).toContain('What specifically needs support?');
    expect(intervention).toContain('Keep monitoring');
    expect(intervention).toContain('Confirm need');
    expect(intervention).toContain('Create targeted practice');
  });

  it('locks intervention practice to the selected student and subject', () => {
    expect(workspace).toContain("assignment_mode: 'custom'");
    expect(workspace).toContain('student_ids: [context.student.id]');
    expect(workspace).toContain('lockedSubject={subject}');
    expect(workspace).toContain('selectedStudentIds.length !== 1');
    expect(workspace).toContain('Intervention practice is locked to the selected student.');
  });

  it('reuses canonical assignment creation and preserves intervention follow-up semantics', () => {
    expect(workspace).toContain('GameService.create_assignment');
    expect(workspace).toContain("tryConsumePilotQuota('assignments_created')");
    expect(workspace).toContain('createLearningIntervention');
    expect(workspace).toContain('Targeted-practice accuracy alone does not mark the weakness as resolved.');
    expect(occurrences(workspace, 'GameService.create_assignment')).toBe(1);
  });

  it('keeps the workflow inside the branded teacher portal shell', () => {
    expect(shell).toContain('InterventionTargetedPracticeWorkspace');
    expect(shell).toContain('onCreateTargetedPractice={openTargetedPractice}');
    expect(shell).toContain("activeLabel = targetedPractice ? 'Assignments'");
  });
});
