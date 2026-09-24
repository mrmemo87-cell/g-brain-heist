import React, { useEffect, useMemo, useState } from 'react';
import {
  archiveSchoolSubjectGroup,
  fetchSchoolSubjectGroupRoster,
  fetchSchoolSubjectGroups,
  saveSchoolSubjectGroup,
  setSchoolSubjectDelivery,
  setSchoolSubjectGroupStudents,
  setSchoolSubjectGroupTeacher,
  type SchoolSubjectGroup,
  type SubjectDeliveryMode,
} from '../../services/schoolSubjectGroupService';
import type { SchoolSubjectOffering } from '../../services/schoolSubjectCatalogService';
import { brainsConfirm } from '../../src/utils/brainsAlert';

type Props = {
  schoolId: string;
  subjectName: string;
  offering: SchoolSubjectOffering;
  classes: any[];
  students: any[];
  teachers: any[];
  addToast: (message: string, tone?: 'success' | 'error' | 'info' | 'warning') => void;
  onChanged?: () => Promise<void> | void;
};

const studentId = (student: any) => student?.user_id || student?.id;
const studentName = (student: any) => student?.full_name || student?.username || student?.email || 'Student';
const teacherName = (teacher: any) => teacher?.full_name || teacher?.username || teacher?.email || 'Teacher';
const className = (item: any) => item?.class_name || item?.class_code || 'Class';

const deliveryCopy: Record<SubjectDeliveryMode, { title: string; description: string }> = {
  by_class: {
    title: 'Use registration classes',
    description: 'Keep students in their normal school classes such as 8A, 8B and 8C.',
  },
  whole_grade: {
    title: 'Teach the whole grade together',
    description: 'Create one teaching group containing every eligible student in this grade.',
  },
  custom_groups: {
    title: 'Mix students across classes',
    description: 'Best for ESL, electives and interventions: combine selected students from 8A, 8B, 8C, etc. without moving their registration class.',
  },
};

