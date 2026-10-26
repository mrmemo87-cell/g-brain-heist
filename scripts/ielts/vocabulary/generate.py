"""Write the vocabulary lesson sources from their specs: python3 scripts/ielts/vocabulary/generate.py"""
import importlib, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import build  # noqa: E402

ROOT = HERE.parents[2]
for n in range(1, 7):
    try:
        mod = importlib.import_module(f"v{n}")
    except ModuleNotFoundError:
        continue
    out = ROOT / f"docs/ielts/lessons/lesson-v{n}/lesson.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(mod.SPEC), ensure_ascii=False, indent=2) + "\n")
    print("wrote", out.relative_to(ROOT))
