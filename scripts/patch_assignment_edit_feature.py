from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def insert_after(path, marker, addition):
    replace_once(path, marker, marker + addition)

# ---- types.ts -----------------------------------------------------------
replace_once('types.ts',
"""  due_at?: string | null;\n  completed_count: number;\n  student_count: number;\n  assignment_mode?: 'batch' | 'custom';\n}\n""",
"""  due_at?: string | null;\n  description?: string | null;\n  completed_count: number;\n  student_count: number;\n  assignment_mode?: 'batch' | 'custom';\n  publish_status?: 'draft' | 'scheduled' | 'published';\n  close_submissions_after_due?: boolean;\n  notify_students_by_email?: boolean;\n  published_at?: string | null;\n  question_ids?: string[];\n  student_ids?: string[];\n}\n""")
replace_once('types.ts',
"""  due_at?: string | null;\n  title?: string | null;\n  instructions?: string | null;\n  questions: TeacherQuestion[];\n}\n""",
"""  due_at?: string | null;\n  title?: string | null;\n  instructions?: string | null;\n  publish_status?: 'draft' | 'scheduled' | 'published';\n  close_submissions_after_due?: boolean;\n  is_late?: boolean;\n  is_closed?: boolean;\n  questions: TeacherQuestion[];\n}\n""")
replace_once('types.ts',
"""  title?: string;\n  instructions?: string;\n  difficulty?: QuestionDifficulty;\n  assignment_mode?: 'batch' | 'custom';\n  student_ids?: string[];\n""",
"""  title?: string;\n  description?: string;\n  instructions?: string;\n  difficulty?: QuestionDifficulty;\n  assignment_mode?: 'batch' | 'custom';\n  student_ids?: string[];\n  publish_status?: 'draft' | 'scheduled' | 'published';\n  close_submissions_after_due?: boolean;\n  notify_students_by_email?: boolean;\n""")

# ---- rpc gateway --------------------------------------------------------
insert_after('services/rpcGateway.ts',
"""export const deleteTeacherAssignment = (\n  assignmentId: string,\n  client?: RpcClient\n): RpcResult<boolean> => {\n  return execute('rpc_delete_teacher_assignment', { p_assignment_id: assignmentId }, client);\n};\n""",
"""\nexport const updateTeacherAssignment = (\n  assignmentId: string,\n  payload: Record<string, unknown>,\n  client?: RpcClient\n): RpcResult<unknown> => {\n  return execute('rpc_update_teacher_assignment', { p_assignment_id: assignmentId, ...payload }, client);\n};\n""")

# ---- game service -------------------------------------------------------
replace_once('services/gameService.ts',
"""    deleteTeacherAssignment as rpcDeleteTeacherAssignment,\n    getTeacherAssignmentSuccessSummary as rpcGetTeacherAssignmentSuccessSummary,\n""",
"""    deleteTeacherAssignment as rpcDeleteTeacherAssignment,\n    updateTeacherAssignment as rpcUpdateTeacherAssignment,\n    getTeacherAssignmentSuccessSummary as rpcGetTeacherAssignmentSuccessSummary,\n""")
replace_once('services/gameService.ts',
"""        p_title: payload.title.trim(),\n        p_instructions: payload.instructions ?? null,\n        p_difficulty: payload.difficulty ?? null,\n        p_assignment_mode: mode,\n        p_student_ids: payload.student_ids ?? null,\n""",
"""        p_title: payload.title.trim(),\n        p_description: payload.description ?? null,\n        p_instructions: payload.instructions ?? null,\n        p_difficulty: payload.difficulty ?? null,\n        p_assignment_mode: mode,\n        p_student_ids: payload.student_ids ?? null,\n        p_publish_status: payload.publish_status ?? 'published',\n        p_close_submissions_after_due: payload.close_submissions_after_due ?? false,\n        p_notify_students_by_email: payload.notify_students_by_email ?? false,\n""")
insert_after('services/gameService.ts',
"""export const delete_teacher_assignment = async (assignmentId: string): Promise<void> => {\n    if (!assignmentId) throw new Error('Assignment ID is required');\n\n    const { data, error } = await rpcDeleteTeacherAssignment(assignmentId);\n    if (error) throw new Error(error.message || 'Failed to delete assignment');\n    if (data !== true) throw new Error('Assignment could not be deleted');\n};\n""",
"""\nexport const update_teacher_assignment = async (\n    assignmentId: string,\n    payload: Omit<CreateAssignmentRequest, 'teacher_id'>\n): Promise<TeacherAssignmentSummary> => {\n    if (!assignmentId) throw new Error('Assignment ID is required');\n    if (!payload.question_ids?.length) throw new Error('Select at least one question for the assignment');\n    if (!payload.title?.trim()) throw new Error('Assignment title is required');\n    const mode = payload.assignment_mode || 'batch';\n    if (mode === 'batch' && !payload.batch) throw new Error('Batch is required for batch mode assignments');\n    if (mode === 'custom' && (!payload.student_ids || payload.student_ids.length === 0)) throw new Error('At least one student is required for custom assignments');\n\n    const { data, error } = await rpcUpdateTeacherAssignment(assignmentId, {\n        p_subject_id: payload.subject_id ?? resolveSubjectIdentifier(payload.subject),\n        p_subject_name: payload.subject,\n        p_topic_name: normalizeTopicName(payload.topic_name),\n        p_batch: payload.batch ?? null,\n        p_question_ids: payload.question_ids,\n        p_assigned_at: payload.assigned_at ?? nowIso(),\n        p_due_at: payload.due_at ?? null,\n        p_title: payload.title.trim(),\n        p_description: payload.description ?? null,\n        p_instructions: payload.instructions ?? null,\n        p_difficulty: payload.difficulty ?? null,\n        p_assignment_mode: mode,\n        p_student_ids: payload.student_ids ?? null,\n        p_publish_status: payload.publish_status ?? 'published',\n        p_close_submissions_after_due: payload.close_submissions_after_due ?? false,\n        p_notify_students_by_email: payload.notify_students_by_email ?? false,\n    });\n    if (error) throw new Error(error.message || 'Failed to update assignment');\n    const assignment = (Array.isArray(data) ? data[0] : data) as TeacherAssignmentSummary | undefined;\n    if (!assignment) throw new Error('Assignment could not be updated');\n    return assignment;\n};\n""")
replace_once('services/gameService.ts',
"""        if (message.includes('ASSIGNMENT_NOT_SUBMITTABLE')) {\n            throw new Error('Assignment is no longer in a submittable state.');\n        }\n        throw new Error(message);\n""",
"""        if (message.includes('ASSIGNMENT_NOT_SUBMITTABLE')) {\n            throw new Error('Assignment is no longer in a submittable state.');\n        }\n        if (message.includes('ASSIGNMENT_CLOSED')) {\n            throw new Error('This assignment is closed because its due date has passed.');\n        }\n        throw new Error(message);\n""")

