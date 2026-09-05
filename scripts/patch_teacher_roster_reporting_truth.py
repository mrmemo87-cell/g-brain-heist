from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding='utf-8')
    if new in text:
        print(f'{label} already materialized; skipping patch.')
        return False
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{label} materialized.')
    return True


def replace_first_of(path: Path, old_blocks: list[str], new: str, label: str) -> bool:
    text = path.read_text(encoding='utf-8')

    # If the target block already exists, still remove any stale roster-loader
    # variants that may have been reintroduced by another materializer. Keeping
    # two effects is dangerous because the stale entitlement-gated effect can
    # clear a correct roster after the canonical workspace response arrives.
    if new in text:
        cleaned = False
        for old in old_blocks:
            if old in text:
                text = text.replace(old, '', 1)
                cleaned = True
        if cleaned:
            path.write_text(text, encoding='utf-8')
            print(f'{label} duplicate legacy block removed.')
            return True
        print(f'{label} already materialized; skipping patch.')
        return False

    for old in old_blocks:
        if old in text:
            path.write_text(text.replace(old, new, 1), encoding='utf-8')
            print(f'{label} materialized.')
            return True

    raise SystemExit(f'{label}: expected source block not found')


def insert_before_once(path: Path, marker: str, block: str, label: str) -> bool:
    text = path.read_text(encoding='utf-8')
    if block in text:
        print(f'{label} already materialized; skipping patch.')
        return False
    if marker not in text:
        raise SystemExit(f'{label}: insertion marker not found')
    path.write_text(text.replace(marker, block + marker, 1), encoding='utf-8')
    print(f'{label} materialized.')
    return True


portal = Path('components/TeacherPortal.tsx')
collective = Path('components/CollectiveAssignmentReport.tsx')

legacy_roster_effect = """  useEffect(() => {\n    if (!effectiveEntitlements) return;\n    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {\n      setAvailableStudents([]);\n      setAssignments([]);\n      return;\n    }\n\n    void GameService.get_students_for_assignment()\n      .then(setAvailableStudents)\n      .catch((error) => {\n        console.error('Error loading students:', error);\n        setAvailableStudents([]);\n      });\n    void GameService.get_teacher_assignments()\n      .then(setAssignments)\n      .catch((error) => {\n        console.error('Error loading assignments:', error);\n        setAssignments([]);\n      });\n  }, [canUseTeacherFeature, effectiveEntitlements]);"""

assignment_gate_only_fix = """  useEffect(() => {\n    if (!effectiveEntitlements) return;\n\n    // The class roster is core school membership data, not a paid assignment\n    // capability. Always load the teacher's authorized roster so My Classes,\n    // dashboard counts, reporting context, and student selection stay truthful\n    // on every plan. Assignment creation/history remains entitlement-gated below.\n    void GameService.get_students_for_assignment()\n      .then(setAvailableStudents)\n      .catch((error) => {\n        console.error('Error loading teacher roster:', error);\n        setAvailableStudents([]);\n      });\n\n    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {\n      setAssignments([]);\n      return;\n    }\n\n    void GameService.get_teacher_assignments()\n      .then(setAssignments)\n      .catch((error) => {\n        console.error('Error loading assignments:', error);\n        setAssignments([]);\n      });\n  }, [canUseTeacherFeature, effectiveEntitlements]);"""

profile_scoped_roster_effects = """  useEffect(() => {\n    let cancelled = false;\n\n    // A teacher's authorized class roster is core school data. It must load even\n    // when the school has never started a Pilot and before entitlement state is\n    // initialized. Billing only gates paid capabilities; it never hides students.\n    void GameService.get_students_for_assignment()\n      .then((students) => {\n        if (!cancelled) setAvailableStudents(students);\n      })\n      .catch((error) => {\n        console.error('Error loading teacher roster:', error);\n        if (!cancelled) setAvailableStudents([]);\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [profile.id]);\n\n  useEffect(() => {\n    if (!effectiveEntitlements) return;\n\n    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {\n      setAssignments([]);\n      return;\n    }\n\n    void GameService.get_teacher_assignments()\n      .then(setAssignments)\n      .catch((error) => {\n        console.error('Error loading assignments:', error);\n        setAssignments([]);\n      });\n  }, [canUseTeacherFeature, effectiveEntitlements]);"""

