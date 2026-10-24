import { useEffect, useMemo, useState } from 'react';
import { fetchSchoolSubjectCatalog, type SchoolSubjectCatalog } from '../../../services/schoolSubjectCatalogService';

/** Operational subjects come from School Subjects, not curriculum evidence mappings. */
export function useSchoolSubjectOfferings(schoolId: string) {
  const [catalog, setCatalog] = useState<SchoolSubjectCatalog | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setCatalog(null);
    setError(false);
    void fetchSchoolSubjectCatalog(schoolId).then((next) => {
      if (active) setCatalog(next);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [schoolId]);
  const offerings = useMemo(() => (catalog?.subjects || [])
    .filter((subject) => subject.isActive)
    .flatMap((subject) => subject.offerings
      .filter((offering) => offering.status === 'active' && offering.academicYearId === catalog?.academicYearId)
      .map((offering) => ({ ...offering, schoolSubjectId: subject.id, subjectName: subject.name, academicSubjectId: subject.academicSubjectId }))), [catalog]);
  return { offerings, error };
}
