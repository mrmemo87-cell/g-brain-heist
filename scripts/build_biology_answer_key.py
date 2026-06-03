#!/usr/bin/env python3
"""Generate the browser Biology master-answer-key adapter from TypeScript source."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "components" / "biologyMasterAnswerKey.ts"
OUTPUT_PATH = ROOT / "public" / "cambridge-tests" / "Biology" / "biology_master_answer_key.js"

ENTRY_RE = re.compile(r'"([^"]+)"\s*:\s*"([ABCD])"')


def load_master_answers() -> dict[str, str]:
    source = SOURCE_PATH.read_text(encoding="utf-8")
    entries = ENTRY_RE.findall(source)
    if not entries:
        raise RuntimeError(f"No Biology answer-key entries found in {SOURCE_PATH}")

    answers = dict(entries)
    if len(answers) != len(entries):
        raise RuntimeError("Duplicate Biology master answer-key entries found in TypeScript source")

    return answers


def render_adapter(answers: dict[str, str]) -> str:
    lines = [
        "// GENERATED FILE - DO NOT EDIT.",
        "// Source: components/biologyMasterAnswerKey.ts",
        "// Regenerate with: python3 scripts/build_biology_answer_key.py",
        "(function () {",
        "  const BIOLOGY_MASTER_ANSWER_KEY = Object.freeze({",
    ]

    for key in sorted(answers):
        lines.append(f"    {json.dumps(key)}: {json.dumps(answers[key])},")

    lines.extend([
        "  });",
        "",
        "  function getBiologyMasterKeyFromQuestionCode(code) {",
        "    const match = String(code || '').trim().match(/^(9700_[msw]\\d{2}_qp_\\d{2})\\s+Q:\\s*(\\d{1,2})$/i);",
        "    if (!match) return null;",
        "    const questionNumber = Number.parseInt(match[2], 10);",
        "    if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 40) return null;",
        "    return `${match[1].toLowerCase()}_${String(questionNumber).padStart(2, '0')}`;",
        "  }",
        "",
        "  function getBiologyAnswerFromQuestionCode(code) {",
        "    const key = getBiologyMasterKeyFromQuestionCode(code);",
        "    return key ? (BIOLOGY_MASTER_ANSWER_KEY[key] || '') : '';",
        "  }",
        "",
        "  window.BIOLOGY_MASTER_ANSWER_KEY = BIOLOGY_MASTER_ANSWER_KEY;",
        "  window.getBiologyMasterKeyFromQuestionCode = getBiologyMasterKeyFromQuestionCode;",
        "  window.getBiologyAnswerFromQuestionCode = getBiologyAnswerFromQuestionCode;",
        "})();",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print", action="store_true", dest="print_only", help="print generated JS instead of writing it")
    args = parser.parse_args()

    generated = render_adapter(load_master_answers())
    if args.print_only:
        print(generated, end="")
        return 0

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(generated, encoding="utf-8")
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
