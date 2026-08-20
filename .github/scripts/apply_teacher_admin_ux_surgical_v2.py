from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match in {path}, found {count}")
    file.write_text(source.replace(old, new, 1))


def append_once(path: str, marker: str, content: str, label: str) -> None:
    file = Path(path)
    source = file.read_text()
    if marker in source:
        raise SystemExit(f"{label}: marker already present in {path}")
    file.write_text(source + content)


# ---------------------------------------------------------------------------
# Teacher portal: keep academic tools in-app, remove teacher documents,
# stop forced page scrolling, simplify Lockdown quick action, teacher help.
# ---------------------------------------------------------------------------
teacher = 'components/TeacherPortal.tsx'
replace_once(
    teacher,
    "const HelpModal = React.lazy(() => import('./HelpModal'));",
    "const TeacherGuideHelpModal = React.lazy(() => import('./TeacherGuideHelpModal'));",
    'teacher-specific help import',
)
replace_once(
    teacher,
    "const SchoolDocumentCenter = React.lazy(() => import('../src/components/SchoolDocumentCenter'));",
    "const TeacherAcademicProfilesPage = React.lazy(() => import('./student-progress/TeacherAcademicProfilesPage'));\nconst TeacherInterventionIntelligencePage = React.lazy(() => import('./student-progress/TeacherInterventionIntelligencePage'));",
    'teacher academic lazy imports',
)
replace_once(
    teacher,
    "const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete, onLogout, onLockdown, isSchoolAdmin, onOpenSchoolAdmin, initialView = 'dashboard' }) => {",
    "const TeacherPortal: React.FC<TeacherPortalProps> = ({ profile, onComplete, onLogout, isSchoolAdmin, onOpenSchoolAdmin, initialView = 'dashboard' }) => {",
    'drop unused Lockdown prop destructure',
)
replace_once(
    teacher,
    "export type PortalView = 'dashboard' | 'students' | 'create-question' | 'question-bank' | 'csv-upload' | 'assignments' | 'create-assignment' | 'reports' | 'report-detail' | 'report-analysis' | 'collective-report' | 'documents' | 'writing-hub' | 'writing-monitoring' | 'writing-analytics' | 'writing-export-center' | 'clan-wars' | 'geometry-diagrams' | 'cambridge-reports' | 'join-school';",
    "export type PortalView = 'dashboard' | 'students' | 'create-question' | 'question-bank' | 'csv-upload' | 'assignments' | 'create-assignment' | 'reports' | 'report-detail' | 'report-analysis' | 'collective-report' | 'academic-profiles' | 'interventions' | 'documents' | 'writing-hub' | 'writing-monitoring' | 'writing-analytics' | 'writing-export-center' | 'clan-wars' | 'geometry-diagrams' | 'cambridge-reports' | 'join-school';",
    'academic portal views',
)
replace_once(
    teacher,
    "type TeacherNavSection = 'dashboard' | 'students' | 'questions' | 'assignments' | 'reports' | 'academic-profiles' | 'interventions' | 'documents' | 'writing-hub' | 'cambridge' | 'clan-wars' | 'join-school';",
    "type TeacherNavSection = 'dashboard' | 'students' | 'questions' | 'assignments' | 'reports' | 'academic-profiles' | 'interventions' | 'writing-hub' | 'cambridge' | 'clan-wars' | 'join-school';",
    'remove teacher documents nav section',
)
replace_once(
    teacher,
    "  'collective-report': FEATURE_KEYS.REPORTS,\n  documents: FEATURE_KEYS.REPORTS,",
    "  'collective-report': FEATURE_KEYS.REPORTS,\n  'academic-profiles': FEATURE_KEYS.REPORTS,\n  interventions: FEATURE_KEYS.REPORTS,",
    'academic view entitlement map',
)
replace_once(
    teacher,
    "  interventions: FEATURE_KEYS.REPORTS,\n  documents: FEATURE_KEYS.REPORTS,\n  'writing-hub': FEATURE_KEYS.WRITING_HUB,",
    "  interventions: FEATURE_KEYS.REPORTS,\n  'writing-hub': FEATURE_KEYS.WRITING_HUB,",
    'remove documents section entitlement',
)
replace_once(
    teacher,
    "  const normalizedInitialView: PortalView =\n    ['writing-monitoring', 'writing-analytics', 'writing-export-center'].includes(initialView)\n      ? 'writing-hub'\n      : initialView;",
    "  const normalizedInitialView: PortalView =\n    initialView === 'documents'\n      ? 'dashboard'\n      : ['writing-monitoring', 'writing-analytics', 'writing-export-center'].includes(initialView)\n        ? 'writing-hub'\n        : initialView;",
    'fail closed legacy teacher documents initial view',
)
replace_once(
    teacher,
    "    if (view === 'students') return 'students';\n    if (view === 'documents') return 'documents';\n    if (view === 'join-school') return 'join-school';",
    "    if (view === 'students') return 'students';\n    if (view === 'academic-profiles') return 'academic-profiles';\n    if (view === 'interventions') return 'interventions';\n    if (view === 'documents') return 'dashboard';\n    if (view === 'join-school') return 'join-school';",
    'academic primary navigation state',
)
replace_once(
    teacher,
    "\n    if (section === 'academic-profiles') {\n      window.location.assign('/teacher-academic-profiles.html');\n      return;\n    }\n\n    if (section === 'interventions') {\n      window.location.assign('/teacher-interventions.html');\n      return;\n    }",
    "",
    'remove full-page academic navigation',
)
replace_once(
    teacher,
    "      case 'documents':\n        setView('documents');\n        break;\n      case 'writing-hub':",
    "      case 'academic-profiles':\n        setView('academic-profiles');\n        break;\n      case 'interventions':\n        setView('interventions');\n        break;\n      case 'writing-hub':",
    'academic switch cases',
)
replace_once(
    teacher,
    "    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));\n",
    "",
    'stop teacher tab page jump',
)
replace_once(
    teacher,
    "    ...(profile.school_id ? [{ id: 'documents' as const, label: 'Document Center', icon: '🗃️', description: 'Print History & Reprints', proOnly: true }] : []),\n",
    "",
    'remove teacher document center tab',
)
replace_once(
    teacher,
    "      interventions: 'Performance Reports',\n      documents: 'Performance Reports',\n      'writing-hub': 'Performance Reports',",
    "      interventions: 'Performance Reports',\n      'writing-hub': 'Performance Reports',",
    'remove teacher documents quota entry',
)
replace_once(
    teacher,
    "          {view === 'reports' && renderReports()}\n          {view === 'documents' && profile.school_id && <SchoolDocumentCenter schoolId={profile.school_id} mode=\"teacher\" />}\n          {view === 'writing-hub' && canAccessWritingInsights && (",
    "          {view === 'reports' && renderReports()}\n          {view === 'academic-profiles' && (\n            <React.Suspense fallback={<div className=\"teacher-section-loading\">Preparing Academic Profiles…</div>}>\n              <TeacherAcademicProfilesPage onBack={() => setView('dashboard')} />\n            </React.Suspense>\n          )}\n          {view === 'interventions' && (\n            <React.Suspense fallback={<div className=\"teacher-section-loading\">Preparing Student Support Plans…</div>}>\n              <TeacherInterventionIntelligencePage onBack={() => setView('dashboard')} />\n            </React.Suspense>\n          )}\n          {view === 'writing-hub' && canAccessWritingInsights && (",
    'embed teacher academic tools',
)
replace_once(
    teacher,
    "          {/* Clan Wars follows the Clans entitlement; Lockdown remains Free. */}\n          {(() => {\n            const clanLocked = !canUseTeacherFeature(FEATURE_KEYS.CLANS);\n            return (\n              <button\n                onClick={() => !clanLocked ? setView('clan-wars') : showFeatureUnavailable('Clan Wars')}\n                className={`teacher-action-card teacher-action-card-lockdown teacher-action-card--mini ${clanLocked ? 'opacity-50 cursor-not-allowed' : ''}`}\n                data-color=\"emerald\"\n                disabled={clanLocked}\n              >\n                {clanLocked && <span className=\"teacher-pro-badge\">PRO</span>}\n                <div className=\"teacher-action-icon\">⚔️</div>\n                <h4 className=\"teacher-action-title\">Clan Wars</h4>\n                <p className=\"teacher-action-desc\">Host an official class battle</p>\n              </button>\n            );\n          })()}\n\n          {onLockdown && (\n            <button\n              onClick={onLockdown}\n              className=\"teacher-action-card teacher-action-card-lockdown teacher-action-card--mini\"\n              data-color=\"rose\"\n            >\n              {effectiveEntitlements?.plan === 'free' && <span className=\"teacher-free-badge\">FREE</span>}\n              <div className=\"teacher-action-icon\">🔒</div>\n              <h4 className=\"teacher-action-title\">Lockdown Mode</h4>\n              <p className=\"teacher-action-desc\">Host or join a live room-code heist</p>\n            </button>\n          )}",
    "          {/* Lockdown Mode opens the official class-battle workspace. */}\n          {(() => {\n            const lockdownLocked = !canUseTeacherFeature(FEATURE_KEYS.CLANS);\n            return (\n              <button\n                onClick={() => !lockdownLocked ? setView('clan-wars') : showFeatureUnavailable('Lockdown Mode')}\n                className={`teacher-action-card teacher-action-card-lockdown teacher-action-card--mini ${lockdownLocked ? 'opacity-50 cursor-not-allowed' : ''}`}\n                data-color=\"emerald\"\n                disabled={lockdownLocked}\n              >\n                {lockdownLocked && <span className=\"teacher-pro-badge\">PRO</span>}\n                <div className=\"teacher-action-icon\">🔒</div>\n                <h4 className=\"teacher-action-title\">Lockdown Mode</h4>\n                <p className=\"teacher-action-desc\">Run an official live class battle</p>\n              </button>\n            );\n          })()}",
    'single Lockdown quick action',
)
replace_once(
    teacher,
    "        <HelpModal\n          onClose={() => setShowHelp(false)}",
    "        <TeacherGuideHelpModal\n          onClose={() => setShowHelp(false)}",
    'teacher guide render',
)

