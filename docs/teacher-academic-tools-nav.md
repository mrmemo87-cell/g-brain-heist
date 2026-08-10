# Teacher Academic Tools Navigation

The Teacher Workspace navigation exposes the longitudinal academic tooling added in Student Learning Memory phases 4 and 7.

- **Academic Profiles** opens inside the existing Teacher Workspace main panel.
- **Interventions** opens inside the same Teacher Workspace main panel.
- Opening either tool keeps the teacher dashboard shell, sidebar and session mounted; switching back to Dashboard or another workspace item does not reload the whole portal.
- The academic tool header Back action closes the embedded tool and returns to the current Teacher Workspace instead of navigating to a standalone HTML page.
- The standalone `/teacher-academic-profiles.html` and `/teacher-interventions.html` build entries remain available as compatibility entry points.
- Both tools inherit the existing Performance Reports entitlement/quota boundary.
- The same `navTabs` source still drives desktop sidebar and mobile **All tools**, so both surfaces stay aligned.

Regression coverage in `tests/teacherAcademicToolsNavigation.test.ts` protects the menu labels, integrated shell behavior, and entitlement mapping.
