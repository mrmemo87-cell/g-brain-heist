import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchSchoolAcademicSetup,
  saveAcademicYear,
  saveSubjectOfferings,
  seedCurrentStudentEnrolments,
  setStudentElective,
  type AcademicFrameworkSetup,
  type SchoolAcademicSetup,
} from '../../services/schoolAcademicSetupService';
import { useSchoolAdmin } from './SchoolAdminContext';

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const currentYearDefaults = () => {
  const today = new Date();
  const firstYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return {
    name: `${firstYear}/${firstYear + 1}`,
    startsOn: `${firstYear}-08-01`,
    endsOn: `${firstYear + 1}-06-30`,
  };
};

type Requirement = 'required' | 'elective';

const AcademicSetupPanel: React.FC = () => {
  const { school, students, addToast } = useSchoolAdmin();
  const defaults = useMemo(currentYearDefaults, []);
  const [setup, setSetup] = useState<SchoolAcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearName, setYearName] = useState(defaults.name);
  const [startsOn, setStartsOn] = useState(defaults.startsOn);
  const [endsOn, setEndsOn] = useState(defaults.endsOn);
  const [yearId, setYearId] = useState('');
  const [frameworkVersionId, setFrameworkVersionId] = useState('');
  const [activeGrade, setActiveGrade] = useState(6);
  const [requirements, setRequirements] = useState<Record<string, Requirement>>({});
  const [electiveStudentId, setElectiveStudentId] = useState('');
  const [electiveSubjectId, setElectiveSubjectId] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSchoolAcademicSetup(school.id);
      setSetup(next);
      const currentYear = next.years.find((year) => year.status === 'current') || next.years[0];
      if (currentYear) {
        setYearId(currentYear.id);
        setYearName(currentYear.name);
        setStartsOn(currentYear.startsOn);
        setEndsOn(currentYear.endsOn);
      }
      if (next.frameworks[0]) setFrameworkVersionId((value) => value || next.frameworks[0].versionId);
      const existing: Record<string, Requirement> = {};
      next.offerings.forEach((offering) => {
        existing[`${offering.gradeLevel}:${offering.academicSubjectId}`] = offering.subjectRequirement;
      });
      setRequirements(existing);
    } catch (loadError) {
      console.error('Failed to load school academic setup', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Academic setup is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [school.id]);

  const framework: AcademicFrameworkSetup | undefined = setup?.frameworks.find(
    (item) => item.versionId === frameworkVersionId,
  );
  const selectedYear = setup?.years.find((year) => year.id === yearId);
  const selectedCount = framework?.subjects.filter((subject) => requirements[`${activeGrade}:${subject.academicSubjectId}`]).length ?? 0;
  const electiveOfferings = (setup?.offerings || []).filter((offering) => offering.academicYearId === yearId && offering.subjectRequirement === 'elective');

  const handleSaveYear = async () => {
    setSaving(true);
    try {
      const savedYearId = await saveAcademicYear({
        schoolId: school.id,
        yearId: yearId || null,
        name: yearName,
        startsOn,
        endsOn,
        status: 'current',
      });
      setYearId(savedYearId);
      addToast('Current academic year saved.', 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Academic year could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = (subjectId: string) => {
    const key = `${activeGrade}:${subjectId}`;
    setRequirements((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = 'required';
      return next;
    });
  };

  const handleSaveGrade = async () => {
    if (!yearId || !framework) return;
    const offerings = framework.subjects.flatMap((subject) => {
      const requirement = requirements[`${activeGrade}:${subject.academicSubjectId}`];
      const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
      return requirement && scope ? [{
        gradeLevel: String(activeGrade),
        academicSubjectId: subject.academicSubjectId,
        scopeId: scope.scopeId,
        subjectRequirement: requirement,
      }] : [];
    });
    if (!offerings.length) {
      addToast(`Choose at least one subject for Grade ${activeGrade}.`, 'info');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSubjectOfferings({ schoolId: school.id, academicYearId: yearId, offerings });
      const enrolled = await seedCurrentStudentEnrolments(school.id, yearId);
      addToast(`Grade ${activeGrade} saved: ${saved} subjects. ${enrolled} current student enrolments added.`, 'success');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Grade subject plan could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddElective = async () => {
    if (!yearId || !electiveStudentId || !electiveSubjectId) return;
    setSaving(true);
    try {
      await setStudentElective({
        schoolId: school.id,
        academicYearId: yearId,
        studentId: electiveStudentId,
        academicSubjectId: electiveSubjectId,
      });
      addToast('Student elective enrolment saved.', 'success');
      setElectiveStudentId('');
      setElectiveSubjectId('');
      await load();
    } catch (saveError) {
      addToast(saveError instanceof Error ? saveError.message : 'Student elective could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="admin-form-card"><p>Loading academic setup…</p></section>;
  if (error || !setup) return <section className="admin-form-card"><h3>Academic setup unavailable</h3><p>{error}</p><button type="button" className="admin-button-primary" onClick={() => void load()}>Try again</button></section>;

  return <div className="space-y-6">
    <section className="admin-form-card" aria-labelledby="academic-year-heading">
      <div className="admin-card-heading"><div><h3 id="academic-year-heading">1. Academic year</h3><p>This calendar anchors every class, assignment and progress record.</p></div>{selectedYear ? <span className="admin-live-pill"><i /> {selectedYear.status}</span> : null}</div>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Year name <i>Required</i></span><input value={yearName} onChange={(event) => setYearName(event.target.value)} placeholder="2026/2027" /></label>
        <label className="admin-field"><span>Starts</span><input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
        <label className="admin-field"><span>Ends</span><input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
      </div>
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearName.trim() || !startsOn || !endsOn} onClick={handleSaveYear}>{saving ? 'Saving…' : 'Save as current year'}</button></div>
    </section>

    <section className="admin-form-card" aria-labelledby="framework-heading">
      <div className="admin-card-heading"><div><h3 id="framework-heading">2. Published academic framework</h3><p>Only reviewed and published packages can make questions visible to students.</p></div></div>
      <label className="admin-field admin-field-wide"><span>Framework version</span><select value={frameworkVersionId} onChange={(event) => setFrameworkVersionId(event.target.value)} disabled={!setup.frameworks.length}>{setup.frameworks.map((item) => <option key={item.versionId} value={item.versionId}>{item.name} · {item.versionName}</option>)}</select></label>
      {framework ? <div className="admin-access-note"><strong>{framework.name}</strong><span>Original {framework.providerName} framework · version {framework.versionCode}. Cambridge, IB and American standards packages stay unavailable until their licensed or reviewed content is published.</span></div> : <div className="admin-empty-state"><h3>No published framework</h3><p>A governed framework must be published before the school can offer subjects.</p></div>}
    </section>

    <section className="admin-table-card" aria-labelledby="grade-subject-heading">
      <div className="admin-card-heading"><div><h3 id="grade-subject-heading">3. Subjects by grade</h3><p>Configure each grade separately. Required subjects reach the whole grade; electives reach only enrolled students.</p></div><span>{selectedCount} selected for Grade {activeGrade}</span></div>
      <div className="admin-row-actions" role="tablist" aria-label="Grade levels">{GRADES.map((grade) => <button type="button" role="tab" aria-selected={grade === activeGrade} className={grade === activeGrade ? 'admin-button-primary admin-button-small' : 'admin-button-ghost admin-button-small'} key={grade} onClick={() => setActiveGrade(grade)}>Grade {grade}</button>)}</div>
      {framework ? <div className="admin-table-scroll"><table><thead><tr><th>Teach</th><th>Subject</th><th>Type</th><th>Approved questions</th></tr></thead><tbody>{framework.subjects.map((subject) => {
        const key = `${activeGrade}:${subject.academicSubjectId}`;
        const requirement = requirements[key];
        const scope = subject.scopes.find((item) => item.gradeLevel === activeGrade);
        return <tr key={subject.academicSubjectId}><td><input type="checkbox" checked={Boolean(requirement)} onChange={() => toggleSubject(subject.academicSubjectId)} aria-label={`Teach ${subject.name} in Grade ${activeGrade}`} /></td><td><strong>{subject.name}</strong><br/><span className="admin-muted">{subject.category === 'core' ? 'Core academic subject' : 'Additional / optional subject'}</span></td><td><select value={requirement || 'required'} disabled={!requirement} onChange={(event) => setRequirements((current) => ({ ...current, [key]: event.target.value as Requirement }))}><option value="required">Required</option><option value="elective">Elective</option></select></td><td>{scope?.approvedQuestionCount ?? 0}<br/><span className="admin-muted">{scope?.objectiveCount ?? 0} objectives</span></td></tr>;
      })}</tbody></table></div> : null}
      <div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !yearId || !framework || selectedCount === 0} onClick={handleSaveGrade}>{saving ? 'Saving…' : `Save Grade ${activeGrade}`}</button></div>
      {!yearId ? <p className="admin-muted">Save the current academic year before configuring grades.</p> : null}
    </section>

    <section className="admin-form-card" aria-labelledby="elective-heading"><div className="admin-card-heading"><div><h3 id="elective-heading">4. Elective students</h3><p>Additional subjects remain invisible until the school enrols the individual student.</p></div><span>{setup.electiveEnrolments.length} active</span></div><div className="admin-form-grid"><label className="admin-field admin-field-wide"><span>Student</span><select value={electiveStudentId} onChange={(event) => setElectiveStudentId(event.target.value)}><option value="">Choose student</option>{(students || []).map((student: { user_id: string; username: string; full_name?: string | null; grade?: number | null }) => <option key={student.user_id} value={student.user_id}>{student.full_name || student.username}{student.grade ? ` · Grade ${student.grade}` : ''}</option>)}</select></label><label className="admin-field admin-field-wide"><span>Elective subject</span><select value={electiveSubjectId} onChange={(event) => setElectiveSubjectId(event.target.value)}><option value="">Choose offered elective</option>{electiveOfferings.map((offering) => <option key={`${offering.gradeLevel}:${offering.academicSubjectId}`} value={offering.academicSubjectId}>{offering.subjectName} · Grade {offering.gradeLevel}</option>)}</select></label></div><div className="admin-form-actions"><button type="button" className="admin-button-primary" disabled={saving || !electiveStudentId || !electiveSubjectId} onClick={handleAddElective}>Enrol student</button></div></section>

    <section className="admin-form-card"><div className="admin-card-heading"><div><h3>5. Classes, students and teachers</h3><p>After grade subjects are saved, use Classes &amp; Registration to place students and Teacher Assignments to assign staff.</p></div></div><div className="admin-access-note"><strong>Student visibility rule</strong><span>Current year + framework version + grade + subject. Class or named-student scope is added when a teacher publishes an assignment.</span></div></section>
  </div>;
};

export default AcademicSetupPanel;
