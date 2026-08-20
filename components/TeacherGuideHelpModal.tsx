import React, { useState } from 'react';

interface TeacherGuideHelpModalProps {
  onClose: () => void;
  placement?: 'center' | 'header-bottom';
  headerOffsetPx?: number;
}

type TeacherGuideSection =
  | 'overview'
  | 'classes'
  | 'questions'
  | 'assignments'
  | 'progress'
  | 'support'
  | 'documents'
  | 'writing';

const sections: Array<{ id: TeacherGuideSection; icon: string; title: string; summary: string }> = [
  { id: 'overview', icon: '🧭', title: 'Teacher workspace', summary: 'Where to find the main teaching tools.' },
  { id: 'classes', icon: '🏫', title: 'My Classes', summary: 'View the classes and students allocated to you.' },
  { id: 'questions', icon: '🧠', title: 'Question Bank & My Pool', summary: 'Choose verified questions or manage your own classroom questions.' },
  { id: 'assignments', icon: '📋', title: 'Assignments', summary: 'Build, publish and review student work.' },
  { id: 'progress', icon: '📈', title: 'Reports & Academic Profiles', summary: 'Understand attainment, evidence and progress over time.' },
  { id: 'support', icon: '🎯', title: 'Student Support Plans', summary: 'Turn repeated learning needs into clear follow-up actions.' },
  { id: 'documents', icon: '🗂️', title: 'Document Center', summary: 'Find your documents and records shared with you.' },
  { id: 'writing', icon: '✍️', title: 'Writing Hub', summary: 'Monitor writing, feedback and writing evidence.' },
];

