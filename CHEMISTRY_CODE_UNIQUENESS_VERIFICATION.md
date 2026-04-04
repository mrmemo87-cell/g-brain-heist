# Chemistry code uniqueness verification (display code vs runtime scoring code)

Generated at: `2026-04-04T14:07:53Z`  
Generated from commit: `d6cb085` (+ local working changes)  
Output artifact: `CHEMISTRY_CODE_AUDIT.json`

## Generation command
```bash
python scripts/chemistry_audit.py --pages public/cambridge-tests/Chemistry --master public/cambridge-tests/Chemistry/chemistry_master_answer_key.js --out CHEMISTRY_CODE_AUDIT.json
```

## Why you may see “conflicts”
There are two code layers now:
1. `code` (display/source label shown in question metadata)
2. `masterCode` (optional runtime override used for centralized answer lookup)

When a display `code` is reused across chapters, `masterCode` keeps runtime keys unique without changing the visible source label.

## Latest results
### Runtime scoring uniqueness (effective code = `masterCode || code`)
- Total entries: **1222**
- Parseable: **1222**
- Invalid: **0**
- Duplicate canonical runtime keys: **0**
- Missing in master: **0**

### Display-code conflicts (label-level only)
- Duplicate display canonical codes: **6**
- These are expected/reused source labels and are resolved by runtime `masterCode` overrides.
