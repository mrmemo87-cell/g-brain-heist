from pathlib import Path


path = Path('components/student-progress/TeacherInterventionIntelligencePageV2.tsx')
text = path.read_text(encoding='utf-8')
original = text


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'{label}: expected source block not found')
    text = text.replace(old, new, 1)


replace_once(
    "    const key = [item.subject, item.topic || '', item.skill].map((value) => value.trim().toLocaleLowerCase()).join('|');",
    "    // Never merge distinct governed weaknesses just because their display labels match.\n"
    "    // skill_key identifies the canonical objective / diagnostic atomic subskill.\n"
    "    const key = [item.subject, item.topic || '', item.skill_key].map((value) => value.trim().toLocaleLowerCase()).join('|');",
    'intervention aggregation governed key',
)

replace_once(
    "        recommended_question_ids: [...(item.recommended_question_ids || [])],",
    "        // Automatic practice is deliberately exact-only. Broader primary-skill\n"
    "        // matches remain available separately for deliberate teacher selection.\n"
    "        recommended_question_ids: [...new Set(item.exact_question_ids || [])].slice(0, 6),",
    'initial exact intervention recommendations',
)

replace_once(
    "      recommended_question_ids: [...new Set([\n"
    "        ...(existing.exact_question_ids || []),\n"
    "        ...(item.exact_question_ids || []),\n"
    "        ...(existing.recommended_question_ids || []),\n"
    "        ...(item.recommended_question_ids || []),\n"
    "      ])].slice(0, 6),",
    "      recommended_question_ids: [...new Set([\n"
    "        ...(existing.exact_question_ids || []),\n"
    "        ...(item.exact_question_ids || []),\n"
    "      ])].slice(0, 6),",
    'merged exact intervention recommendations',
)

replace_once(
    "    return <article key={`${r.subject}-${r.topic || ''}-${r.skill}`} className={`priority-${r.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'}`}>",
    "    return <article key={`${r.subject}-${r.topic || ''}-${r.skill_key}`} className={`priority-${r.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'}`}>",
    'intervention card governed react key',
)

if text != original:
    path.write_text(text, encoding='utf-8')
    print('Intervention targeted-practice relevance patch applied.')
else:
    print('Intervention targeted-practice relevance already materialized; skipping patch.')
