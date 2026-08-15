# School plan and feature availability

This is the school-facing access contract enforced by Brains Heist as of 15 August 2026.

## The rule in one sentence

A school member receives only the features included in the school's effective plan and programme agreement. A personal or legacy account tier cannot override a school's plan.

## Plans at a glance

| Plan | Game seats | Cambridge seats | IELTS seats | Feature access |
|---|---:|---:|---:|---|
| Free / None | 0 | 0 | 0 | Basic school workspace, core quest practice, assigned-class visibility, and limited Lockdown only |
| Pilot | 60 | 60 | 20 | Full feature set for 30 days; usage counters are informational and do not end access early |
| Core | 120 | 120 | 40 | Full feature set, subject to the school's signed programme/module agreement |
| Standard | 220 | 220 | 80 | Full feature set, subject to the school's signed programme/module agreement |
| Pro | 450 | 450 | 150 | Full feature set, subject to the school's signed programme/module agreement |
| Enterprise | Custom / unlimited | Custom / unlimited | Custom / unlimited | Full feature set with contract-defined capacity and modules |

“Seat” means the maximum licensed allocation for that programme. Existing roster records may still be visible to school administrators on Free, but Free provides no licensed Game, Cambridge, or IELTS seat allocation.

## Feature matrix

| Capability | Free / None | Active Pilot | Core | Standard | Pro | Enterprise |
|---|---|---|---|---|---|---|
| School administration and roster workspace | Available | Available | Available | Available | Available | Available |
| Assigned classes / class visibility | Available | Available | Available | Available | Available | Available |
| Core quest practice | Available | Available | Available | Available | Available | Available |
| Lockdown Mode | Limited | Full | Full | Full | Full | Full |
| Assignments: create, edit, publish, complete | Not available | Available | Available | Available | Available | Available |
| Question Bank and custom questions | Not available | Available | Available | Available | Available | Available |
| Assignment reports, academic profiles, interventions, documents | Not available | Available | Available | Available | Available | Available |
| PvP / Launch Attack | Not available | Available | Available | Available | Available | Available |
| Clans, Clan Wars, Clan Territory, Rivalry | Not available | Available | Available | Available | Available | Available |
| Competitive leaderboard and achievements | Not available | Available | Available | Available | Available | Available |
| Shop and inventory | Not available | Available | Available | Available | Available | Available |
| Raids | Not available | Available | Available | Available | Available | Available |
| Tournaments | Not available | Available | Available | Available | Available | Available |
| Cambridge tests | Not available | Available* | Available* | Available* | Available* | Available* |
| IELTS tests | Not available | Available* | Available* | Available* | Available* | Available* |
| Writing Hub | Not available | Available* | Available* | Available* | Available* | Available* |
| Admissions tests | Not available | Available* | Available* | Available* | Available* | Available* |

\* Programme products are also controlled by the school's explicit agreement. If a professional agreement disables Cambridge, IELTS, Writing, or Admissions, that module stays unavailable even when the general plan is paid.

## What a Free / None school can do

A school that has not started its Pilot and has no active paid agreement can:

- manage its basic school account and view its roster;
- let teachers see the classes assigned to them;
- use the core quest/practice experience;
- run Lockdown Mode for up to 15 minutes with up to 20 students;
- choose from three Lockdown maps: Default, Downtown, and Compound.

Free Lockdown does not allow custom questions or saved results and displays the Free watermark.

It cannot create or open assignments, use reports or the teacher Question Bank, access Cambridge/IELTS/Writing/Admissions, or use PvP, Clans, Clan Wars, Clan Territory, Rivalry, competitive leaderboards, Shop, Inventory, Raids, or Tournaments.

## How the effective plan is decided

The application uses one server-side decision for navigation, RPCs, direct table access, and Realtime data:

1. A valid active school subscription or current complimentary/manual agreement is used.
2. Otherwise, an unexpired 30-day Pilot is used.
3. Otherwise, the school is Free / None.

Cancelled agreements remain active only until their paid period ends. Expired Pilots automatically return to Free. School membership is evaluated before any legacy personal tier, so a user cannot unlock school features through an old account-level flag.

## Recommended wording for schools

> The Free school workspace includes basic administration, assigned-class visibility, core practice, and limited Lockdown Mode. Assignments, reports, custom question tools, competitive features, and specialist programmes require an active Pilot or paid agreement. Pilot provides the complete platform for 30 days; paid-plan capacities are determined by the selected tier and any programme modules named in the agreement.