# ---- assignment wizard -------------------------------------------------
replace_once('components/teacher/AssignmentWizard.tsx',
"""  assignmentDueAt: string;\n  setAssignmentDueAt: (value: string) => void;\n  assignmentDifficulty: QuestionDifficulty;\n""",
"""  assignmentDueAt: string;\n  setAssignmentDueAt: (value: string) => void;\n  assignmentAssignedAt: string;\n  setAssignmentAssignedAt: (value: string) => void;\n  assignmentPublishStatus: 'draft' | 'scheduled' | 'published';\n  setAssignmentPublishStatus: (value: 'draft' | 'scheduled' | 'published') => void;\n  assignmentCloseAfterDue: boolean;\n  setAssignmentCloseAfterDue: (value: boolean) => void;\n  assignmentNotifyByEmail: boolean;\n  setAssignmentNotifyByEmail: (value: boolean) => void;\n  editingAssignment?: boolean;\n  assignmentDifficulty: QuestionDifficulty;\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""  onSubmit: (event: React.FormEvent) => Promise<void>;\n  onCancel: () => void;\n""",
"""  onSubmit: (event: React.FormEvent) => Promise<void>;\n  onSaveDraft: () => Promise<void>;\n  onCancel: () => void;\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""  assignmentDueAt,\n  setAssignmentDueAt,\n  assignmentDifficulty,\n""",
"""  assignmentDueAt,\n  setAssignmentDueAt,\n  assignmentAssignedAt,\n  setAssignmentAssignedAt,\n  assignmentPublishStatus,\n  setAssignmentPublishStatus,\n  assignmentCloseAfterDue,\n  setAssignmentCloseAfterDue,\n  assignmentNotifyByEmail,\n  setAssignmentNotifyByEmail,\n  editingAssignment = false,\n  assignmentDifficulty,\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""  onSubmit,\n  onCancel,\n}: AssignmentWizardProps) {\n""",
"""  onSubmit,\n  onSaveDraft,\n  onCancel,\n}: AssignmentWizardProps) {\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""    if (currentStep === 5 && isPastDueDate(assignmentDueAt)) {\n      return brainsAlert('Choose a due date and time in the future. Students cannot receive an assignment that is already overdue.', 'error');\n    }\n""",
"""    if (currentStep === 5 && isPastDueDate(assignmentDueAt)) {\n      return brainsAlert('Choose a due date and time in the future.', 'error');\n    }\n    if (currentStep === 5 && assignmentPublishStatus === 'scheduled' && (!assignmentAssignedAt || new Date(assignmentAssignedAt).getTime() <= Date.now())) {\n      return brainsAlert('Choose a future publication date and time.', 'error');\n    }\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""              {customDueDate && <label className=\"aw-custom-date\"><span>Custom due date</span><input type=\"datetime-local\" min={localDateTimeValue()} value={assignmentDueAt} aria-invalid={isPastDueDate(assignmentDueAt)} onChange={(event) => setAssignmentDueAt(event.target.value)} />{isPastDueDate(assignmentDueAt) ? <small className=\"aw-field-error\">Choose a future date and time. This assignment would already be overdue.</small> : null}</label>}\n            </div>\n""",
"""              {customDueDate && <label className=\"aw-custom-date\"><span>Custom due date</span><input type=\"datetime-local\" min={localDateTimeValue()} value={assignmentDueAt} aria-invalid={isPastDueDate(assignmentDueAt)} onChange={(event) => setAssignmentDueAt(event.target.value)} />{isPastDueDate(assignmentDueAt) ? <small className=\"aw-field-error\">Choose a future date and time.</small> : null}</label>}\n              <div className=\"mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4\">\n                <div><strong className=\"text-slate-800\">Publication</strong><p className=\"text-sm text-slate-500\">Publish now, schedule it, or save a draft from the review step.</p></div>\n                <div className=\"grid gap-2 sm:grid-cols-2\">\n                  <button type=\"button\" className={assignmentPublishStatus === 'published' ? 'aw-due-card is-selected' : 'aw-due-card'} onClick={() => { setAssignmentPublishStatus('published'); setAssignmentAssignedAt(localDateTimeValue()); }}><strong>Publish now</strong><small>Available immediately</small></button>\n                  <button type=\"button\" className={assignmentPublishStatus === 'scheduled' ? 'aw-due-card is-selected' : 'aw-due-card'} onClick={() => setAssignmentPublishStatus('scheduled')}><strong>Schedule</strong><small>Choose a release time</small></button>\n                </div>\n                {assignmentPublishStatus === 'scheduled' ? <label className=\"aw-custom-date\"><span>Publish at</span><input type=\"datetime-local\" min={localDateTimeValue()} value={assignmentAssignedAt} onChange={(event) => setAssignmentAssignedAt(event.target.value)} /></label> : null}\n                <label className=\"flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700\"><input className=\"mt-1\" type=\"checkbox\" checked={assignmentCloseAfterDue} onChange={(event) => setAssignmentCloseAfterDue(event.target.checked)} /><span><strong>Close submissions after due date</strong><br/><small className=\"text-slate-500\">Off by default. When off, late work stays open and is marked Late.</small></span></label>\n                <label className=\"flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700\"><input className=\"mt-1\" type=\"checkbox\" checked={assignmentNotifyByEmail} onChange={(event) => setAssignmentNotifyByEmail(event.target.checked)} /><span><strong>Notify students by email?</strong><br/><small className=\"text-slate-500\">The notification is queued for the time the assignment becomes available.</small></span></label>\n              </div>\n            </div>\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""              <div className=\"aw-review__hero\"><span>Ready to publish</span><h2>{assignmentTitle || `${assignmentSubject} assignment`}</h2><p>{selectedQuestions.length} questions · {estimatedMinutes} minutes · {totalXp} XP</p></div>\n""",
"""              <div className=\"aw-review__hero\"><span>{editingAssignment ? 'Ready to save' : 'Ready to publish'}</span><h2>{assignmentTitle || `${assignmentSubject} assignment`}</h2><p>{selectedQuestions.length} questions · {estimatedMinutes} minutes · {totalXp} XP</p></div>\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""                ['Due date', formatDueDate(assignmentDueAt), 5],\n""",
"""                ['Due date', formatDueDate(assignmentDueAt), 5],\n                ['Publication', assignmentPublishStatus === 'scheduled' ? `Scheduled · ${formatDueDate(assignmentAssignedAt)}` : 'Publish now', 5],\n                ['Late work', assignmentCloseAfterDue ? 'Close after due date' : 'Allow and mark Late', 5],\n                ['Email', assignmentNotifyByEmail ? 'Notify students' : 'Do not notify', 5],\n""")
replace_once('components/teacher/AssignmentWizard.tsx',
"""            ) : (\n              <button type=\"submit\" className=\"aw-button aw-button--primary\" disabled={assignmentSubmitting || !reviewConfirmed}>\n                {assignmentSubmitting ? 'Publishing…' : 'Publish assignment'}\n              </button>\n            )}\n""",
"""            ) : (\n              <>\n                {!editingAssignment ? <button type=\"button\" className=\"aw-button aw-button--ghost\" disabled={assignmentSubmitting} onClick={() => void onSaveDraft()}>Save as draft</button> : null}\n                <button type=\"submit\" className=\"aw-button aw-button--primary\" disabled={assignmentSubmitting || !reviewConfirmed}>\n                  {assignmentSubmitting ? 'Saving…' : editingAssignment ? 'Save changes' : assignmentPublishStatus === 'scheduled' ? 'Schedule assignment' : 'Publish assignment'}\n                </button>\n              </>\n            )}\n""")