# ---------------------------------------------------------------------------
# Settings: expose the existing student-quality interface color chooser to
# teachers. Same context/storage, no new persistence mechanism.
# ---------------------------------------------------------------------------
settings = 'components/SettingsModal.tsx'
replace_once(
    settings,
    "              {profile.role === 'student' ? (\n                <fieldset className=\"border-t border-gray-700 pt-4\">",
    "              {(profile.role === 'student' || profile.role === 'teacher') ? (\n                <fieldset className=\"border-t border-gray-700 pt-4\">",
    'teacher interface color visibility',
)
replace_once(
    settings,
    'role="radiogroup" aria-label="Student dashboard interface color"',
    'role="radiogroup" aria-label="Dashboard interface color"',
    'generic dashboard color aria label',
)

# ---------------------------------------------------------------------------
# Teacher theme: taller independent sidebar and role-visible color parity.
# ---------------------------------------------------------------------------
theme = 'src/styles/teacher-theme.css'
replace_once(
    theme,
    "  top: 88px;\n  z-index: 5;\n  max-height: calc(100vh - 104px);\n  max-height: calc(100dvh - 104px);",
    "  top: 72px;\n  z-index: 5;\n  max-height: calc(100vh - 84px);\n  max-height: calc(100dvh - 84px);",
    'taller teacher sidebar viewport',
)
append_once(
    theme,
    'TEACHER DASHBOARD INTERFACE COLOR PARITY',
    r'''

/* ============================================================
   TEACHER DASHBOARD INTERFACE COLOR PARITY
   Uses the same saved interface colour selected in Settings.
   ============================================================ */
body[data-student-theme-color="blue"] .teacher-portal {
  --teacher-primary: #0ea5e9;
  --teacher-primary-dark: #0369a1;
  --teacher-primary-light: #38bdf8;
  --teacher-accent: #6366f1;
  --teacher-primary-soft: #e0f2fe;
  --teacher-primary-ink: #075985;
  --teacher-gradient-primary: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%);
}
body[data-student-theme-color="pink"] .teacher-portal {
  --teacher-primary: #ec4899;
  --teacher-primary-dark: #be185d;
  --teacher-primary-light: #f472b6;
  --teacher-accent: #a855f7;
  --teacher-primary-soft: #fce7f3;
  --teacher-primary-ink: #9d174d;
  --teacher-gradient-primary: linear-gradient(135deg, #ec4899 0%, #a855f7 100%);
}
body[data-student-theme-color="green"] .teacher-portal {
  --teacher-primary: #10b981;
  --teacher-primary-dark: #047857;
  --teacher-primary-light: #34d399;
  --teacher-accent: #14b8a6;
  --teacher-primary-soft: #d1fae5;
  --teacher-primary-ink: #065f46;
  --teacher-gradient-primary: linear-gradient(135deg, #10b981 0%, #14b8a6 100%);
}
body[data-student-theme-color="purple"] .teacher-portal {
  --teacher-primary: #8b5cf6;
  --teacher-primary-dark: #6d28d9;
  --teacher-primary-light: #a78bfa;
  --teacher-accent: #ec4899;
  --teacher-primary-soft: #ede9fe;
  --teacher-primary-ink: #5b21b6;
  --teacher-gradient-primary: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
}
body[data-student-theme-color="red"] .teacher-portal {
  --teacher-primary: #ef4444;
  --teacher-primary-dark: #b91c1c;
  --teacher-primary-light: #fb7185;
  --teacher-accent: #f59e0b;
  --teacher-primary-soft: #fee2e2;
  --teacher-primary-ink: #991b1b;
  --teacher-gradient-primary: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%);
}
body[data-student-theme-color="dark"] .teacher-portal {
  --teacher-primary: #475569;
  --teacher-primary-dark: #1e293b;
  --teacher-primary-light: #94a3b8;
  --teacher-accent: #0ea5e9;
  --teacher-primary-soft: #e2e8f0;
  --teacher-primary-ink: #1e293b;
  --teacher-gradient-primary: linear-gradient(135deg, #475569 0%, #0ea5e9 100%);
}
.teacher-portal .teacher-nav-btn.active,
.teacher-portal .teacher-cambridge-tab.active,
.teacher-portal .teacher-btn-primary {
  background: var(--teacher-gradient-primary);
}
.teacher-portal .teacher-header-badge {
  background: var(--teacher-primary-soft, #e0f2fe);
  border-color: var(--teacher-primary-light);
  color: var(--teacher-primary-ink, #075985);
}
.teacher-portal .teacher-sidebar-toggle:hover {
  border-color: var(--teacher-primary-light);
  background: var(--teacher-primary-soft, #f0f9ff);
  color: var(--teacher-primary-dark);
}
.teacher-portal .teacher-sidebar-toggle:focus-visible,
.teacher-portal .teacher-nav-btn:focus-visible {
  outline-color: var(--teacher-primary-light);
}
''',
    'teacher color parity css',
)

