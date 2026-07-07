export const CURRENT_ADMISSION_SUBJECTS = ['english', 'maths', 'science'] as const;
export type CurrentAdmissionSubject = typeof CURRENT_ADMISSION_SUBJECTS[number];

type BlueprintLike = { id: string; subject?: string | null; target_grade?: number | null; target_stage?: number | null };
type FormQuestionLike = { question?: QuestionLike | null; adm_questions?: QuestionLike | null };
type QuestionLike = { external_id?: string | null; content_owner?: string | null; content_version?: string | null; pool?: PoolLike | null; adm_question_pools?: PoolLike | null };
type PoolLike = { content_owner?: string | null; content_version?: string | null };
export type AdmissionFormLike = { id: string; blueprint_id: string; form_code: string; status: string; published_at?: string | null; created_at?: string | null; adm_test_form_questions?: FormQuestionLike[] | null };

export function normalizeAdmissionSubjectKey(subject?: string | null): CurrentAdmissionSubject {
  const key = String(subject || '').toLowerCase();
  if (key === 'math' || key === 'maths' || key === 'mathematics') return 'maths';
  if (key === 'science') return 'science';
  return 'english';
}

export function getAdmissionFormSubjectFromCode(formCode?: string | null): CurrentAdmissionSubject | null {
  const code = String(formCode || '').toLowerCase();
  if (code.startsWith('sci')) return 'science';
  if (code.startsWith('mat') || code.startsWith('math')) return 'maths';
  if (code.startsWith('eng')) return 'english';
  return null;
}

export function getAdmissionFormGrade(form: Pick<AdmissionFormLike, 'blueprint_id' | 'form_code'>, blueprints: BlueprintLike[]): number | null {
  const bp = blueprints.find(b => b.id === form.blueprint_id) || null;
  const codeGrade = String(form.form_code || '').match(/(?:G|GRADE|ENG|MAT|MATH|SCI)(\d{1,2})/i)?.[1];
  return bp?.target_grade ?? bp?.target_stage ?? (codeGrade ? Number(codeGrade) : null);
}

export function getAdmissionFormSubject(form: Pick<AdmissionFormLike, 'blueprint_id' | 'form_code'>, blueprints: BlueprintLike[]): CurrentAdmissionSubject {
  const bp = blueprints.find(b => b.id === form.blueprint_id) || null;
  return getAdmissionFormSubjectFromCode(form.form_code) ?? (bp?.subject ? normalizeAdmissionSubjectKey(bp.subject) : 'english');
}

const isCurrentManagedAdmissionQuestion = (formQuestion: FormQuestionLike): boolean => {
  const q = formQuestion.question ?? formQuestion.adm_questions ?? null;
  const pool = q?.pool ?? q?.adm_question_pools ?? null;
  const owner = q?.content_owner ?? pool?.content_owner ?? null;
  const version = q?.content_version ?? pool?.content_version ?? null;
  return !!q?.external_id
    && owner === 'brain_heist'
    && version !== 'legacy-import'
    && (String(version || '').startsWith('adm-bank-v1-g5-') || String(version || '').startsWith('adm-bank-v1-g6-') || String(version || '').startsWith('adm-bank-v1-g7-'));
};

export function isCurrentManagedAdmissionForm(form: AdmissionFormLike): boolean {
  const linkedQuestions = form.adm_test_form_questions ?? [];
  return form.status === 'published'
    && linkedQuestions.length > 0
    && linkedQuestions.every(isCurrentManagedAdmissionQuestion);
}

export function getCurrentAdmissionPackageForms<T extends AdmissionFormLike>(forms: T[], blueprints: BlueprintLike[], grade: number | null | undefined): T[] {
  if (!grade) return [];
  const latestBySubject = new Map<CurrentAdmissionSubject, T>();
  for (const form of forms) {
    const subject = getAdmissionFormSubject(form, blueprints);
    if (!CURRENT_ADMISSION_SUBJECTS.includes(subject)) continue;
    if (getAdmissionFormGrade(form, blueprints) !== grade) continue;
    if (!isCurrentManagedAdmissionForm(form)) continue;
    const existing = latestBySubject.get(subject);
    const formTime = Date.parse(form.published_at || form.created_at || '') || 0;
    const existingTime = existing ? (Date.parse(existing.published_at || existing.created_at || '') || 0) : -1;
    if (!existing || formTime > existingTime) latestBySubject.set(subject, form);
  }
  return CURRENT_ADMISSION_SUBJECTS.map(subject => latestBySubject.get(subject)).filter((form): form is T => !!form);
}