const TeacherGuideHelpModal: React.FC<TeacherGuideHelpModalProps> = ({
  onClose,
  placement = 'center',
  headerOffsetPx = 80,
}) => {
  const [activeSection, setActiveSection] = useState<TeacherGuideSection>('overview');
  const safeTopOffsetPx = Math.max(headerOffsetPx, 56);
  const isHeaderAnchored = placement === 'header-bottom';
  const topPadding = isHeaderAnchored
    ? `calc(${safeTopOffsetPx}px + env(safe-area-inset-top, 0px))`
    : '16px';
  const maxHeight = isHeaderAnchored
    ? `calc(100vh - ${safeTopOffsetPx}px - env(safe-area-inset-top, 0px) - 16px)`
    : 'calc(100vh - 32px)';

  const content: Record<TeacherGuideSection, React.ReactNode> = {
    overview: (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Teacher workspace</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use the workspace for day-to-day teaching. The menu is organised around classes, learning content, assignments, progress, support and school records.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sections.slice(1).map((section) => (
            <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-cyan-300 hover:bg-cyan-50">
              <span className="text-lg" aria-hidden="true">{section.icon}</span>
              <strong className="ml-2 text-slate-900">{section.title}</strong>
              <span className="mt-2 block text-sm leading-5 text-slate-600">{section.summary}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Access follows your school role and allocations.</strong> If a class, subject or tool is not available, check your active teacher allocation or ask the School Admin rather than using another student's or teacher's account.
        </div>
      </div>
    ),
    classes: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">My Classes</h2>
        <p className="text-sm leading-6 text-slate-600">This is your working roster. It shows only classes and students covered by your active teacher allocations.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Open <strong>My Classes</strong> to see allocated classes, subjects and students.</li>
          <li>Use search to find a student or class quickly.</li>
          <li>Use <strong>Print roster</strong> when you need a current class list.</li>
          <li>If a student is missing or in the wrong class, ask the School Admin to correct the official class roster.</li>
        </ol>
      </div>
    ),
    questions: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Question Bank & My Pool</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><strong className="text-slate-900">Brains Heist Verified</strong><p className="mt-2 text-sm leading-6 text-slate-600">Read-only governed questions mapped for official learning evidence where curriculum coverage is valid.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><strong className="text-slate-900">My Pool</strong><p className="mt-2 text-sm leading-6 text-slate-600">Your own classroom questions. You can create, edit, import and reuse them, but they do not become official Academic Profile evidence.</p></div>
        </div>
        <p className="text-sm leading-6 text-slate-700">For larger question sets, use the bulk import/paste flow and review the preview before saving.</p>
      </div>
    ),
    assignments: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Assignments</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Choose the class/students and the subject.</li>
          <li>Select assignment content that is valid for that teaching context.</li>
          <li>Save as a draft, publish now, or schedule publication when those options are available.</li>
          <li>Review submissions and results from the assignment/report views.</li>
        </ol>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Official Academic Profile evidence comes from completed, governed work. Unanswered questions are not automatically treated as weaknesses.</div>
      </div>
    ),
    progress: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Reports & Academic Profiles</h2>
        <p className="text-sm leading-6 text-slate-600">Use reports for results and Academic Profiles for the longer learning story.</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li><strong>Reports</strong> show completed work and assessment results.</li>
          <li><strong>Academic Profiles</strong> combine dated evidence from assignments, verified writing and authorised school evidence.</li>
          <li><strong>Needs support</strong> identifies specific learning areas; recurring and long-running labels require repeated evidence over time.</li>
          <li>Use the subject and date filters before generating an individual report.</li>
        </ul>
      </div>
    ),
    support: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Student Support Plans</h2>
        <p className="text-sm leading-6 text-slate-600">Support Plans help teachers respond to evidence without turning a single mistake into a permanent label.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Review the specific need and the evidence behind it.</li>
          <li>Confirm what the student should improve.</li>
          <li>Record the teaching action and how progress will be checked.</li>
          <li>Follow up with later assessed work and close the plan when the evidence supports it.</li>
        </ol>
      </div>
    ),
    documents: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Document Center</h2>
        <p className="text-sm leading-6 text-slate-600">The teacher view keeps school-wide administration separate from your own working documents.</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li><strong>My documents</strong> — records you created.</li>
          <li><strong>Shared with me</strong> — school documents explicitly shared into your scope.</li>
          <li><strong>All I can access</strong> — the combined teacher-authorised view.</li>
        </ul>
        <p className="text-sm leading-6 text-slate-600">Always check the student/class, audience and status before printing or saving a PDF.</p>
      </div>
    ),
    writing: (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Writing Hub</h2>
        <p className="text-sm leading-6 text-slate-600">Use the Writing Hub to monitor writing tasks and reviewed feedback for the students you are authorised to teach.</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Verified, Academic-Profile-ready writing evidence can contribute to the student's learning timeline.</li>
          <li>Specific corrections can support precise areas such as subject–verb agreement, verb form, punctuation or sentence control.</li>
          <li>Use the evidence as teaching guidance; the longitudinal profile decides whether a need is new, recurring, improving or resolved.</li>
        </ul>
      </div>
    ),
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4 ${isHeaderAnchored ? 'items-start' : 'items-center'}`}
      style={{ paddingTop: topPadding }}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ maxHeight }} role="dialog" aria-modal="true" aria-label="Teacher Guide and Help">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div><span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Teacher Guide & Help</span><h1 className="mt-1 text-xl font-bold">Brains Heist teacher workspace</h1></div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20" aria-label="Close teacher guide">Close</button>
        </header>

        <div className="border-b border-slate-200 p-3 lg:hidden">
          <label className="sr-only" htmlFor="teacher-guide-section">Guide section</label>
          <select id="teacher-guide-section" value={activeSection} onChange={(event) => setActiveSection(event.target.value as TeacherGuideSection)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800">
            {sections.map((section) => <option key={section.id} value={section.id}>{section.icon} {section.title}</option>)}
          </select>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 lg:block" aria-label="Teacher help sections">
            {sections.map((section) => (
              <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className={`mb-1 w-full rounded-lg px-3 py-3 text-left ${activeSection === section.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`}>
                <span className="mr-2" aria-hidden="true">{section.icon}</span><strong className="text-sm">{section.title}</strong>
              </button>
            ))}
          </nav>
          <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{content[activeSection]}</main>
        </div>
      </section>
    </div>
  );
};

export default TeacherGuideHelpModal;
