# Brains Heist API Routes

All endpoints live under `/api/brains_heist/*` and return JSON using the shared `{ success, data }` / `{ success: false, error }` envelope.

## Authentication

Send the following headers with every request:

| Header | Description |
| --- | --- |
| `x-brains-user-id` | Supabase `auth.users.id` for the caller |
| `x-brains-user-role` | Either `teacher` or `student` |
| `x-brains-class-id` | Required for student-only scheduling lookups |

## Content Management (teacher only)

| Endpoint | Method(s) | Request Body | Response |
| --- | --- | --- | --- |
| `/api/brains_heist/content/subjects?id=subject_id` | `GET`/`POST`/`PUT`/`DELETE` | `POST/PUT` → `{ name: string, description?: string, gradeBand?: string }` | `data` contains the subject row(s) |
| `/api/brains_heist/content/topics?id=topic_id` | `GET`/`POST`/`PUT`/`DELETE` | `POST/PUT` → `{ subjectId: string, name: string, difficultyBand?: string, syllabusCode?: string }` | `data` contains the topic row(s) |
| `/api/brains_heist/content/task-groups?id=task_group_id` | `GET`/`POST`/`PUT`/`DELETE` | `{ topicId: string, title: string, missionType?: string, recommendedLevel?: number }` | `data` contains the task group row(s) |
| `/api/brains_heist/content/questions?id=question_id` | `GET`/`POST`/`PUT`/`DELETE` | `{ taskGroupId: string, prompt: string, options: string[], correctOption: string, explanation?: string, difficultyRating?: number }` | `data` contains the question row(s) |

Notes:
- All create/update responses echo the stored row.
- DELETE returns `{ deleted: true }`.

## Student Game Loop

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/brains_heist/game/start` | `POST` | `{ topicId?: string, taskGroupId?: string, questionCount?: number, missionDifficulty?: string }` | `{ mission: rpc_payload }` from `start_brains_heist_mission` |
| `/api/brains_heist/game/answer` | `POST` | `{ missionId: string, questionId: string, answer: string, timeTaken?: number, supportNote?: string }` | `{ attempt: rpc_payload }` |
| `/api/brains_heist/game/finish` | `POST` | `{ missionId: string, abandoned?: boolean, remainingLives?: number }` | `{ summary: rpc_payload }` |
| `/api/brains_heist/game/progress?topicId=` | `GET` | none | `{ progress: TopicProgressRow[], statuses: TopicStatusRow[] }` |
| `/api/brains_heist/game/next-mission` | `GET/POST` | Optional body `{ topicId?: string }` | `{ suggestion: rpc_payload }` |

## PvP Battles

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/brains_heist/pvp/challenge` | `POST` | `{ topicId?: string, questionCount?: number, timeLimitSeconds?: number, wagerCoins?: number }` | `{ challenge: rpc_payload }` |
| `/api/brains_heist/pvp/join` | `POST` | `{ challengeCode: string }` | `{ battle: rpc_payload }` |
| `/api/brains_heist/pvp/state?battleId=` | `GET` | none | `{ state: rpc_payload }` |
| `/api/brains_heist/pvp/answer` | `POST` | `{ battleId: string, questionId: string, answer: string, timeTaken?: number }` | `{ answer: rpc_payload }` |
| `/api/brains_heist/pvp/resolve` | `POST` | `{ battleId: string }` | `{ result: rpc_payload }` |

## Teacher Analytics

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/brains_heist/teacher/summary?classId=` | `GET` | none | `{ topics: rpc_payload[], taskGroups: rpc_payload[] }` |
| `/api/brains_heist/teacher/student?studentId=` | `GET` | none | `{ missions: rpc_payload[], mastery: rpc_payload[] }` |

## Scheduling

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/api/brains_heist/scheduling/missions?id=` | `POST`/`PUT` | `{ classId: string, topicId?: string, taskGroupId?: string, startsAt: ISODate, endsAt: ISODate, goalDescription?: string }` | `{ mission: row }` |
| `/api/brains_heist/scheduling/assignments?window=(active|future|past|all)&classId=` | `GET` | Headers decide teacher vs student role | `{ missions: rows[] }` |

Window filtering compares `starts_at`/`ends_at` against `now` on the API server.