# ---- teacher portal -----------------------------------------------------
replace_once('components/TeacherPortal.tsx',
"""  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);\n  const [assignmentSuccess, setAssignmentSuccess] = useState<GameService.TeacherAssignmentSuccessSummary | null>(null);\n""",
"""  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);\n  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignmentSummary | null>(null);\n  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');\n  const [assignmentCloseAfterDue, setAssignmentCloseAfterDue] = useState(false);\n  const [assignmentNotifyByEmail, setAssignmentNotifyByEmail] = useState(false);\n  const [assignmentSuccess, setAssignmentSuccess] = useState<GameService.TeacherAssignmentSuccessSummary | null>(null);\n""")
replace_once('components/TeacherPortal.tsx',
"""    setAssignmentDueAt('');\n    setAssignmentAssignedAt(new Date().toISOString().slice(0, 16));\n  }, []);\n""",
"""    setAssignmentDueAt('');\n    setAssignmentAssignedAt(new Date().toISOString().slice(0, 16));\n    setAssignmentPublishStatus('published');\n    setAssignmentCloseAfterDue(false);\n    setAssignmentNotifyByEmail(false);\n    setEditingAssignment(null);\n  }, []);\n""")
insert_after('components/TeacherPortal.tsx',
"""  const openBlankAssignmentForm = useCallback(() => {\n    resetAssignmentDraft();\n    void loadQuestionsOnDemand();\n    setView('create-assignment');\n  }, [resetAssignmentDraft]);\n""",
"""\n  const toLocalAssignmentDateTime = (value?: string | null) => {\n    if (!value) return '';\n    const date = new Date(value);\n    if (Number.isNaN(date.getTime())) return '';\n    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);\n  };\n\n  const handleEditAssignment = (assignment: TeacherAssignmentSummary) => {\n    if (!teacher || assignment.teacher_id !== teacher.id) {\n      brainsAlert('You can only edit assignments that you created.', 'error');\n      return;\n    }\n    resetAssignmentDraft();\n    setEditingAssignment(assignment);\n    setAssignmentLockedSubject(null);\n    setAssignmentSubject(assignment.subject_name as Subject);\n    setAssignmentTitle(assignment.title || '');\n    setAssignmentDescription(assignment.description || '');\n    setAssignmentInstructions(assignment.instructions || '');\n    setAssignmentQuestionIds(assignment.question_ids || []);\n    setAssignmentDueAt(toLocalAssignmentDateTime(assignment.due_at));\n    setAssignmentAssignedAt(toLocalAssignmentDateTime(assignment.assigned_at) || new Date().toISOString().slice(0, 16));\n    setAssignmentDifficulty((assignment.difficulty || 'easy') as QuestionDifficulty);\n    setAssignmentMode(assignment.assignment_mode || 'batch');\n    setAssignmentBatches(assignment.assignment_mode === 'custom' ? [] : assignment.batch ? [assignment.batch] : []);\n    setSelectedStudentIds(assignment.student_ids || []);\n    setAssignmentPublishStatus(assignment.publish_status || (new Date(assignment.assigned_at).getTime() > Date.now() ? 'scheduled' : 'published'));\n    setAssignmentCloseAfterDue(Boolean(assignment.close_submissions_after_due));\n    setAssignmentNotifyByEmail(Boolean(assignment.notify_students_by_email));\n    if (assignment.topic_name && assignment.topic_name !== 'General') { setAssignmentTopicMode('custom'); setAssignmentTopicName(assignment.topic_name); }\n    else { setAssignmentTopicMode('general'); setAssignmentTopicName(''); }\n    void loadQuestionsOnDemand();\n    setView('create-assignment');\n  };\n""")
# Replace assignment submit function wholesale between known anchors
p = Path('components/TeacherPortal.tsx')
text = p.read_text(encoding='utf-8')
start = text.index('  const handleCreateAssignment = async (e: React.FormEvent) => {')
end = text.index('\n  const handleOpenReport = async', start)
new_handler = r'''  const saveAssignment = async (publishStatus: 'draft' | 'scheduled' | 'published', e?: React.FormEvent) => {
    e?.preventDefault();
    if (!assignmentTitle.trim()) return brainsAlert('Assignment title is required.', 'info');
    if (teacherAssignedSubjects.length > 0 && !teacherAssignedSubjects.includes(assignmentSubject)) return brainsAlert('You can only create assignments for subjects assigned to you by the school admin.', 'error');
    if (assignmentTopicMode === 'custom' && !assignmentTopicName.trim()) return brainsAlert('Please enter a topic for this assignment.', 'info');
    if (!assignmentQuestionIds.length) return brainsAlert('Select at least one question to assign.', 'info');
    if (assignmentMode === 'batch' && assignmentBatches.length === 0) return brainsAlert('Please select at least one class/batch for this assignment.', 'info');
    if (assignmentMode === 'custom' && selectedStudentIds.length === 0) return brainsAlert('Please select at least one student for this assignment.', 'info');
    if (assignmentDueAt) {
      const dueDate = new Date(assignmentDueAt);
      if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) return brainsAlert('Choose a due date and time in the future.', 'error');
    }
    if (publishStatus === 'scheduled') {
      const publicationDate = new Date(assignmentAssignedAt);
      if (Number.isNaN(publicationDate.getTime()) || publicationDate.getTime() <= Date.now()) return brainsAlert('Choose a future publication date and time.', 'error');
    }
    const toIso = (value: string): string | undefined => { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); };
    const assignedAt = publishStatus === 'published' ? new Date().toISOString() : (toIso(assignmentAssignedAt) ?? new Date().toISOString());
    try {
      setAssignmentSubmitting(true);
      if (!editingAssignment) {
        const assignQuota = await tryConsumePilotQuota('assignments_created');
        if (!assignQuota.proceed) { brainsAlert(assignQuota.error || 'You\'ve reached the assignment creation limit on the Pilot plan. Upgrade to continue.', 'error'); return; }
      }
      const basePayload = {
        subject: assignmentSubject,
        topic_name: assignmentTopicLabel,
        question_ids: assignmentQuestionIds,
        assigned_at: assignedAt,
        due_at: toIso(assignmentDueAt),
        title: assignmentTitle.trim(),
        description: assignmentDescription || undefined,
        instructions: assignmentInstructions || undefined,
        difficulty: assignmentDifficulty,
        publish_status: publishStatus,
        close_submissions_after_due: assignmentCloseAfterDue,
        notify_students_by_email: assignmentNotifyByEmail,
      } as const;

      if (editingAssignment) {
        const batch = assignmentMode === 'batch' ? assignmentBatches.find((item) => item !== 'All') : undefined;
        await GameService.update_teacher_assignment(editingAssignment.id, {
          ...basePayload,
          assignment_mode: assignmentMode,
          batch: batch as AssignmentBatch | undefined,
          student_ids: assignmentMode === 'custom' ? selectedStudentIds : undefined,
        });
        brainsAlert(publishStatus === 'draft' ? 'Assignment saved as a draft.' : publishStatus === 'scheduled' ? 'Assignment updated and scheduled.' : 'Assignment updated.', 'success');
      } else if (assignmentMode === 'batch') {
        const batchesToAssign = assignmentBatches.includes('All') ? availableBatches : assignmentBatches.filter((batch) => batch !== 'All');
        const errors: string[] = [];
        for (const batch of batchesToAssign) {
          try { await GameService.create_assignment({ ...basePayload, batch: batch as AssignmentBatch, assignment_mode: 'batch' }); }
          catch (err) { errors.push(`${batch}: ${(err as Error).message}`); }
        }
        if (errors.length) throw new Error(errors.join('\n'));
        brainsAlert(publishStatus === 'draft' ? `Draft saved for ${batchesToAssign.length} class${batchesToAssign.length === 1 ? '' : 'es'}.` : publishStatus === 'scheduled' ? 'Assignment scheduled.' : 'Assignment published.', 'success');
      } else {
        await GameService.create_assignment({ ...basePayload, batch: undefined, assignment_mode: 'custom', student_ids: selectedStudentIds });
        brainsAlert(publishStatus === 'draft' ? 'Draft saved.' : publishStatus === 'scheduled' ? 'Assignment scheduled.' : 'Assignment published.', 'success');
      }
      resetAssignmentDraft();
      await loadAssignments();
      setView('assignments');
    } catch (error) {
      console.error('Error saving assignment:', error);
      brainsAlert('Unable to save assignment: ' + (error as Error).message, 'error');
    } finally { setAssignmentSubmitting(false); }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => saveAssignment(assignmentPublishStatus === 'scheduled' ? 'scheduled' : 'published', e);
  const handleSaveAssignmentDraft = async () => saveAssignment('draft');
'''
p.write_text(text[:start] + new_handler + text[end:], encoding='utf-8')

