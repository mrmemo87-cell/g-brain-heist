from pathlib import Path

path = Path('components/TeacherPortal.tsx')
text = path.read_text(encoding='utf-8')

if "const [assignmentClassFilter, setAssignmentClassFilter]" in text:
    print('Assignment class folders already materialized; skipping patch.')
    raise SystemExit(0)

old_state = """  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [assignmentSubjectFilter, setAssignmentSubjectFilter] = useState<'all' | Subject>('all');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
"""
new_state = """  const [assignmentSearchTerm, setAssignmentSearchTerm] = useState('');
  const [assignmentSubjectFilter, setAssignmentSubjectFilter] = useState<'all' | Subject>('all');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>('all');
"""

filtered_marker = """  // Filtered assignments based on search, subject, and status filters
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
"""
filtered_replacement = """  const assignmentClassFolders = useMemo(() => {
    const labels = new Map<string, string>();
    const rememberClass = (value?: string | null) => {
      const label = value?.trim();
      if (!label || label.toLowerCase() === 'all') return;
      const key = label.toLocaleLowerCase();
      if (!labels.has(key)) labels.set(key, label);
    };

    allocatedClasses.forEach((item) => {
      if (item.is_active) rememberClass(item.class_code);
    });
    assignments.forEach((assignment) => {
      if (assignment.assignment_mode !== 'custom') rememberClass(assignment.batch);
    });

    return [...labels.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [allocatedClasses, assignments]);

  const assignmentFolderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach((assignment) => {
      if (assignment.assignment_mode === 'custom') {
        counts.set('individual', (counts.get('individual') || 0) + 1);
        return;
      }
      const key = assignment.batch?.trim().toLocaleLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [assignments]);

  useEffect(() => {
    if (assignmentClassFilter === 'all' || assignmentClassFilter === 'individual') return;
    const stillAvailable = assignmentClassFolders.some((classCode) => classCode.toLocaleLowerCase() === assignmentClassFilter.toLocaleLowerCase());
    if (!stillAvailable) setAssignmentClassFilter('all');
  }, [assignmentClassFilter, assignmentClassFolders]);

  // Filtered assignments based on class folder, search, subject, and status filters
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (assignmentClassFilter === 'individual') {
        if (a.assignment_mode !== 'custom') return false;
      } else if (assignmentClassFilter !== 'all') {
        if (a.assignment_mode === 'custom') return false;
        if ((a.batch || '').trim().toLocaleLowerCase() !== assignmentClassFilter.trim().toLocaleLowerCase()) return false;
      }
"""

old_dependencies = """  }, [assignments, assignmentSearchTerm, assignmentSubjectFilter, assignmentStatusFilter]);
"""
new_dependencies = """  }, [assignments, assignmentClassFilter, assignmentSearchTerm, assignmentSubjectFilter, assignmentStatusFilter]);
"""

old_filter_ui = """      {/* Folder Organization: Filters & Search */}
      {assignments.length > 0 && (
"""
new_filter_ui = """      {assignments.length > 0 && (
        <div className=\"teacher-card p-4\">
          <div className=\"flex flex-wrap items-center justify-between gap-3\">
            <div>
              <p className=\"text-xs font-bold uppercase tracking-wider text-blue-600\">Class folders</p>
              <p className=\"mt-1 text-sm text-slate-500\">Keep each class's assignments separate while preserving one shared assignment system.</p>
            </div>
          </div>
          <div className=\"mt-4 flex flex-wrap gap-2\" role=\"tablist\" aria-label=\"Assignment folders by class\">
            <button
              type=\"button\"
              role=\"tab\"
              aria-selected={assignmentClassFilter === 'all'}
              onClick={() => setAssignmentClassFilter('all')}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${assignmentClassFilter === 'all' ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
            >
              <span aria-hidden=\"true\">🗂️</span> All <span className={`rounded-full px-2 py-0.5 text-xs ${assignmentClassFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{assignments.length}</span>
            </button>
            {assignmentClassFolders.map((classCode) => {
              const selected = assignmentClassFilter.toLocaleLowerCase() === classCode.toLocaleLowerCase();
              const count = assignmentFolderCounts.get(classCode.toLocaleLowerCase()) || 0;
              return (
                <button
                  key={classCode}
                  type=\"button\"
                  role=\"tab\"
                  aria-selected={selected}
                  onClick={() => setAssignmentClassFilter(classCode)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${selected ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
                >
                  <span aria-hidden=\"true\">📁</span> {classCode} <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
                </button>
              );
            })}
            <button
              type=\"button\"
              role=\"tab\"
              aria-selected={assignmentClassFilter === 'individual'}
              onClick={() => setAssignmentClassFilter('individual')}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${assignmentClassFilter === 'individual' ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
            >
              <span aria-hidden=\"true\">👤</span> Individual <span className={`rounded-full px-2 py-0.5 text-xs ${assignmentClassFilter === 'individual' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{assignmentFolderCounts.get('individual') || 0}</span>
            </button>
          </div>
        </div>
      )}

      {/* Existing search / subject / status filters stay scoped to the selected class folder. */}
      {assignments.length > 0 && (
"""

old_workspace_header = """            <div><span className=\"text-xs font-bold uppercase tracking-wider text-blue-600\">All assignments</span><h3 className=\"mt-1 text-lg font-bold text-slate-800\">Assignment workspace</h3></div>
"""
new_workspace_header = """            <div><span className=\"text-xs font-bold uppercase tracking-wider text-blue-600\">{assignmentClassFilter === 'all' ? 'All assignments' : assignmentClassFilter === 'individual' ? 'Individual assignments' : `${assignmentClassFilter} assignments`}</span><h3 className=\"mt-1 text-lg font-bold text-slate-800\">Assignment workspace</h3></div>
"""

old_card_heading = """                                  <span className=\"text-xs font-bold text-blue-600\">{assignment.subject_name} · {assignment.topic_name}</span>
                                  <h5 className=\"mt-1 text-lg font-bold text-slate-800\">{assignment.title || assignment.topic_name}</h5>
                                </div>
"""
new_card_heading = """                                  <span className=\"text-xs font-bold text-blue-600\">{assignment.subject_name} · {assignment.topic_name}</span>
                                  <h5 className=\"mt-1 text-lg font-bold text-slate-800\">{assignment.title || assignment.topic_name}</h5>
                                  <span className=\"mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700\">
                                    {assignment.assignment_mode === 'custom' ? '👤 Individual' : `🏫 ${assignment.batch || 'Class'}`} · {assignment.student_count} student{assignment.student_count === 1 ? '' : 's'}
                                  </span>
                                </div>
"""

for label, old in (
    ('assignment filter state', old_state),
    ('filtered assignment pipeline', filtered_marker),
    ('filtered assignment dependencies', old_dependencies),
    ('class folder insertion point', old_filter_ui),
    ('workspace header', old_workspace_header),
    ('assignment card heading', old_card_heading),
):
    if old not in text:
        raise SystemExit(f'Cannot safely patch TeacherPortal.tsx: expected {label} block not found.')

text = text.replace(old_state, new_state, 1)
text = text.replace(filtered_marker, filtered_replacement, 1)
text = text.replace(old_dependencies, new_dependencies, 1)
text = text.replace(old_filter_ui, new_filter_ui, 1)
text = text.replace(old_workspace_header, new_workspace_header, 1)
text = text.replace(old_card_heading, new_card_heading, 1)
path.write_text(text, encoding='utf-8')
print('Assignment workspace now groups assignments into class folders.')
