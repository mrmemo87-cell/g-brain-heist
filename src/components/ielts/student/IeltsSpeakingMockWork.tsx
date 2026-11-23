// Diagnostic Bible 10.12 / Visual & UX Bible 13.14: a Speaking practice mock a teacher gave is work like any other,
// so it shows where students look for work — Home ("New for you", "Pick up where you left off") and Assignments —
// not only on Journey. Read-only; nothing renders when there is no mock, so other students see no change.
import React, { useEffect, useState } from 'react';
import { mockHome, type MockHome } from '../../../../services/ieltsSpeakingMockService';
import IeltsWorkCard from './IeltsWorkCard';
import { IeltsCardGroup } from './IeltsStudentShell';

export type StudentMock = NonNullable<MockHome['mocks']>[number];

/** undefined while checking, [] when there is none (or the check failed: Home must still load). */
export function useSpeakingMocks(): StudentMock[] | undefined {
  const [mocks, setMocks] = useState<StudentMock[] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    mockHome()
      .then((h) => { if (live) setMocks(h?.available ? h.mocks ?? [] : []); })
      .catch(() => { if (live) setMocks([]); });
    return () => { live = false; };
  }, []);
  return mocks;
}

export const MOCK_META = 'About 15 minutes · recorded examiner · not an official IELTS test';

export function SpeakingMockWorkCard({ mock, index = 0 }: { mock: StudentMock; index?: number }) {
  const going = mock.state === 'in_progress';
  const finished = mock.state === 'finished' || mock.state === 'reviewed';
  return (
    <IeltsWorkCard
      index={index}
      tone={going ? 'continue' : finished ? (mock.state === 'reviewed' ? 'done' : 'waiting') : 'new'}
      chip={going ? 'In progress' : mock.state === 'reviewed' ? 'Checked' : finished ? 'Finished' : 'New'}
      kicker="Speaking · practice mock"
      skill="speaking"
      title={mock.title}
      meta={finished ? (mock.state === 'reviewed' ? 'Your teacher shared feedback.' : 'Your teacher will check it.') : MOCK_META}
      action={finished
        ? { label: 'Open →', to: '/ielts/speaking-mock', quiet: true }
        : { label: going ? 'Continue the mock →' : 'Start the mock →', to: `/ielts/speaking-mock/${mock.assignment_id}` }}
    />
  );
}

/**
 * Assignments and Targeted tabs (UX Bible 13.14, 1.23.1): one "Speaking practice mock" group, folded closed by
 * default, open mocks first, then finished ones. The count is what is still to do. Nothing when there is no mock.
 */
export function SpeakingMockGroup() {
  const mocks = useSpeakingMocks() ?? [];
  if (!mocks.length) return null;
  const open = mocks.filter((m) => m.state === 'ready' || m.state === 'in_progress');
  const done = mocks.filter((m) => m.state === 'finished' || m.state === 'reviewed');
  return (
    <div className="isn-groups isn-mock-group">
      <IeltsCardGroup title="Speaking practice mock" count={open.length ? `${open.length} to do` : `${done.length} finished`} tone={open.length ? 'todo' : 'done'} defaultOpen={false}>
        <div className="isn-cards">{[...open, ...done].map((m, i) => <SpeakingMockWorkCard key={m.assignment_id} mock={m} index={i} />)}</div>
      </IeltsCardGroup>
    </div>
  );
}