# ---------------------------------------------------------------------------
# School Head: direct entry into the same admin/head-only Document Center.
# No SchoolHeadTab/RPC destination semantics are changed.
# ---------------------------------------------------------------------------
head = 'components/SchoolHeadPortal.tsx'
replace_once(
    head,
    "          {onOpenTeacherPortal && <div className=\"school-head-sidebar-actions\"><p>Workspaces</p><button type=\"button\" onClick={onOpenTeacherPortal}>Teacher Workspace <span>→</span></button></div>}",
    "          <div className=\"school-head-sidebar-actions\"><p>Workspaces</p><button type=\"button\" onClick={() => openAdministration('documents')}>Document Center <span>→</span></button>{onOpenTeacherPortal && <button type=\"button\" onClick={onOpenTeacherPortal}>Teacher Workspace <span>→</span></button>}</div>",
    'school head document center desktop access',
)
replace_once(
    head,
    "              {HEAD_TABS.map((tab) => <button key={tab.id} type=\"button\" onClick={() => selectTab(tab.id)} className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined}><span className=\"school-admin-mobile-menu-icon school-head-mobile-menu-icon\"><HeadNavIcon tab={tab.id} /></span><span><strong>{tab.label}</strong><small>{tab.description}</small></span></button>)}\n            </div>",
    "              {HEAD_TABS.map((tab) => <button key={tab.id} type=\"button\" onClick={() => selectTab(tab.id)} className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined}><span className=\"school-admin-mobile-menu-icon school-head-mobile-menu-icon\"><HeadNavIcon tab={tab.id} /></span><span><strong>{tab.label}</strong><small>{tab.description}</small></span></button>)}\n              <button type=\"button\" onClick={() => { setMobileMenuOpen(false); openAdministration('documents'); }}><span className=\"school-admin-mobile-menu-icon school-head-mobile-menu-icon\" aria-hidden=\"true\">🗂️</span><span><strong>Document Center</strong><small>Print Center and document history</small></span></button>\n            </div>",
    'school head document center mobile access',
)