# single delete confirmation
p = Path('components/TeacherPortal.tsx'); text = p.read_text(encoding='utf-8')
start = text.index('    const assignmentName = assignment.title || assignment.topic_name;', text.index('const handleDeleteAssignment'))
end = text.index('    setDeletingAssignmentId(assignment.id);', start)
replacement = '''    const assignmentName = assignment.title || assignment.topic_name;\n    const confirmed = await brainsConfirm({\n      title: `Delete “${assignmentName}”?`,\n      message: 'This permanently removes this assignment for every assigned student, including related submissions, scores, progress, and reporting data.',\n      confirmLabel: 'Delete assignment',\n      cancelLabel: 'Keep assignment',\n      destructive: true,\n    });\n    if (!confirmed) return;\n\n'''
p.write_text(text[:start] + replacement + text[end:], encoding='utf-8')

# Card status + edit button
replace_once('components/TeacherPortal.tsx',
"""                          const completionPercent = assignment.student_count > 0\n                            ? Math.round((assignment.completed_count / assignment.student_count) * 100)\n                            : 0;\n                          return (\n""",
"""                          const completionPercent = assignment.student_count > 0\n                            ? Math.round((assignment.completed_count / assignment.student_count) * 100)\n                            : 0;\n                          const now = Date.now();\n                          const due = assignment.due_at ? new Date(assignment.due_at) : null;\n                          const assigned = new Date(assignment.assigned_at);\n                          const duePast = Boolean(due && due.getTime() < now);\n                          const dueToday = Boolean(due && due.toDateString() === new Date().toDateString());\n                          const dueSoon = Boolean(due && !duePast && due.getTime() - now <= 24 * 60 * 60 * 1000);\n                          const statusLabel = assignment.publish_status === 'draft' ? 'Draft'\n                            : assignment.publish_status === 'scheduled' || assigned.getTime() > now ? 'Scheduled'\n                            : completed ? 'Completed'\n                            : duePast && assignment.close_submissions_after_due ? 'Closed'\n                            : duePast ? 'Late / overdue'\n                            : dueToday ? 'Due today'\n                            : dueSoon ? 'Due soon'\n                            : `${completionPercent}% complete`;\n                          return (\n""")
replace_once('components/TeacherPortal.tsx',
"""                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{completed ? 'Completed' : `${completionPercent}% complete`}</span>\n""",
"""                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-800' : duePast ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{statusLabel}</span>\n""")
replace_once('components/TeacherPortal.tsx',
"""                              <div className=\"mt-4 grid gap-2 sm:grid-cols-2\">\n                                <button onClick={() => handleOpenReport(assignment)} className=\"teacher-btn teacher-btn-secondary w-full\">\n                                  View report\n                                </button>\n                                <button\n""",
"""                              <div className=\"mt-4 grid gap-2 sm:grid-cols-3\">\n                                <button onClick={() => handleOpenReport(assignment)} className=\"teacher-btn teacher-btn-secondary w-full\">View report</button>\n                                <button type=\"button\" onClick={() => handleEditAssignment(assignment)} className=\"teacher-btn teacher-btn-secondary w-full\" aria-label={`Edit ${assignment.title || assignment.topic_name}`}>Edit assignment</button>\n                                <button\n""")
# Wizard prop wiring
replace_once('components/TeacherPortal.tsx',
"""          assignmentDueAt={assignmentDueAt}\n          setAssignmentDueAt={setAssignmentDueAt}\n          assignmentDifficulty={assignmentDifficulty}\n""",
"""          assignmentDueAt={assignmentDueAt}\n          setAssignmentDueAt={setAssignmentDueAt}\n          assignmentAssignedAt={assignmentAssignedAt}\n          setAssignmentAssignedAt={setAssignmentAssignedAt}\n          assignmentPublishStatus={assignmentPublishStatus}\n          setAssignmentPublishStatus={setAssignmentPublishStatus}\n          assignmentCloseAfterDue={assignmentCloseAfterDue}\n          setAssignmentCloseAfterDue={setAssignmentCloseAfterDue}\n          assignmentNotifyByEmail={assignmentNotifyByEmail}\n          setAssignmentNotifyByEmail={setAssignmentNotifyByEmail}\n          editingAssignment={Boolean(editingAssignment)}\n          assignmentDifficulty={assignmentDifficulty}\n""")
replace_once('components/TeacherPortal.tsx',
"""          onSubmit={handleCreateAssignment}\n          onCancel={() => setView('assignments')}\n""",
"""          onSubmit={handleCreateAssignment}\n          onSaveDraft={handleSaveAssignmentDraft}\n          onCancel={() => { resetAssignmentDraft(); setView('assignments'); }}\n""")

