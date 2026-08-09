# Teacher Academic Tools Navigation

The Teacher Workspace navigation exposes the longitudinal academic tooling added in Student Learning Memory phases 4 and 7.

- **Academic Profiles** opens `/teacher-academic-profiles.html`.
- **Interventions** opens `/teacher-interventions.html`.
- Both tools inherit the existing Performance Reports entitlement/quota boundary.
- The same `navTabs` source drives desktop sidebar and mobile **All tools**, so both surfaces stay aligned.

A regression test in `tests/teacherAcademicToolsNavigation.test.ts` protects the menu labels, routes, and entitlement mapping.
