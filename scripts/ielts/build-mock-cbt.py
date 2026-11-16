#!/usr/bin/env python3
"""Build the computer-delivered version of a bh-ielts-mock-source/1 mock (Diagnostic Bible 2.1A, 12A).

Splits the source into:
  * a student-facing payload (passages, prompts, options, figures) that carries no answers, evidence or transcripts;
  * a server-only answer key (accepted answers, word limits, choose-TWO groups);
  * PNG figures under public/ielts/mocks/<code>/ (the Listening plan and the Writing Task 1 visual);
  * a SQL migration that installs both into private.ielts_mock_cbt_forms.

Usage:
  python3 scripts/ielts/build-mock-cbt.py --source docs/ielts/mocks/mock-2/mock.json \
      --audio-record docs/ielts/mocks/mock-2/AUDIO_PRODUCTION_v1.json --audio-url URL --listen-end 1231.6 \
      --sample-end 4.7 --migration supabase/migrations/NAME.sql
"""
import argparse, hashlib, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mock_figures  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CHOICE = {'tfng', 'ynng', 'mcq', 'matching'}
TEXT = {'completion', 'short'}


def canon(o):
    return json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def figure_png(fig, code, name):
    rel = f'ielts/mocks/{code}/{name}.png'
    dest = ROOT / 'public' / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    mock_figures.render(fig, dest)
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()[:12]
    return f'/{rel}?v={digest}'


def public_group(g, key, skill, code, fig_name):
    t = g['type']
    out = {'range': g['range'], 'type': t, 'instructions': g['instructions']}
    for k in ('word_limit', 'form_title', 'options_title', 'options', 'stem', 'map'):
        if k in g:
            out[k] = g[k]
    if g.get('figure'):
        out['figure'] = {'src': figure_png(g['figure'], code, fig_name), 'title': g['figure'].get('title', ''),
                         'note': g['figure'].get('note', ''), 'alt': g['figure'].get('alt', g['figure'].get('title', ''))}
    if t == 'multi':
        a, b = g['range']
        answers = [x.strip().upper() for x in g['answer']]
        if len(answers) != b - a + 1:
            raise SystemExit(f'{skill} {a}-{b}: choose-TWO answers do not match the range')
        for n in range(a, b + 1):
            key[str(n)] = {'t': 'multi', 'g': [a, b], 'a': answers}
        return out
    items = []
    for it in g['items']:
        n = it['n']
        item = {'n': n, 'prompt': it['prompt']}
        if it.get('options'):
            item['options'] = it['options']
        items.append(item)
        if t in TEXT:
            accepted = [it['answer']] + [x for x in it.get('accept', []) if x != it['answer']]
            key[str(n)] = {'t': t, 'a': accepted, 'w': int(g.get('word_limit') or 3)}
        elif t in CHOICE:
            key[str(n)] = {'t': t, 'a': [it['answer'].strip().upper()]}
        else:
            raise SystemExit(f'unsupported question type {t}')
    out['items'] = items
    return out


def build(args):
    src = Path(args.source)
    d = json.loads(src.read_text())
    code = d['code']
    rec = json.loads(Path(args.audio_record).read_text())
    keys = {'listening': {}, 'reading': {}}

    parts = []
    for p in d['listening']['parts']:
        groups = [public_group(g, keys['listening'], 'listening', code, f'listening-q{g["range"][0]}-{g["range"][1]}')
                  for g in p['groups']]
        parts.append({'part': p['part'], 'range': [groups[0]['range'][0], groups[-1]['range'][1]], 'groups': groups})

    passages = []
    for p in d['reading']['passages']:
        groups = [public_group(g, keys['reading'], 'reading', code, f'reading-q{g["range"][0]}-{g["range"][1]}')
                  for g in p['groups']]
        passages.append({'n': p['n'], 'title': p['title'], 'labelled': bool(p.get('labelled')),
                         'paragraphs': p['paragraphs'],
                         'range': [groups[0]['range'][0], groups[-1]['range'][1]], 'groups': groups})

    w = d['writing']
    t1 = {'prompt': w['task1']['prompt'], 'minimum_words': 150, 'suggested_minutes': 20}
    if w['task1'].get('figure'):
        f = w['task1']['figure']
        t1['figure'] = {'src': figure_png(f, code, 'writing-task1'), 'title': f.get('title', ''), 'note': f.get('note', ''),
                        'alt': f.get('alt', f.get('title', ''))}
    t2 = {'prompt': w['task2']['prompt'], 'minimum_words': 250, 'suggested_minutes': 40}

    for skill in ('listening', 'reading'):
        if sorted(int(k) for k in keys[skill]) != list(range(1, 41)):
            raise SystemExit(f'{skill}: key must cover questions 1-40 exactly')

    payload = {
        'schema': 'bh-ielts-mock-cbt/1', 'code': code, 'title': d['title'], 'version': d['version'],
        'test_type': d['test_type'], 'rights': d['rights'],
        'listening': {'parts': parts},
        'reading': {'passages': passages},
        'writing': {'task1': t1, 'task2': t2},
    }
    text = canon(payload)
    for banned in ('"answer"', '"accept"', '"evidence"', '"lines"', '"model"'):
        if banned in text:
            raise SystemExit(f'student payload leaks {banned}')

    audio = {'url': args.audio_url, 'sha256': rec['sha256'], 'bytes': rec['bytes'], 'duration': rec['duration_seconds'],
             'listen_end': args.listen_end, 'sample_end': args.sample_end, 'part_starts': rec['part_starts']}
    timing = {'listening_review_seconds': 120, 'reading_seconds': 3600, 'writing_seconds': 3600, 'grace_seconds': 20}
    content_sha = hashlib.sha256(canon({'payload': payload, 'key': keys, 'audio': audio, 'timing': timing}).encode()).hexdigest()
    return code, d, payload, keys, audio, timing, content_sha, hashlib.sha256(src.read_bytes()).hexdigest()


def sql_json(o):
    return "'" + canon(o).replace("'", "''") + "'::jsonb"


def main():
    ap = argparse.ArgumentParser()
    for a in ('--source', '--audio-record', '--audio-url', '--migration'):
        ap.add_argument(a, required=True)
    ap.add_argument('--listen-end', type=float, required=True)
    ap.add_argument('--sample-end', type=float, required=True)
    args = ap.parse_args()
    code, d, payload, keys, audio, timing, content_sha, source_sha = build(args)
    sql = f"""-- Computer delivery of {code} v{d['version']} (Diagnostic Bible 2.1A, 5.1, 9.5, 12A).
-- Generated by scripts/ielts/build-mock-cbt.py from {Path(args.source).as_posix()} (sha256 {source_sha}).
-- The payload carries no answers; the key stays in private and is only used by server-side scoring.
insert into private.ielts_mock_cbt_forms(code, version, content_sha256, source_sha256, payload, answer_key, audio, timing)
values ('{code}', '{d['version']}', '{content_sha}', '{source_sha}', {sql_json(payload)}, {sql_json(keys)}, {sql_json(audio)}, {sql_json(timing)})
on conflict (code) do nothing;
"""
    Path(args.migration).write_text(sql)
    print(json.dumps({'code': code, 'content_sha256': content_sha, 'payload_bytes': len(canon(payload)),
                      'listening_keys': len(keys['listening']), 'reading_keys': len(keys['reading'])}))


if __name__ == '__main__':
    main()