resolved_teacher_roster_effects = """  useEffect(() => {\n    if (!teacher?.id) return;\n\n    let cancelled = false;\n\n    // Roster visibility follows the resolved teacher record, not billing state\n    // and not a second teacher-profile lookup. This keeps My Classes truthful\n    // even for schools that have never started a Pilot.\n    void GameService.get_students_for_assignment(teacher.id)\n      .then((students) => {\n        if (!cancelled) setAvailableStudents(students);\n      })\n      .catch((error) => {\n        console.error('Error loading teacher roster:', error);\n        if (!cancelled) setAvailableStudents([]);\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [teacher?.id]);\n\n  useEffect(() => {\n    if (!effectiveEntitlements || !teacher?.id) return;\n\n    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {\n      setAssignments([]);\n      return;\n    }\n\n    void GameService.get_teacher_assignments(teacher.id)\n      .then(setAssignments)\n      .catch((error) => {\n        console.error('Error loading assignments:', error);\n        setAssignments([]);\n      });\n  }, [canUseTeacherFeature, effectiveEntitlements, teacher?.id]);"""

assignment_only_effect = """  useEffect(() => {\n    if (!effectiveEntitlements || !teacher?.id) return;\n\n    // Assignment history is a plan capability. Core class/student visibility is\n    // loaded independently by rpc_get_my_teacher_class_roster during teacher boot.\n    if (!canUseTeacherFeature(FEATURE_KEYS.ASSIGNMENTS)) {\n      setAssignments([]);\n      return;\n    }\n\n    void GameService.get_teacher_assignments(teacher.id)\n      .then(setAssignments)\n      .catch((error) => {\n        console.error('Error loading assignments:', error);\n        setAssignments([]);\n      });\n  }, [canUseTeacherFeature, effectiveEntitlements, teacher?.id]);"""

replace_first_of(
    portal,
    [
        legacy_roster_effect,
        assignment_gate_only_fix,
        profile_scoped_roster_effects,
        resolved_teacher_roster_effects,
    ],
    assignment_only_effect,
    'Teacher assignment effect separated from canonical roster workspace',
)

canonical_workspace_loader = """      // My Classes is core school membership data, not assignment data. Load the\n      // teacher's classes/students from one auth-scoped canonical workspace RPC so\n      // a paid-feature effect can never replace a valid roster with an empty list.\n      void supabase.rpc('rpc_get_my_teacher_class_roster')\n        .then(({ data, error }) => {\n          if (error) throw error;\n\n          const studentsById = new Map<string, StudentForAssignment>();\n          ((data || []) as any[]).forEach((row) => {\n            if (!row?.student_id) return;\n            studentsById.set(row.student_id, {\n              id: row.student_id,\n              username: row.student_username || row.student_display_name || 'Student',\n              display_name: row.student_display_name || row.student_username || 'Student',\n              grade: row.student_grade || null,\n              batch: row.class_code || null,\n              avatar_url: row.student_avatar_url || null,\n              school_id: row.school_id || null,\n              class_id: row.class_id || null,\n              class_code: row.class_code || null,\n              assignment_eligible: row.assignment_eligible !== false,\n              access_status: row.access_status || 'active',\n              banned_until: row.banned_until || null,\n            } as StudentForAssignment);\n          });\n\n          setAvailableStudents(Array.from(studentsById.values()));\n        })\n        .catch((error) => {\n          console.error('Error loading canonical teacher class roster:', error);\n          // Do not silently manufacture a zero. The assignment roster RPC is kept\n          // only as a compatibility fallback while older deployments roll off.\n          void GameService.get_students_for_assignment()\n            .then(setAvailableStudents)\n            .catch((fallbackError) => {\n              console.error('Canonical and fallback teacher roster loads failed:', fallbackError);\n            });\n        });\n\n"""

insert_before_once(
    portal,
    "      void SchoolAdminService.getTeacherAllocatedClasses()",
    canonical_workspace_loader,
    'Canonical teacher class roster workspace loader',
)

replace_once(
    portal,
    "          student_name: officialNames.get(row.student_id) || 'Student name unavailable',",
    "          student_name: officialNames.get(row.student_id) || row.student_name || 'Student name unavailable',",
    'Assignment report official-name fallback',
)

replace_once(
    collective,
    """  useEffect(() => {\n    if (!studentRows.length || studentSelectionReady) return;\n    setSelectedStudentIds(studentRows.map((student) => student.studentId));\n    setStudentSelectionReady(true);\n  }, [studentRows, studentSelectionReady]);""",
    """  useEffect(() => {\n    // Wait for historical assignment rows before taking the initial selection\n    // snapshot. A current roster can load before a transferred/suspended\n    // student's historical result, which must never make real evidence vanish.\n    if (loading || !studentRows.length || studentSelectionReady) return;\n    setSelectedStudentIds(studentRows.map((student) => student.studentId));\n    setStudentSelectionReady(true);\n  }, [loading, studentRows, studentSelectionReady]);""",
    'Collective report historical-student selection barrier',
)