# ---------------------------------------------------------------------------
# Geometry authoring: explicit labels, professional workflow, preserve editable
# shape model inside the existing diagram JSON payload.
# ---------------------------------------------------------------------------
toolbar = 'components/geometry/DiagramToolbar.tsx'
replace_once(
    toolbar,
    "  { id: 'point', icon: '•', label: 'Point' },\n  { id: 'text', icon: 'T', label: 'Text' },\n  { id: 'blank', icon: '▢', label: 'Blank' },",
    "  { id: 'point', icon: '•', label: 'Point' },\n  { id: 'blank', icon: '▢', label: 'Blank' },",
    'remove dummy geometry text tool',
)
replace_once(
    toolbar,
    "            <li>• Double-click text to edit</li>",
    "            <li>• Add labels above the canvas</li>",
    'geometry label guidance',
)

builder = 'components/geometry/DiagramBuilder.tsx'
replace_once(
    builder,
    "  const [editingTextId, setEditingTextId] = useState<string | null>(null);\n  const [editingTextValue, setEditingTextValue] = useState('');",
    "  const [editingTextId, setEditingTextId] = useState<string | null>(null);\n  const [editingTextValue, setEditingTextValue] = useState('');\n  const [labelDraft, setLabelDraft] = useState('');\n  const [labelFontSize, setLabelFontSize] = useState(24);",
    'geometry label state',
)
replace_once(
    builder,
    "      diagramWithBlanks.blanks = blanks;\n      const finalDiagramJson = JSON.stringify(diagramWithBlanks);",
    "      diagramWithBlanks.blanks = blanks;\n      diagramWithBlanks.brainHeistDiagramVersion = 2;\n      diagramWithBlanks.brainHeistShapes = shapes;\n      const finalDiagramJson = JSON.stringify(diagramWithBlanks);",
    'persist editable geometry shapes',
)
replace_once(
    builder,
    "      // Restore shapes (would need to parse from Konva JSON)\n      // For now, just load the blanks with their answers\n      setTitle(question.title);",
    "      // Newer diagrams keep an explicit editable shape model alongside the\n      // existing Konva JSON. Older saved diagrams remain backward-compatible.\n      setShapes(Array.isArray(diagramData.brainHeistShapes) ? diagramData.brainHeistShapes : []);\n      setSelectedShapeIds([]);\n      setTitle(question.title);",
    'restore editable geometry shapes',
)
replace_once(
    builder,
    "  // Add math symbol as text shape\n  const handleAddSymbol = (symbol: string) => {",
    "  const handleAddLabel = () => {\n    const text = labelDraft.trim();\n    if (!text) return;\n    const id = generateShapeId('text');\n    const offset = shapes.filter((shape) => shape.type === 'text').length % 6;\n    const newLabel: DiagramShape = {\n      id,\n      type: 'text',\n      x: 90 + offset * 24,\n      y: 80 + offset * 22,\n      text,\n      fontSize: labelFontSize,\n      fill: '#f8fafc',\n      fontFamily: 'Arial',\n    };\n    setShapes((current) => [...current, newLabel]);\n    setSelectedShapeIds([id]);\n    setActiveTool('select');\n    setLabelDraft('');\n  };\n\n  // Add math symbol as text shape\n  const handleAddSymbol = (symbol: string) => {",
    'explicit geometry label creation',
)
replace_once(
    builder,
    "  const saveTextEdit = () => {\n    if (editingTextId) {\n      setShapes(shapes.map(s =>\n        s.id === editingTextId\n          ? { ...s, text: editingTextValue }\n          : s\n      ));\n      setEditingTextId(null);\n      setEditingTextValue('');\n    }\n  };",
    "  const saveTextEdit = () => {\n    if (editingTextId) {\n      const nextText = editingTextValue.trim();\n      if (!nextText) return;\n      setShapes((current) => current.map((shape) =>\n        shape.id === editingTextId ? { ...shape, text: nextText } : shape\n      ));\n      setEditingTextId(null);\n      setEditingTextValue('');\n    }\n  };",
    'safer geometry text edit',
)
replace_once(
    builder,
    "          <p className=\"text-xl text-gray-400 mb-4\">No geometry diagrams yet</p>\n          <p className=\"text-gray-500 mb-6\">Create interactive diagram questions with blank fields for students to fill in.</p>",
    "          <p className=\"text-xl text-gray-300 mb-4\">No geometry diagrams yet</p>\n          <p className=\"text-gray-400 mb-6\">Build clean classroom diagrams, export a high-resolution PNG for a normal question, or add answer blanks for an interactive diagram question.</p>",
    'geometry empty-state purpose',
)
replace_once(
    builder,
    "  const renderEditor = () => (\n    <div className=\"flex gap-4\">\n      {/* Left Toolbar */}\n      <div className=\"w-40 flex-shrink-0\">",
    "  const renderEditor = () => (\n    <div className=\"flex flex-col gap-4 xl:flex-row\">\n      {/* Left Toolbar */}\n      <div className=\"w-full flex-shrink-0 xl:w-44\">",
    'responsive professional geometry editor layout',
)
replace_once(
    builder,
    "        {/* Shapes Library - Horizontal above canvas */}\n        <div className=\"mb-4\">\n          <ShapesLibrary onAddShape={handleAddShapesFromLibrary} onAddSymbol={handleAddSymbol} />\n        </div>\n\n        {/* Canvas with instruction */}",
    "        <section className=\"mb-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4\">\n          <div className=\"grid gap-3 lg:grid-cols-[1fr_auto_auto]\">\n            <label className=\"grid gap-1 text-xs font-semibold text-slate-300\">Labels & annotations\n              <input value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleAddLabel(); } }} placeholder=\"e.g. A, 45°, radius, 6 cm\" className=\"min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500\" />\n            </label>\n            <label className=\"grid gap-1 text-xs font-semibold text-slate-300\">Size\n              <select value={labelFontSize} onChange={(event) => setLabelFontSize(Number(event.target.value))} className=\"min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white\"><option value={18}>Small</option><option value={24}>Medium</option><option value={32}>Large</option></select>\n            </label>\n            <button type=\"button\" onClick={handleAddLabel} disabled={!labelDraft.trim()} className=\"self-end min-h-11 rounded-lg bg-cyan-600 px-4 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40\">Add label</button>\n          </div>\n          <div className=\"mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3\"><span><strong className=\"text-slate-200\">1.</strong> Build the figure</span><span><strong className=\"text-slate-200\">2.</strong> Add clear labels</span><span><strong className=\"text-slate-200\">3.</strong> Export PNG or add blanks</span></div>\n          <p className=\"mt-2 text-[11px] leading-5 text-slate-500\">Select and drag labels to position them. Double-click or double-tap an existing label to edit its wording.</p>\n        </section>\n\n        {/* Shapes Library - Horizontal above canvas */}\n        <div className=\"mb-4\">\n          <ShapesLibrary onAddShape={handleAddShapesFromLibrary} onAddSymbol={handleAddSymbol} />\n        </div>\n\n        {/* Canvas with instruction */}",
    'geometry labels and professional workflow',
)
replace_once(
    builder,
    "            💡 Drag to multi-select • Shift+click to add • Double-click text to edit",
    "            Drag to move/select • Resize with handles • Double-click labels to edit",
    'geometry canvas instruction',
)

