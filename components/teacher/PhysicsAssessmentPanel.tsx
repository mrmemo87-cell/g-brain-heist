import React from 'react';
import type { PhysicsAssessmentBreakdown } from '../../services/physicsAssessmentService';
import { physicsObjectiveComponentLabels } from './questionAssessment';

export default function PhysicsAssessmentPanel({ evidence }: { evidence: PhysicsAssessmentBreakdown | null }) {
  return <section aria-label="Physics assessment objectives" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-bold text-slate-900">Physics assessment objectives</h3>
    <p className="mt-1 text-sm text-slate-600">Cambridge 0654 · 2025–2027 · Physics component</p>
    {evidence && !evidence.programmeConfigured ? <p className="mt-3 text-sm text-amber-800">Confirm this teaching group’s programme and exam years before using this syllabus view for curriculum coverage.</p> : null}
    {evidence === null ? <p role="status" className="mt-3 text-sm text-amber-800">Assessment-objective evidence is currently unavailable. This is not a zero score.</p>
      : evidence.components.length === 0 ? <p className="mt-3 text-sm text-slate-600">No profiled Physics answers yet. Complete a reviewed assessment to start collecting evidence.</p>
      : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Fresh independent evidence by assessment objective component</caption>
        <thead><tr><th scope="col" className="p-2">Objective focus</th><th scope="col" className="p-2">Fresh answers correct</th><th scope="col" className="p-2">Evidence breadth</th><th scope="col" className="p-2">Practice / repeated</th></tr></thead>
        <tbody>{evidence.components.map((row) => <tr key={row.component} className="border-t border-slate-100">
          <th scope="row" className="p-2 font-medium">{row.ao} · {physicsObjectiveComponentLabels[row.component] || row.component}</th>
          <td className="p-2">{row.independentFreshCount > 0 ? `${row.independentFreshCorrectCount}/${row.independentFreshCount}` : 'No fresh evidence'}</td>
          <td className="p-2">{row.distinctQuestions} questions · {row.distinctAssignments} assignments · {row.studentsWithIndependentEvidence} students</td>
          <td className="p-2">{row.practiceOrRepeatedCount}</td>
        </tr>)}</tbody>
      </table></div>}
    <p className="mt-4 text-xs leading-5 text-slate-500">Descriptive evidence, not a predicted grade or mastery judgement. MCQs do not assess AO3 practical performance. AO component labels are Brains Heist interpretations of the syllabus; components can overlap and must not be added as separate marks.</p>
  </section>;
}