# ---- migration ----------------------------------------------------------
migration = r'''-- Teacher assignment editing, drafts, scheduling, late-work policy, and notification queue.
alter table public.assignments
  add column if not exists publish_status text not null default 'published',
  add column if not exists close_submissions_after_due boolean not null default false,
  add column if not exists notify_students_by_email boolean not null default false,
  add column if not exists published_at timestamptz;

alter table public.student_assignment_results
  add column if not exists submitted_late boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_publish_status_check') then
    alter table public.assignments add constraint assignments_publish_status_check check (publish_status in ('draft','scheduled','published'));
  end if;
end $$;

update public.assignments set published_at = coalesce(published_at, assigned_at, created_at) where publish_status = 'published' and published_at is null;

create table if not exists public.assignment_email_notifications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  available_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (assignment_id, student_id)
);
alter table public.assignment_email_notifications enable row level security;
revoke all on table public.assignment_email_notifications from anon, authenticated;

create table if not exists public.assignment_change_audit (
  id bigserial primary key,
  assignment_id uuid,
  actor_user_id uuid not null,
  action text not null,
  affected_student_ids uuid[] not null default '{}',
  affected_question_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.assignment_change_audit enable row level security;
revoke all on table public.assignment_change_audit from anon, authenticated;

-- Replace create RPC with backwards-compatible optional arguments.
drop function if exists public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[]);
create function public.rpc_create_assignment(
  p_teacher_id uuid, p_subject_id text, p_subject_name text, p_topic_name text, p_batch text,
  p_question_ids uuid[], p_assigned_at timestamptz, p_due_at timestamptz, p_title text,
  p_instructions text, p_difficulty text, p_assignment_mode text default 'batch', p_student_ids uuid[] default null,
  p_description text default null, p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false, p_notify_students_by_email boolean default false
) returns public.assignments language plpgsql security definer set search_path=public,pg_temp as $$
declare
  new_assignment public.assignments; v_actor uuid := auth.uid(); v_teacher_user_id uuid; v_teacher_school_id uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if coalesce(array_length(p_question_ids,1),0)=0 then raise exception 'Assignment must include at least one question'; end if;
  if p_publish_status not in ('draft','scheduled','published') then raise exception 'Invalid publish status'; end if;
  if p_publish_status='scheduled' and (p_assigned_at is null or p_assigned_at <= now()) then raise exception 'Scheduled publication must be in the future'; end if;
  select t.user_id,u.school_id into v_teacher_user_id,v_teacher_school_id from public.teachers t join public.users u on u.id=t.user_id where t.id=p_teacher_id;
  if v_teacher_user_id is null then raise exception 'Teacher record not found'; end if;
  if v_teacher_user_id<>v_actor and not exists(select 1 from public.users u where u.id=v_actor and (u.role in ('admin','school_admin') or coalesce(u.is_admin,false))) then raise exception 'Not authorized'; end if;
  insert into public.assignments(teacher_id,subject_id,subject_name,topic_name,batch,difficulty,title,description,instructions,assigned_at,due_at,assignment_mode,publish_status,close_submissions_after_due,notify_students_by_email,published_at)
  values(p_teacher_id,p_subject_id,p_subject_name,p_topic_name,case when p_assignment_mode='custom' then null else p_batch end,p_difficulty,p_title,p_description,p_instructions,coalesce(p_assigned_at,now()),p_due_at,coalesce(p_assignment_mode,'batch'),p_publish_status,coalesce(p_close_submissions_after_due,false),coalesce(p_notify_students_by_email,false),case when p_publish_status='published' then now() else null end)
  returning * into new_assignment;
  insert into public.assignment_questions(assignment_id,question_id,order_index) select new_assignment.id,qid,row_number() over() from unnest(p_question_ids) qid;
  if p_assignment_mode='custom' then
    insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
    select new_assignment.id,u.id,u.batch,'pending',new_assignment.assigned_at,new_assignment.due_at from public.users u
    where u.id=any(coalesce(p_student_ids,'{}'::uuid[])) and coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  else
    insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
    select new_assignment.id,u.id,u.batch,'pending',new_assignment.assigned_at,new_assignment.due_at from public.users u
    where coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (p_batch='All' or u.batch=p_batch) and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  end if;
  insert into public.assignment_students(assignment_id,student_id) select new_assignment.id,sa.student_id from public.student_assignments sa where sa.assignment_id=new_assignment.id on conflict do nothing;
  if new_assignment.notify_students_by_email and new_assignment.publish_status<>'draft' then
    insert into public.assignment_email_notifications(assignment_id,student_id,available_at) select new_assignment.id,sa.student_id,new_assignment.assigned_at from public.student_assignments sa where sa.assignment_id=new_assignment.id on conflict(assignment_id,student_id) do update set available_at=excluded.available_at,status='pending';
  end if;
  return new_assignment;
end $$;
revoke all on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[],text,text,boolean,boolean) from public;
grant execute on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[],text,text,boolean,boolean) to authenticated;

create or replace function public.rpc_update_teacher_assignment(
  p_assignment_id uuid, p_subject_id text, p_subject_name text, p_topic_name text, p_batch text,
  p_question_ids uuid[], p_assigned_at timestamptz, p_due_at timestamptz, p_title text, p_description text,
  p_instructions text, p_difficulty text, p_assignment_mode text, p_student_ids uuid[], p_publish_status text,
  p_close_submissions_after_due boolean, p_notify_students_by_email boolean
) returns public.assignments language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_assignment public.assignments; v_teacher_user_id uuid; v_teacher_school_id uuid;
  v_old_students uuid[]; v_new_students uuid[]; v_removed_students uuid[]; v_old_questions uuid[]; v_removed_questions uuid[]; v_content_changed boolean;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select a.*,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id from public.assignments a join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id where a.id=p_assignment_id;
  if v_assignment.id is null or v_teacher_user_id<>v_actor then raise exception 'Assignment not found or you are not its creator'; end if;
  if coalesce(array_length(p_question_ids,1),0)=0 then raise exception 'Assignment must include at least one question'; end if;
  if p_publish_status not in ('draft','scheduled','published') then raise exception 'Invalid publish status'; end if;
  if p_publish_status='scheduled' and p_assigned_at<=now() then raise exception 'Scheduled publication must be in the future'; end if;
  select coalesce(array_agg(student_id),'{}'::uuid[]) into v_old_students from public.student_assignments where assignment_id=p_assignment_id;
  select coalesce(array_agg(question_id order by order_index),'{}'::uuid[]) into v_old_questions from public.assignment_questions where assignment_id=p_assignment_id;
  if p_assignment_mode='custom' then
    select coalesce(array_agg(u.id),'{}'::uuid[]) into v_new_students from public.users u where u.id=any(coalesce(p_student_ids,'{}'::uuid[])) and coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  else
    select coalesce(array_agg(u.id),'{}'::uuid[]) into v_new_students from public.users u where coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (p_batch='All' or u.batch=p_batch) and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  end if;
  select coalesce(array_agg(x),'{}'::uuid[]) into v_removed_students from unnest(v_old_students) x where not(x=any(v_new_students));
  select coalesce(array_agg(x),'{}'::uuid[]) into v_removed_questions from unnest(v_old_questions) x where not(x=any(p_question_ids));
  v_content_changed := v_old_questions is distinct from p_question_ids;

  -- Remove academic history for students no longer assigned.
  if coalesce(array_length(v_removed_students,1),0)>0 then
    delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignment_analyses where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignment_answers where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignment_results where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignments where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.assignment_students where assignment_id=p_assignment_id and student_id=any(v_removed_students);
  end if;

  -- If academic content changes, previous results no longer describe the same assessment.
  -- Clear assignment-generated evidence and attempts for remaining students and reset them.
  if v_content_changed then
    delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id;
    delete from public.student_assignment_analyses where assignment_id=p_assignment_id;
    delete from public.student_assignment_answers where assignment_id=p_assignment_id;
    delete from public.student_assignment_results where assignment_id=p_assignment_id;
    update public.student_assignments set status='pending',completed_at=null where assignment_id=p_assignment_id;
    delete from public.assignment_questions where assignment_id=p_assignment_id;
    insert into public.assignment_questions(assignment_id,question_id,order_index) select p_assignment_id,qid,row_number() over() from unnest(p_question_ids) qid;
  end if;

  insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
  select p_assignment_id,u.id,u.batch,'pending',p_assigned_at,p_due_at from public.users u where u.id=any(v_new_students)
  on conflict(assignment_id,student_id) do update set batch=excluded.batch,assigned_at=excluded.assigned_at,due_at=excluded.due_at;
  insert into public.assignment_students(assignment_id,student_id) select p_assignment_id,x from unnest(v_new_students) x on conflict do nothing;
  update public.student_assignments set assigned_at=p_assigned_at,due_at=p_due_at where assignment_id=p_assignment_id;

  update public.assignments set subject_id=p_subject_id,subject_name=p_subject_name,topic_name=p_topic_name,batch=case when p_assignment_mode='custom' then null else p_batch end,difficulty=p_difficulty,title=p_title,description=p_description,instructions=p_instructions,assigned_at=p_assigned_at,due_at=p_due_at,assignment_mode=p_assignment_mode,publish_status=p_publish_status,close_submissions_after_due=coalesce(p_close_submissions_after_due,false),notify_students_by_email=coalesce(p_notify_students_by_email,false),published_at=case when p_publish_status='published' then coalesce(published_at,now()) else null end,updated_at=now() where id=p_assignment_id returning * into v_assignment;

  delete from public.assignment_email_notifications where assignment_id=p_assignment_id;
  if v_assignment.notify_students_by_email and v_assignment.publish_status<>'draft' then
    insert into public.assignment_email_notifications(assignment_id,student_id,available_at) select p_assignment_id,sa.student_id,v_assignment.assigned_at from public.student_assignments sa where sa.assignment_id=p_assignment_id;
  end if;
  insert into public.assignment_change_audit(assignment_id,actor_user_id,action,affected_student_ids,affected_question_ids) values(p_assignment_id,v_actor,'update',v_removed_students,v_removed_questions);
  return v_assignment;
end $$;
revoke all on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean) from public;
grant execute on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean) to authenticated;

-- Teacher list now includes editable audience/content/publication data.
drop function if exists public.rpc_get_assignments_for_teacher(uuid);
create function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,student_count integer,assignment_mode text,description text,publish_status text,close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,question_ids uuid[],student_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 return query select a.id,a.teacher_id,a.subject_id,a.subject_name,a.topic_name,a.batch,a.difficulty,a.title,a.instructions,a.assigned_at,a.due_at,a.created_at,a.updated_at,
 (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),(select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id and sa.status='completed'),(select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id),coalesce(a.assignment_mode,'batch'),a.description,a.publish_status,a.close_submissions_after_due,a.notify_students_by_email,a.published_at,
 (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[]) from public.assignment_questions aq where aq.assignment_id=a.id),(select coalesce(array_agg(sa.student_id),'{}'::uuid[]) from public.student_assignments sa where sa.assignment_id=a.id)
 from public.assignments a where a.teacher_id=p_teacher_id and exists(select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=auth.uid()) order by a.assigned_at desc;
end $$;
revoke all on function public.rpc_get_assignments_for_teacher(uuid) from public;
grant execute on function public.rpc_get_assignments_for_teacher(uuid) to authenticated;

-- Hide drafts/future schedules from students; expose late/closed state.
create or replace function public.rpc_get_student_pending_assignments() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_student_id uuid:=auth.uid(); begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
 return (select coalesce(jsonb_agg(payload order by assigned_at),'[]'::jsonb) from (
  select jsonb_build_object('assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()),'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by aq.order_index),'[]'::jsonb) from public.assignment_questions aq join public.questions q on q.id=aq.question_id where aq.assignment_id=a.id)) payload,sa.assigned_at
  from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id
  where sa.student_id=v_student_id and sa.status='pending' and a.publish_status in ('published','scheduled') and a.assigned_at<=now() and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id)
 ) x);
end $$;
revoke all on function public.rpc_get_student_pending_assignments() from public; grant execute on function public.rpc_get_student_pending_assignments() to authenticated;

create or replace function public.rpc_get_student_active_assignment() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_student_id uuid:=auth.uid(); v_assignment_id uuid; payload jsonb; begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
 select sa.assignment_id into v_assignment_id from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id where sa.student_id=v_student_id and sa.status='pending' and a.publish_status in ('published','scheduled') and a.assigned_at<=now() and not(a.close_submissions_after_due and a.due_at is not null and a.due_at<now()) and exists(select 1 from public.assignment_questions aq where aq.assignment_id=a.id) order by sa.assigned_at limit 1;
 if v_assignment_id is null then return null; end if;
 select jsonb_build_object('assignment_id',a.id,'subject_id',a.subject_id,'subject_name',a.subject_name,'topic_name',a.topic_name,'batch',a.batch,'teacher_username',u.username,'assigned_at',a.assigned_at,'due_at',a.due_at,'title',a.title,'instructions',a.instructions,'publish_status',a.publish_status,'close_submissions_after_due',a.close_submissions_after_due,'is_late',(a.due_at is not null and a.due_at<now()),'is_closed',false,'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by aq.order_index),'[]'::jsonb) from public.assignment_questions aq join public.questions q on q.id=aq.question_id where aq.assignment_id=a.id)) into payload from public.assignments a join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id where a.id=v_assignment_id;
 return payload;
end $$;
revoke all on function public.rpc_get_student_active_assignment() from public; grant execute on function public.rpc_get_student_active_assignment() to authenticated;

create or replace function public.rpc_submit_assignment_result(p_assignment_id uuid,p_correct integer,p_incorrect integer,p_accuracy integer,p_score integer,p_time_taken integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_student_id uuid:=auth.uid(); v_assignment_status text; v_question_count int; v_max_score int; v_expected_accuracy int; v_updated_assignment_id uuid; v_due_at timestamptz; v_close boolean; begin
 if v_student_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
 select sa.status,count(aq.question_id)::int,coalesce(sum(coalesce(q.points,0)),0)::int,a.due_at,a.close_submissions_after_due into v_assignment_status,v_question_count,v_max_score,v_due_at,v_close from public.assignments a join public.student_assignments sa on sa.assignment_id=a.id and sa.student_id=v_student_id left join public.assignment_questions aq on aq.assignment_id=a.id left join public.questions q on q.id=aq.question_id where a.id=p_assignment_id group by sa.status,a.due_at,a.close_submissions_after_due;
 if not found then raise exception 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED'; end if;
 if v_close and v_due_at is not null and now()>v_due_at then raise exception 'ASSIGNMENT_CLOSED'; end if;
 if v_question_count<=0 then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS'; end if;
 if v_assignment_status not in ('pending','in_progress') then raise exception 'ASSIGNMENT_NOT_SUBMITTABLE'; end if;
 if exists(select 1 from public.student_assignment_results r where r.assignment_id=p_assignment_id and r.student_id=v_student_id) then raise exception 'ASSIGNMENT_ALREADY_SUBMITTED'; end if;
 if p_correct<0 or p_incorrect<0 or p_time_taken<0 or p_score<0 or p_accuracy<0 or p_accuracy>100 then raise exception 'INVALID_VALUES'; end if;
 if p_correct>v_question_count or p_incorrect>v_question_count or p_correct+p_incorrect<>v_question_count then raise exception 'MISMATCHED_QUESTION_TOTAL'; end if;
 v_expected_accuracy:=round((p_correct::numeric*100.0)/greatest(v_question_count,1)); if abs(p_accuracy-v_expected_accuracy)>1 then raise exception 'INVALID_ACCURACY_CALCULATION'; end if;
 if p_score>greatest(100,v_max_score) then raise exception 'INVALID_SCORE_RANGE'; end if;
 update public.student_assignments set status='completed',completed_at=now() where assignment_id=p_assignment_id and student_id=v_student_id and status in ('pending','in_progress') returning assignment_id into v_updated_assignment_id;
 if v_updated_assignment_id is null then raise exception 'ASSIGNMENT_STATE_TRANSITION_FAILED'; end if;
 insert into public.student_assignment_results(assignment_id,student_id,correct,incorrect,accuracy,score,time_taken_seconds,completed_at,submitted_late) values(p_assignment_id,v_student_id,greatest(p_correct,0),greatest(p_incorrect,0),greatest(p_accuracy,0),greatest(p_score,0),greatest(p_time_taken,0),now(),v_due_at is not null and now()>v_due_at);
end $$;
revoke all on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer) from public; grant execute on function public.rpc_submit_assignment_result(uuid,integer,integer,integer,integer,integer) to authenticated;
'''
Path('supabase/migrations/20260810083000_teacher_assignment_editing_publication.sql').write_text(migration, encoding='utf-8')

