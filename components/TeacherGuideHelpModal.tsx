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
  | 'writing'
  | 'geometry'
  | 'lockdown';

const sections: Array<{ id: TeacherGuideSection; icon: string; title: string; summary: string }> = [
  { id: 'overview', icon: '🧭', title: 'Teacher workspace', summary: 'A quick map of the tools teachers use every day.' },
  { id: 'classes', icon: '🏫', title: 'My Classes', summary: 'See only the classes and students allocated to you.' },
  { id: 'questions', icon: '🧠', title: 'Question Bank & My Pool', summary: 'Use verified content or build classroom questions.' },
  { id: 'assignments', icon: '📋', title: 'Assignments', summary: 'Build, publish, schedule and review student work.' },
  { id: 'progress', icon: '📈', title: 'Reports & Academic Profiles', summary: 'Read results and longer-term learning evidence.' },
  { id: 'support', icon: '🎯', title: 'Student Support Plans', summary: 'Turn repeated needs into clear teaching follow-up.' },
  { id: 'writing', icon: '✍️', title: 'Writing Hub', summary: 'Monitor writing, reviewed feedback and writing evidence.' },
  { id: 'geometry', icon: '📐', title: 'Geometry Diagrams', summary: 'Create clean diagrams for question images and interactive tasks.' },
  { id: 'lockdown', icon: '🔒', title: 'Lockdown Mode', summary: 'Run an official live class battle from the teacher workspace.' },
];

const TeacherGuideHelpModal: React.FC<TeacherGuideHelpModalProps> = ({ onClose, placement = 'center', headerOffsetPx = 80 }) => {
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
    overview: <div className="space-y-4"><div><h2 className="text-2xl font-bold text-slate-900">Teacher workspace</h2><p className="mt-2 text-sm leading-6 text-slate-600">Use this workspace for your allocated classes, learning content, assignments, progress, support and live classroom activities. School-wide administration stays in the School Admin or School Head workspace.</p></div><div className="grid gap-3 md:grid-cols-2">{sections.slice(1).map((section) => <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-cyan-300 hover:bg-cyan-50"><span className="text-lg" aria-hidden="true">{section.icon}</span><strong className="ml-2 text-slate-900">{section.title}</strong><span className="mt-2 block text-sm leading-5 text-slate-600">{section.summary}</span></button>)}</div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Access follows your school allocations.</strong> If a class or subject is missing, ask the School Admin to check your active allocation rather than working around the roster.</div></div>,
    classes: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">My Classes</h2><p className="text-sm leading-6 text-slate-600">This is your authorised teaching roster.</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Open <strong>My Classes</strong> to see allocated classes, subjects and students.</li><li>Use search to find a student or class quickly.</li><li>Use <strong>Print roster</strong> when you need a current class list.</li><li>Roster changes belong to School Administration.</li></ol></div>,
    questions: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Question Bank & My Pool</h2><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><strong className="text-slate-900">Brains Heist Verified</strong><p className="mt-2 text-sm leading-6 text-slate-600">Read-only governed questions used as official learning evidence only when curriculum mapping is valid.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><strong className="text-slate-900">My Pool</strong><p className="mt-2 text-sm leading-6 text-slate-600">Your classroom questions. Create, edit, bulk import and reuse them without changing the official question bank.</p></div></div></div>,
    assignments: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Assignments</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Choose the class or students and subject.</li><li>Select valid content for that teaching context.</li><li>Save a draft, publish now, or schedule publication.</li><li>Review submissions and results from the assignment/report views.</li></ol><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Official Academic Profile evidence comes from completed, governed work. An unanswered question is not automatically a weakness.</div></div>,
    progress: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Reports & Academic Profiles</h2><p className="text-sm leading-6 text-slate-600">Reports answer “how did the student do?” Academic Profiles answer “what is changing over time?”</p><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700"><li><strong>Reports</strong> show completed work and assessment results.</li><li><strong>Academic Profiles</strong> combine dated evidence from authorised assignments and verified writing.</li><li><strong>Needs support</strong> shows specific current learning needs; repeated labels require repeated evidence.</li><li>Use subject and date filters before generating an individual report.</li></ul></div>,
    support: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Student Support Plans</h2><p className="text-sm leading-6 text-slate-600">Use support plans when the evidence is strong enough to justify a teaching response.</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Review the specific need and evidence.</li><li>Confirm what should improve.</li><li>Record the teaching action and follow-up evidence.</li><li>Close the plan only when later assessed work supports it.</li></ol></div>,
    writing: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Writing Hub</h2><p className="text-sm leading-6 text-slate-600">Use Writing Hub to monitor writing tasks and reviewed feedback for authorised students.</p><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Verified, Academic-Profile-ready writing can enter the student's learning timeline.</li><li>Corrections can identify precise areas such as verb form, subject–verb agreement, punctuation and sentence control.</li><li>Use the evidence for teaching; the longitudinal profile decides whether a need is new, recurring, improving or resolved.</li></ul></div>,
    geometry: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Geometry Diagrams</h2><p className="text-sm leading-6 text-slate-600">Use the diagram builder when a question needs a clean visual rather than a screenshot or hand-drawn image.</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Build the figure from lines, angles, points, circles and the shape library.</li><li>Add labels with the Labels & annotations control, then move or resize them on the canvas.</li><li>Export a high-resolution PNG and attach it to a normal question, or add answer blanks for an interactive diagram question.</li></ol></div>,
    lockdown: <div className="space-y-4"><h2 className="text-2xl font-bold text-slate-900">Lockdown Mode</h2><p className="text-sm leading-6 text-slate-600">The Lockdown Mode quick action opens the official class-battle workspace.</p><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700"><li>Choose the class/room and permitted subject scope.</li><li>Select questions from the available pools.</li><li>Review the setup before starting the live activity.</li></ol></div>,
  };

  return <div className={`fixed inset-0 z-50 flex justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4 ${isHeaderAnchored ? 'items-start' : 'items-center'}`} style={{ paddingTop: topPadding }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ maxHeight }} role="dialog" aria-modal="true" aria-label="Teacher Guide and Help"><header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white"><div><span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Teacher Guide & Help</span><h1 className="mt-1 text-xl font-bold">Brains Heist teacher workspace</h1></div><button type="button" onClick={onClose} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20" aria-label="Close teacher guide">Close</button></header><div className="border-b border-slate-200 p-3 lg:hidden"><label className="sr-only" htmlFor="teacher-guide-section">Guide section</label><select id="teacher-guide-section" value={activeSection} onChange={(event) => setActiveSection(event.target.value as TeacherGuideSection)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800">{sections.map((section) => <option key={section.id} value={section.id}>{section.icon} {section.title}</option>)}</select></div><div className="flex min-h-0 flex-1 overflow-hidden"><nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 lg:block" aria-label="Teacher help sections">{sections.map((section) => <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className={`mb-1 w-full rounded-lg px-3 py-3 text-left ${activeSection === section.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`}><span className="mr-2" aria-hidden="true">{section.icon}</span><strong className="text-sm">{section.title}</strong></button>)}</nav><main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{content[activeSection]}</main></div></section></div>;
};

export default TeacherGuideHelpModal;
