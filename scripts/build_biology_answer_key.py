"""
Build Ch1 Biology answer key for biologyAnswerKeys.ts
by matching HTML question codes to the Biology_Answer_Key file.
"""
import re

# ── 1. Load the answer key file ──────────────────────────────────────────────
#    Format: row_num  paper  question_num  answer
ANSWER_KEY_PATH = r'public/cambridge-tests/Biology/svg/ch1/Biology_Answer_Key'

lookup = {}   # { (paper, qnum_int): answer }

with open(ANSWER_KEY_PATH, encoding='utf-8') as f:
    for line in f:
        parts = line.strip().split()
        if not parts or parts[0].startswith('#'):
            continue  # skip blank lines and comments
        if len(parts) != 4:
            raise ValueError(
                f'Malformed answer-key row (expected 4 fields, got {len(parts)}): {line.strip()!r}'
            )
        _, paper, qnum, answer = parts
        try:
            qnum_int = int(qnum)
        except ValueError:
            raise ValueError(
                f'Non-integer question number in answer-key row: {line.strip()!r}'
            )
        key = (paper, qnum_int)
        if key in lookup:
            raise ValueError(
                f'Duplicate answer-key entry for {key}: '
                f'existing={lookup[key]!r}, new={answer!r}'
            )
        lookup[key] = answer

print(f'Loaded {len(lookup)} answer entries from key file.')

# ── 2. Load the HTML questions ────────────────────────────────────────────────
HTML_PATH = r'public/cambridge-tests/Biology/svg/ch1/cell_structure.html'

with open(HTML_PATH, encoding='utf-8') as f:
    html = f.read()

# Extract all (number, code) pairs  — code looks like '9700_m20_qp_12 Q: 1'
q_pattern = re.compile(
    r"number:\s*(\d+),\s*\n\s*code:\s*'([^']+)'",
    re.MULTILINE
)
questions = q_pattern.findall(html)
print(f'Found {len(questions)} questions in cell_structure.html')

# ── 3. Build sequential answer map ───────────────────────────────────────────
code_pattern = re.compile(r'(\S+)\s+Q:\s+(\d+)')

seq_answers: dict[int, str] = {}
missing: list[tuple] = []

for num_str, code in questions:
    seq_num = int(num_str)
    m = code_pattern.match(code.strip())
    if not m:
        print(f'  Q{seq_num}: could not parse code "{code}"')
        continue
    paper, orig_qnum = m.group(1), int(m.group(2))
    ans = lookup.get((paper, orig_qnum))
    if ans:
        seq_answers[seq_num] = ans
    else:
        missing.append((seq_num, paper, orig_qnum))

STRICT = True  # set to False to emit partial answers despite missing entries

print(f'\nAnswers found:  {len(seq_answers)} / {len(questions)}')
print(f'Missing:        {len(missing)}')
if missing:
    print('  Missing questions (likely pre-2017 papers not yet in key):')
    for seq_num, paper, qnum in missing[:20]:
        print(f'    Q{seq_num}: {paper} Q{qnum}')
    if len(missing) > 20:
        print(f'    ... and {len(missing)-20} more')
    if STRICT:
        raise SystemExit(
            f'Aborting: {len(missing)} answer(s) missing from key file. '
            'Set STRICT = False to emit a partial answer key.'
        )

# ── 4. Emit TypeScript snippet ────────────────────────────────────────────────
lines = []
for seq_num in sorted(seq_answers):
    lines.append(f'    {seq_num}: \'{seq_answers[seq_num]}\',')

ts_block = '\n'.join(lines)
print('\n── TypeScript answer key block ──────────────────────────────────────────')
print(ts_block)

# Also save to a file for easy copy-paste
with open('ch1_answer_key_block.txt', 'w') as out:
    out.write(ts_block + '\n')
print('\nSaved to ch1_answer_key_block.txt')
