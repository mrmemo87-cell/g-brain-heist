import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Could not find ${label}`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// SetupWizard: school grade/class choices must come from the school, not from
// the solo-player hard-coded grade list. Schools with no configured classes
// must still allow a student to finish registration and enter placement queue.
// ---------------------------------------------------------------------------
{
  const file = 'components/onboarding/SetupWizard.tsx';
  let source = readFileSync(file, 'utf8');

  source = replaceOnce(
    source,
    "  const batchOptions = grade ? GRADE_TO_BATCH[grade] : ['N/A'];\n",
    "  const batchOptions = grade ? GRADE_TO_BATCH[grade] : ['N/A'];\n  const schoolGradeOptions = Array.from(new Set(\n    approvedClasses\n      .map((item) => Number(item.grade_level))\n      .filter((value) => Number.isInteger(value) && value >= 6 && value <= 12),\n  )).sort((a, b) => a - b) as Grade[];\n  const schoolHasConfiguredGrades = schoolGradeOptions.length > 0;\n  const studentGradeRequired = path === 'individual' || schoolHasConfiguredGrades;\n",
    'school grade source-of-truth helpers',
  );

  source = replaceOnce(
    source,
    "    if (finalRole === 'student' && !grade) {\n      setError('Please select your grade and class');\n      return;\n    }",
    "    if (finalRole === 'student' && studentGradeRequired && !grade) {\n      setError(path === 'school'\n        ? 'Please select a grade configured by your school.'\n        : 'Please select your grade and class');\n      return;\n    }",
    'student grade validation',
  );

  source = replaceOnce(
    source,
    "          <span className=\"text-sm font-medium text-gray-300 mb-2 block\">Grade *</span>",
    "          <span className=\"text-sm font-medium text-gray-300 mb-2 block\">\n            {path === 'school' && !schoolHasConfiguredGrades ? 'Grade' : 'Grade *'}\n          </span>",
    'grade label',
  );

  source = replaceOnce(
    source,
    "            disabled={isLoading}\n          >\n            <option value=\"\">Select your grade</option>\n            {[6, 7, 8, 9, 10, 11, 12].map((g) => (",
    "            disabled={isLoading || (path === 'school' && !schoolHasConfiguredGrades)}\n          >\n            <option value=\"\">\n              {path === 'school' && !schoolHasConfiguredGrades ? 'School will assign your grade' : 'Select your grade'}\n            </option>\n            {(path === 'school' ? schoolGradeOptions : [6, 7, 8, 9, 10, 11, 12]).map((g) => (",
    'grade select options',
  );

  source = replaceOnce(
    source,
    "          </select>\n        </label>\n\n        {path === 'school' ? <label className=\"block\">",
    "          </select>\n          {path === 'school' && !schoolHasConfiguredGrades && (\n            <div className=\"mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3\">\n              <p className=\"text-xs leading-relaxed text-cyan-100\">\n                Your school has not configured grades or classes yet. You can finish registration now; your school administrator can place you later.\n              </p>\n            </div>\n          )}\n        </label>\n\n        {path === 'school' ? <label className=\"block\">",
    'unconfigured school placement notice',
  );

  source = replaceOnce(
    source,
    "          {!grade && (\n            <p className=\"mt-1 text-xs text-gray-500\">Select a grade first</p>\n          )}",
    "          {!grade && schoolHasConfiguredGrades && (\n            <p className=\"mt-1 text-xs text-gray-500\">Select a grade first</p>\n          )}",
    'approved class grade helper',
  );

  source = replaceOnce(
    source,
    "          disabled={!grade || fullName.trim().length < 5 || !fullName.trim().includes(' ') || isLoading}",
    "          disabled={(studentGradeRequired && !grade) || fullName.trim().length < 5 || !fullName.trim().includes(' ') || isLoading}",
    'complete setup button guard',
  );

  writeFileSync(file, source);
}

// ---------------------------------------------------------------------------
// UpgradeModal: only a School Head/billing manager may see school checkout or
// start-pilot controls. Students/teachers get a school-managed access message.
// ---------------------------------------------------------------------------
{
  const file = 'components/UpgradeModal.tsx';
  let source = readFileSync(file, 'utf8');

  source = replaceOnce(
    source,
    "import VisualFallbackImage from './VisualFallbackImage';",
    "import VisualFallbackImage from './VisualFallbackImage';\nimport { getMySchoolCapabilities } from '../services/schoolAdminService';",
    'school capability import',
  );

  source = replaceOnce(
    source,
    "  const [pilotAlreadyUsed, setPilotAlreadyUsed] = useState(false);\n  const [planLoading, setPlanLoading] = useState(true);",
    "  const [pilotAlreadyUsed, setPilotAlreadyUsed] = useState(false);\n  const [planLoading, setPlanLoading] = useState(true);\n  const [viewerIsSchoolMember, setViewerIsSchoolMember] = useState(false);\n  const [canManageSchoolBilling, setCanManageSchoolBilling] = useState(true);",
    'school billing authority state',
  );

  const oldEffect = `  // Fetch plan details when modal opens to determine pilot eligibility\n  useEffect(() => {\n    if (!isOpen) {\n      setPlanLoading(true);\n      return;\n    }\n    fetchSchoolPlanDetails().then((details) => {\n      // Avoid false positives for users not attached to a school yet.\n      // A school-level pilot can be considered \"already used\" only when this\n      // user has a real school context (plan is not 'none').\n      const hasSchoolContext = details.plan !== 'none';\n      const alreadyUsed = hasSchoolContext\n        && (details.plan === 'pilot' || details.trial_ends_at !== null);\n      setPilotAlreadyUsed(alreadyUsed);\n      setPlanLoading(false);\n    }).catch(() => setPlanLoading(false));\n  }, [isOpen]);`;

  const newEffect = `  // Fetch the school plan together with the caller's school authority. Billing\n  // controls are never shown to ordinary school members.\n  useEffect(() => {\n    if (!isOpen) {\n      setPlanLoading(true);\n      setViewerIsSchoolMember(false);\n      setCanManageSchoolBilling(true);\n      return;\n    }\n\n    Promise.all([fetchSchoolPlanDetails(), getMySchoolCapabilities()])\n      .then(([details, capabilities]) => {\n        const hasSchoolContext = Boolean(capabilities?.school_id);\n        const alreadyUsed = hasSchoolContext\n          && (details.plan === 'pilot' || details.trial_ends_at !== null);\n        setPilotAlreadyUsed(alreadyUsed);\n        setViewerIsSchoolMember(hasSchoolContext);\n        setCanManageSchoolBilling(Boolean(capabilities?.can_manage_billing));\n        setPlanLoading(false);\n      })\n      .catch(() => {\n        // Fail closed for school billing controls. If authority cannot be\n        // resolved, do not expose a purchase/pilot action to a school member.\n        setViewerIsSchoolMember(true);\n        setCanManageSchoolBilling(false);\n        setPlanLoading(false);\n      });\n  }, [isOpen]);`;

  source = replaceOnce(source, oldEffect, newEffect, 'upgrade modal authority effect');

  source = replaceOnce(
    source,
    "  if (!isOpen) return null;\n\n  const handleSubscribe",
    `  if (!isOpen) return null;\n\n  const showSchoolManagedAccess = !planLoading && viewerIsSchoolMember && !canManageSchoolBilling;\n\n  if (showSchoolManagedAccess) {\n    return (\n      <div className=\"fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4\">\n        <div className=\"absolute inset-0 bg-black/70 backdrop-blur-sm\" onClick={onClose} />\n        <div className=\"relative z-10 w-full max-w-lg rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8\">\n          <button\n            onClick={onClose}\n            aria-label=\"Close\"\n            className=\"absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white\"\n          >\n            ✕\n          </button>\n          <div className=\"pr-10\">\n            <div className=\"mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-200\">\n              🏫 School-managed access\n            </div>\n            <h2 className=\"text-2xl font-bold text-white\">School Access Not Active</h2>\n            <p className=\"mt-3 text-sm leading-6 text-slate-300\">\n              {featureLabel ? <><span className=\"font-semibold text-white\">{featureLabel}</span> is not active for your school yet. </> : null}\n              Your School Head manages the school plan and the free pilot. You do not need to buy anything from your student or teacher account.\n            </p>\n            <div className=\"mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-100\">\n              Ask your School Head to activate the 30-day pilot or a school plan. Access will update for school members after activation.\n            </div>\n            <button\n              onClick={onClose}\n              className=\"mt-6 w-full rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400\"\n            >\n              Got it\n            </button>\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  const handleSubscribe`,
    'school-managed access early return',
  );

  source = replaceOnce(
    source,
    'This feature is available exclusively for Prime users.',
    'This feature is included when your school has an active plan or pilot.',
    'legacy Prime blocker copy',
  );

  writeFileSync(file, source);
}
