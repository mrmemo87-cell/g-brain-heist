# Staff and family interface languages

The existing persisted English / Arabic / Russian interface preference now applies to the Teacher, School Admin, Admin/Superadmin, School Head, and Parent portals through one shared localization boundary.

The boundary translates only exact, approved interface literals. Unknown and dynamic text is left unchanged, which protects names, school-authored content, and other user data. Cambridge and IELTS assessment surfaces marked as English or identified as question/passage/test content remain English.

A compact language control is always available on these portals. The same `brains-heist:ui-language:v1` preference used by the student interface is reused so users do not need to choose a language separately in each workspace.
