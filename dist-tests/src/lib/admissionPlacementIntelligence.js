export const deriveAdmissionSubject = (subject, formCode, contentVersion) => {
    const raw = `${subject || ''} ${contentVersion || ''}`.toLowerCase();
    const code = (formCode || '').toUpperCase();
    if (raw.includes('math') || code.startsWith('MAT'))
        return 'math';
    if (raw.includes('english') || code.startsWith('ENG'))
        return 'english';
    if (raw.includes('science') || code.startsWith('SCI'))
        return 'science';
    if (raw.includes('sci_') || raw.includes('biology') || raw.includes('physics') || raw.includes('chem'))
        return 'science';
    return 'unknown';
};
const normalizeSubject = (subject, formCode, contentVersion) => deriveAdmissionSubject(subject, formCode, contentVersion);
const cleanSkill = (answer) => {
    const raw = answer.diagnostic_skill || answer.skill_tag || answer.topic || 'general';
    return String(raw).replace(/^math_/, '').replace(/_/g, ' ');
};
const pct = (score, max) => (max > 0 ? Math.round((score / max) * 100) : 0);
export function calculateDiagnosticBreakdown(answers = []) {
    const grouped = new Map();
    answers.forEach((answer) => {
        const subject = normalizeSubject(answer.subject, answer.form_code, answer.content_version);
        const skill = cleanSkill(answer);
        const difficulty = answer.difficulty || null;
        const key = `${subject}::${skill}::${difficulty || 'all'}`;
        const existing = grouped.get(key) || { key, label: `${title(subject)} · ${skill}`, subject, skill, difficulty, score: 0, maxScore: 0, percentage: 0, total: 0 };
        existing.score += Number(answer.marks_awarded ?? (answer.is_correct ? 1 : 0));
        existing.maxScore += Number(answer.marks_possible ?? 1);
        existing.total += 1;
        existing.percentage = pct(existing.score, existing.maxScore);
        grouped.set(key, existing);
    });
    return [...grouped.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.skill.localeCompare(b.skill) || String(a.difficulty).localeCompare(String(b.difficulty)));
}
export function calculateSubjectReadiness(answers, subject) {
    const rows = answers.filter(a => normalizeSubject(a.subject, a.form_code, a.content_version) === subject);
    if (rows.length === 0)
        return null;
    const score = rows.reduce((sum, a) => sum + Number(a.marks_awarded ?? (a.is_correct ? 1 : 0)), 0);
    const max = rows.reduce((sum, a) => sum + Number(a.marks_possible ?? 1), 0);
    return pct(score, max);
}
export function calculatePlacementRecommendation(profile = {}, answers = [], fallbackPercentage = null) {
    let english = calculateSubjectReadiness(answers, 'english');
    let math = calculateSubjectReadiness(answers, 'math');
    let science = calculateSubjectReadiness(answers, 'science');
    const subjects = [...new Set(answers.map(a => normalizeSubject(a.subject, a.form_code, a.content_version)).filter(s => s !== 'unknown'))];
    const currentSubject = subjects.length === 1 ? subjects[0] : (subjects.length > 1 ? 'unknown' : 'unknown');
    const isPackageReport = subjects.length > 1;
    if (!isPackageReport && currentSubject !== 'unknown' && fallbackPercentage != null) {
        if (currentSubject === 'english')
            english = fallbackPercentage;
        if (currentSubject === 'math')
            math = fallbackPercentage;
        if (currentSubject === 'science')
            science = fallbackPercentage;
    }
    const e = english;
    const m = math;
    const breakdown = calculateDiagnosticBreakdown(answers);
    const strengths = breakdown.filter(r => r.percentage >= 70).slice(0, 4).map(r => `${title(r.subject)} · ${r.skill}`);
    const weakAreas = breakdown.filter(r => r.percentage < 50).slice(0, 4).map(r => `${title(r.subject)} · ${r.skill}`);
    const gradeGap = profile.applied_grade && profile.current_grade ? profile.applied_grade - profile.current_grade : 0;
    const ageGap = expectedAgeGap(profile.age_years ?? ageFromDob(profile.date_of_birth), profile.applied_grade);
    const mismatch = Math.abs(gradeGap || 0) >= 2 || Math.abs(ageGap || 0) >= 2;
    let label = 'Interview recommended';
    if (e != null && m != null) {
        if (e >= 70 && m >= 70)
            label = 'Ready for target grade';
        else if (m >= 70 && e >= 40 && e < 60)
            label = 'Accept with English support';
        else if (e >= 70 && m >= 40 && m < 60)
            label = 'Accept with Maths support';
        else if (e < 35 && m < 35)
            label = (e < 25 && m < 25) ? 'Not ready yet' : 'Consider lower grade placement';
        else if (e >= 50 && m >= 50)
            label = 'Interview recommended';
        else
            label = 'Interview recommended';
    }
    else if (e != null || m != null) {
        const only = e ?? m ?? 0;
        label = only >= 70 ? 'Interview recommended' : only < 35 ? 'Consider lower grade placement' : 'Interview recommended';
    }
    if (mismatch && label === 'Ready for target grade')
        label = 'Interview recommended';
    const interviewFlag = mismatch || label === 'Interview recommended';
    const reasons = buildReasons(e, m, science, currentSubject, isPackageReport, mismatch, profile, strengths, weakAreas);
    return { label, interviewFlag, nextAction: nextAction(label, interviewFlag), reasons, englishPercentage: english, mathsPercentage: math, sciencePercentage: science, currentSubject, isPackageReport, strengths, weakAreas };
}
function buildReasons(e, m, s, currentSubject, isPackageReport, mismatch, profile, strengths, weakAreas) {
    const reasons = [];
    const readiness = { english: e, math: m, science: s };
    if (!isPackageReport && currentSubject in readiness) {
        const value = readiness[currentSubject];
        reasons.push(`${title(currentSubject)} readiness is ${value ?? 'not available yet'}${value != null ? '%' : ''}.`);
    }
    else {
        if (e != null)
            reasons.push(`English readiness is ${e}%.`);
        else
            reasons.push('English readiness is not available yet.');
        if (m != null)
            reasons.push(`Maths readiness is ${m}%.`);
        else
            reasons.push('Maths readiness is not available yet.');
        if (s != null)
            reasons.push(`Science readiness is ${s}%.`);
    }
    if (weakAreas.length)
        reasons.push(`Needs attention in ${weakAreas.slice(0, 2).join(' and ')}.`);
    else if (strengths.length) {
        const uniqueStrengths = [...new Set(strengths)].slice(0, 2);
        reasons.push(`Strongest evidence: ${uniqueStrengths.join(' and ')}.`);
    }
    if (mismatch)
        reasons.push(`Age or current grade does not closely match the applied grade${profile.applied_grade ? ` (${profile.applied_grade})` : ''}.`);
    return reasons.slice(0, 4);
}
function nextAction(label, interviewFlag) {
    if (interviewFlag)
        return 'Schedule an admissions interview and review school records.';
    if (label.includes('English support'))
        return 'Offer a place with an English support plan.';
    if (label.includes('Maths support'))
        return 'Offer a place with a Maths support plan.';
    if (label === 'Ready for target grade')
        return 'Proceed with target-grade admission review.';
    if (label === 'Not ready yet')
        return 'Discuss alternatives or retesting after preparation.';
    return 'Review lower-grade fit with the academic lead.';
}
function title(s) { if (s === 'math')
    return 'Maths'; return s ? s[0].toUpperCase() + s.slice(1) : 'General'; }
function ageFromDob(dob) { if (!dob)
    return null; const t = new Date(dob).getTime(); if (Number.isNaN(t))
    return null; return Math.floor((Date.now() - t) / 31557600000); }
function expectedAgeGap(age, grade) { if (!age || !grade)
    return 0; return age - (grade + 5); }