# ---- regression tests ---------------------------------------------------
Path('tests/teacherAssignmentEditingPublication.test.ts').write_text(r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx','utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx','utf8');
const gateway = readFileSync('services/rpcGateway.ts','utf8');
const migration = readFileSync('supabase/migrations/20260810083000_teacher_assignment_editing_publication.sql','utf8');

test('assignment cards expose edit beside delete and deletion uses one confirmation', () => {
  assert.match(portal, /Edit assignment/);
  const handler = portal.slice(portal.indexOf('const handleDeleteAssignment'), portal.indexOf('const renderAssignments'));
  assert.equal((handler.match(/await brainsConfirm/g) ?? []).length, 1);
});

test('wizard supports drafts schedules email preference and late policy', () => {
  assert.match(wizard, /Save as draft/);
  assert.match(wizard, /Notify students by email\?/);
  assert.match(wizard, /Close submissions after due date/);
  assert.match(wizard, /Schedule assignment/);
});

test('server owns assignment editing and late close behavior', () => {
  assert.match(gateway, /rpc_update_teacher_assignment/);
  assert.match(migration, /t\.user_id=v_actor/);
  assert.match(migration, /ASSIGNMENT_CLOSED/);
  assert.match(migration, /submitted_late/);
  assert.match(migration, /publish_status in \('draft','scheduled','published'\)/);
  assert.match(migration, /assignment_change_audit/);
});
''', encoding='utf-8')