const SubjectTeachingGroupsPanel: React.FC<Props> = ({
  schoolId,
  subjectName,
  offering,
  classes,
  students,
  teachers,
  addToast,
  onChanged,
}) => {
  const [groups, setGroups] = useState<SchoolSubjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [rosters, setRosters] = useState<Record<string, Set<string>>>({});
  const [rosterSearch, setRosterSearch] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchSchoolSubjectGroups(schoolId, offering.id);
      setGroups(next);
      const custom = next.filter((group) => group.groupType === 'custom');
      const loaded = await Promise.all(custom.map(async (group) => {
        const roster = await fetchSchoolSubjectGroupRoster(schoolId, group.id);
        return [group.id, new Set(roster.map((student) => student.student_id))] as const;
      }));
      setRosters(Object.fromEntries(loaded));
    } catch (error) {
      console.error('Unable to load teaching groups', error);
      addToast(error instanceof Error ? error.message : 'Teaching groups could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [schoolId, offering.id]);

  const gradeClasses = useMemo(() => (classes || [])
    .filter((item: any) => item.is_active !== false && String(item.grade_level) === String(offering.gradeLevel))
    .sort((a: any, b: any) => className(a).localeCompare(className(b))), [classes, offering.gradeLevel]);

  const eligibleStudents = useMemo(() => {
    const grade = (students || []).filter((student: any) => String(student.grade) === String(offering.gradeLevel));
    if (offering.accessMode === 'all_grade') return grade;
    const allowed = new Set(offering.selectedStudentIds || []);
    return grade.filter((student: any) => allowed.has(studentId(student)));
  }, [offering.accessMode, offering.gradeLevel, offering.selectedStudentIds, students]);

  const availableTeachers = useMemo(() => (teachers || [])
    .filter((teacher: any) => teacher?.user_id && teacher?.status !== 'removed' && teacher?.can_teach !== false)
    .sort((a: any, b: any) => teacherName(a).localeCompare(teacherName(b))), [teachers]);

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      addToast(success, 'success');
      await load();
      await onChanged?.();
    } catch (error) {
      console.error('Teaching group action failed', error);
      addToast(error instanceof Error ? error.message : 'The teaching-group change could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeDelivery = async (mode: SubjectDeliveryMode) => {
    if (mode === offering.deliveryMode) return;
    const hasGroups = groups.length > 0;
    let confirmed = true;
    if (hasGroups) {
      confirmed = await brainsConfirm({
        title: 'Change teaching setup?',
        message: 'Current teaching groups will be archived so historical assignments remain reproducible. You will then create the replacement groups for this delivery model.',
        confirmLabel: 'Change teaching setup',
        cancelLabel: 'Keep current setup',
        destructive: false,
      });
    }
    if (!confirmed) return;
    await run(
      () => setSchoolSubjectDelivery({
        schoolId,
        offeringId: offering.id,
        deliveryMode: mode,
        confirmArchive: hasGroups,
      }),
      'Teaching setup updated.',
    );
  };

  const createDefaultGroups = async () => {
    if (offering.deliveryMode === 'by_class') {
      const existing = new Set(groups.filter((group) => group.groupType === 'class').map((group) => group.registrationClassId));
      const missing = gradeClasses.filter((item: any) => !existing.has(item.id));
      if (!missing.length) {
        addToast('All registration classes already have teaching groups.', 'info');
        return;
      }
      await run(async () => {
        for (const schoolClass of missing) {
          await saveSchoolSubjectGroup({
            schoolId,
            offeringId: offering.id,
            name: `${schoolClass.class_code || className(schoolClass)} · ${subjectName}`,
            groupType: 'class',
            registrationClassId: schoolClass.id,
          });
        }
      }, `${missing.length} class teaching group${missing.length === 1 ? '' : 's'} created.`);
      return;
    }

    if (offering.deliveryMode === 'whole_grade') {
      if (groups.some((group) => group.groupType === 'whole_grade')) {
        addToast('The whole-grade teaching group already exists.', 'info');
        return;
      }
      await run(async () => {
        await saveSchoolSubjectGroup({
          schoolId,
          offeringId: offering.id,
          name: `Grade ${offering.gradeLevel} · ${subjectName}`,
          groupType: 'whole_grade',
        });
      }, 'Whole-grade teaching group created.');
      return;
    }

    if (!newGroupName.trim()) {
      addToast('Enter a teaching-group name.', 'info');
      return;
    }
    const groupName = newGroupName.trim();
    await run(async () => {
      await saveSchoolSubjectGroup({
        schoolId,
        offeringId: offering.id,
        name: groupName,
        groupType: 'custom',
      });
      setNewGroupName('');
    }, `${groupName} created.`);
  };

  const saveRoster = async (group: SchoolSubjectGroup) => {
    const ids = Array.from(rosters[group.id] || []);
    if (!ids.length) {
      addToast('Select at least one student for this custom teaching group.', 'info');
      return;
    }
    await run(
      () => setSchoolSubjectGroupStudents(schoolId, group.id, ids),
      `${group.name} roster updated.`,
    );
  };

  const toggleRosterStudent = (groupId: string, id: string) => {
    setRosters((current) => {
      const next = new Set(current[groupId] || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...current, [groupId]: next };
    });
  };

  const addTeacher = async (group: SchoolSubjectGroup, userId: string) => {
    if (!userId) return;
    await run(
      () => setSchoolSubjectGroupTeacher({
        schoolId,
        groupId: group.id,
        teacherUserId: userId,
        active: true,
        canCreate: true,
        canGrade: true,
      }),
      `Teacher allocated to ${group.name}.`,
    );
  };

  const removeTeacher = async (group: SchoolSubjectGroup, userId: string) => {
    await run(
      () => setSchoolSubjectGroupTeacher({
        schoolId,
        groupId: group.id,
        teacherUserId: userId,
        active: false,
        canCreate: true,
        canGrade: true,
      }),
      `Teacher removed from ${group.name}.`,
    );
  };

  const archiveGroup = async (group: SchoolSubjectGroup) => {
    const confirmed = await brainsConfirm({
      title: `Archive ${group.name}?`,
      message: 'Current staffing and custom roster access will stop. Historical assignments and reports remain attached to this teaching group.',
      confirmLabel: 'Archive group',
      cancelLabel: 'Keep group',
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => archiveSchoolSubjectGroup(schoolId, group.id), `${group.name} archived.`);
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Loading teaching groups…</div>;
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Teaching delivery</p>
        <h5 className="mt-1 text-base font-bold text-slate-950">How is {subjectName} taught in Grade {offering.gradeLevel}?</h5>
        <p className="mt-1 text-xs leading-5 text-slate-500">A registration class is where the student belongs at school (for example 8A). A teaching group is only who learns this subject together (for example Grade 8 ESL). Creating an ESL group never moves students out of 8A, 8B or 8C.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {(Object.keys(deliveryCopy) as SubjectDeliveryMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={busy}
            onClick={() => void changeDelivery(mode)}
            className={`rounded-2xl border p-4 text-left transition ${offering.deliveryMode === mode ? 'border-blue-500 bg-white ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <strong className="block text-sm text-slate-950">{deliveryCopy[mode].title}</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{deliveryCopy[mode].description}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <strong className="text-sm text-slate-900">
            {offering.deliveryMode === 'by_class'
              ? 'Registration-class groups'
              : offering.deliveryMode === 'whole_grade'
                ? 'Whole-grade group'
                : 'Custom teaching groups'}
          </strong>
          <p className="mt-1 text-xs text-slate-500">
            {groups.length} active group{groups.length === 1 ? '' : 's'} · {eligibleStudents.length} eligible student{eligibleStudents.length === 1 ? '' : 's'}
          </p>
          {offering.deliveryMode === 'custom_groups' && offering.accessMode === 'selected' ? (
            <p className="mt-2 text-[11px] font-medium text-blue-700">The first custom group automatically starts with the students already selected for this subject.</p>
          ) : null}
          {offering.deliveryMode === 'custom_groups' ? (
            <input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder={`e.g. Grade ${offering.gradeLevel} ${subjectName}`}
              className="mt-3 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
            />
          ) : null}
        </div>
        <button type="button" disabled={busy} onClick={() => void createDefaultGroups()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">
          {offering.deliveryMode === 'custom_groups' ? 'Add teaching group' : groups.length ? 'Create missing groups' : 'Create teaching group'}
        </button>
      </div>

      {groups.length ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const selected = rosters[group.id] || new Set<string>();
            const search = (rosterSearch[group.id] || '').trim().toLowerCase();
            const visible = eligibleStudents.filter((student: any) => !search || [studentName(student), student.email, student.batch]
              .some((value) => String(value || '').toLowerCase().includes(search)));
            const allocated = new Set(group.teachers.map((teacher) => teacher.userId));
            return (
              <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h6 className="text-sm font-bold text-slate-950">{group.name}</h6>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{group.groupType.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{group.studentCount} student{group.studentCount === 1 ? '' : 's'} · {group.teachers.length} teacher{group.teachers.length === 1 ? '' : 's'}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void archiveGroup(group)} className="self-start rounded-lg px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">Archive</button>
                </div>

                <div className="mt-4">
                  <span className="text-xs font-bold text-slate-700">Teachers</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.teachers.map((teacher) => (
                      <span key={teacher.userId} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        {teacher.name}
                        <button type="button" disabled={busy} onClick={() => void removeTeacher(group, teacher.userId)} className="text-rose-600" aria-label={`Remove ${teacher.name} from ${group.name}`}>×</button>
                      </span>
                    ))}
                    <select
                      aria-label={`Add teacher to ${group.name}`}
                      value=""
                      disabled={busy || availableTeachers.every((teacher: any) => allocated.has(teacher.user_id))}
                      onChange={(event) => { const value = event.target.value; if (value) void addTeacher(group, value); }}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
                    >
                      <option value="">+ Add teacher</option>
                      {availableTeachers.filter((teacher: any) => !allocated.has(teacher.user_id)).map((teacher: any) => (
                        <option key={teacher.user_id} value={teacher.user_id}>{teacherName(teacher)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {group.groupType === 'custom' ? (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700">Custom roster</span>
                        <p className="mt-1 text-[11px] text-slate-500">{selected.size} of {eligibleStudents.length} eligible students selected.</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setRosters((current) => ({ ...current, [group.id]: new Set(eligibleStudents.map(studentId)) }))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-blue-700">Select all</button>
                        <button type="button" onClick={() => setRosters((current) => ({ ...current, [group.id]: new Set() }))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">Clear</button>
                      </div>
                    </div>
                    <input
                      value={rosterSearch[group.id] || ''}
                      onChange={(event) => setRosterSearch((current) => ({ ...current, [group.id]: event.target.value }))}
                      placeholder="Search eligible students…"
                      className="mt-3 h-9 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-blue-500"
                    />
                    <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-2">
                      {visible.length ? visible.map((student: any) => {
                        const id = studentId(student);
                        const checked = selected.has(id);
                        return (
                          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRosterStudent(group.id, id)} className="h-4 w-4 accent-blue-700" />
                            <span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{studentName(student)}</strong><span className="text-[11px] text-slate-500">{student.batch || `Grade ${offering.gradeLevel}`}</span></span>
                          </label>
                        );
                      }) : <p className="p-4 text-center text-xs text-slate-500">No eligible students match this search.</p>}
                    </div>
                    <div className="mt-3 flex justify-end"><button type="button" disabled={busy || selected.size === 0} onClick={() => void saveRoster(group)} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">Save roster</button></div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                    Student membership is derived automatically from the {group.groupType === 'class' ? 'registration class' : 'grade roster'} and the subject’s access rules.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center">
          <strong className="text-sm text-slate-800">No teaching groups yet</strong>
          <p className="mt-1 text-xs text-slate-500">Create the teaching structure before allocating teachers or publishing assignments for this offering.</p>
        </div>
      )}
    </section>
  );
};

export default SubjectTeachingGroupsPanel;
