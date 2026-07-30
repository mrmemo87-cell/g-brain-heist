# School branding audit

This audit distinguishes school-owned surfaces from product/marketing UI. Canonical `schools.name` and `schools.logo_url` win; profile values are temporary fallbacks while the canonical row loads.

| Surface | File/component | School ID source | Branding source | Previous behavior | New behavior | Status |
|---|---|---|---|---|---|---|
| Student dashboard/navigation | `components/Header.tsx` | signed-in membership profile | canonical `schools` row | product logo/name | school identity with safe fallback | Complete |
| Teacher dashboard | `components/TeacherPortal.tsx` | teacher membership | canonical `schools` row | product identity | school identity | Complete |
| School administration | `components/SchoolAdminPortal.tsx` | loaded administrator school | canonical school object | broken remote images possible | failure-safe school identity | Complete |
| Admission candidate reports | `components/admin/modals/ReportModal.tsx`, `AnswerReflectionModal.tsx` | report candidate, then viewer | canonical `schools` row | cached profile/candidate identity | resource school wins | Complete (existing report work) |
| Cambridge and collective reports | `ProfessionalCambridgeReport.tsx`, `CollectiveAssignmentReport.tsx` | assignment/student school | resolved branding passed to print model | cached profile or product identity | canonical school identity | Complete (existing report work) |
| Writing report document | `src/lib/brains_heist/writingReportDocument.ts` | report institution | resolved branding passed without hooks | product identity | school identity with subtle product attribution | Complete (existing report work) |
| IELTS session/results | `src/pages/ielts/IeltsSession.tsx` | session candidate school | canonical `schools` row | cached candidate branding | canonical school identity | Complete (existing report work) |
| Generic alerts, loading and toast UI | alert/loading/toast components | none (product UI) | product assets | product identity | unchanged | Intentionally product-branded |
| Public login, marketing and demo assistant | `components/LoginView.tsx`, visitor assistant edge function | none | product assets | product identity | unchanged | Intentionally product-branded |
| Official question-bank labels | teacher/admission question-bank components | global content owner | product name | identifies product-owned content | unchanged | Intentionally product-branded |

## Safety rules

Remote logos render only when they use HTTPS. Missing, malformed, insecure, or failed images render an accessible initial rather than a broken image. Product branding is used only where neither canonical nor fallback school identity exists.