# ---------------------------------------------------------------------------
# Focused regression contract for this surgical pass.
# ---------------------------------------------------------------------------
test_path = Path('tests/teacherAdminUxSurgicalV2.test.ts')
if test_path.exists():
    raise SystemExit('focused UX test already exists unexpectedly')
test_path.write_text(r'''import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('teacher Academic Profiles and Support Plans stay inside the portal without forced page scroll', () => {
  const source = read('components/TeacherPortal.tsx');
  assert.match(source, /TeacherAcademicProfilesPage/);
  assert.match(source, /TeacherInterventionIntelligencePage/);
  assert.doesNotMatch(source, /window\.location\.assign\('\/teacher-academic-profiles\.html'\)/);
  assert.doesNotMatch(source, /window\.location\.assign\('\/teacher-interventions\.html'\)/);
  assert.doesNotMatch(source, /window\.requestAnimationFrame\(\(\) => window\.scrollTo/);
});

test('teacher Document Center navigation is removed while admin documents have Print Center first', () => {
  const teacher = read('components/TeacherPortal.tsx');
  const documents = read('components/school-admin/tabs/DocumentsTab.tsx');
  const printHub = read('components/school-admin/SchoolPrintHub.tsx');
  assert.doesNotMatch(teacher, /mode="teacher"/);
  assert.doesNotMatch(teacher, /label: 'Document Center'/);
  assert.match(documents, /What do we need to print\?/);
  assert.match(documents, /Document history/);
  assert.match(printHub, /Student Academic Profile/);
  assert.match(printHub, /Cambridge assessment reports/);
  assert.match(printHub, /Admission candidate reports/);
});

test('School Head has direct access to the admin Document Center', () => {
  const source = read('components/SchoolHeadPortal.tsx');
  assert.match(source, /openAdministration\('documents'\)/);
  assert.match(source, /Document Center/);
});

test('teacher Quick Actions show one Lockdown Mode and no duplicate direct Lockdown card', () => {
  const source = read('components/TeacherPortal.tsx');
  const quickArea = source.slice(source.indexOf('Quick Actions'), source.indexOf('Recent Assignments'));
  assert.match(quickArea, /Lockdown Mode/);
  assert.match(quickArea, /setView\('clan-wars'\)/);
  assert.doesNotMatch(quickArea, /<h4 className="teacher-action-title">Clan Wars<\/h4>/);
  assert.doesNotMatch(quickArea, /onClick=\{onLockdown\}/);
});

test('teacher settings expose interface colours and teacher theme consumes them', () => {
  const settings = read('components/SettingsModal.tsx');
  const theme = read('src/styles/teacher-theme.css');
  assert.match(settings, /profile\.role === 'student' \|\| profile\.role === 'teacher'/);
  assert.match(theme, /TEACHER DASHBOARD INTERFACE COLOR PARITY/);
  assert.match(theme, /data-student-theme-color="pink"/);
  assert.match(theme, /data-student-theme-color="green"/);
  assert.match(theme, /teacher-nav-btn\.active/);
});

test('teacher Guide and Help is teacher-specific', () => {
  const portal = read('components/TeacherPortal.tsx');
  const guide = read('components/TeacherGuideHelpModal.tsx');
  assert.match(portal, /TeacherGuideHelpModal/);
  assert.doesNotMatch(portal, /import\('\.\/HelpModal'\)/);
  assert.match(guide, /Assignments/);
  assert.match(guide, /Student Support Plans/);
  assert.match(guide, /Geometry Diagrams/);
  assert.doesNotMatch(guide, /Coins & Economy/);
});

test('geometry authoring uses explicit labels and preserves editable shape data', () => {
  const builder = read('components/geometry/DiagramBuilder.tsx');
  const toolbar = read('components/geometry/DiagramToolbar.tsx');
  assert.match(builder, /Labels & annotations/);
  assert.match(builder, /brainHeistShapes = shapes/);
  assert.match(builder, /Array\.isArray\(diagramData\.brainHeistShapes\)/);
  assert.match(builder, /Add label/);
  assert.doesNotMatch(toolbar, /id: 'text'/);
});

test('teacher sidebar keeps independent scrolling with a taller viewport', () => {
  const theme = read('src/styles/teacher-theme.css');
  assert.match(theme, /top: 72px;/);
  assert.match(theme, /max-height: calc\(100dvh - 84px\)/);
  assert.match(theme, /overflow-y: auto/);
});
''')
