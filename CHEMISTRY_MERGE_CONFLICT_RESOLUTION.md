# Chemistry code merge conflict resolution guidance

For the listed conflicts, accept **current (top)** in all cases.

## Decisions
1. `code: '9701_m20_qp_12 Q: 5'` with `masterCode: '9701_m99_qp_12 Q: 105'`
   - ✅ Keep **current (top)**
   - ❌ Do not take incoming `9701_s20_qp_12 Q: 5`

2. `code: '9701_m20_qp_12 Q: 10'` with `masterCode: '9701_m99_qp_12 Q: 110'`
   - ✅ Keep **current (top)**
   - ❌ Do not take incoming `9701_s20_qp_12 Q: 10`

3. `code: '9701_m22_qp_12 Q: 14'` with `masterCode: '9701_m99_qp_12 Q: 214'`
   - ✅ Keep **current (top)**
   - ❌ Do not take incoming `9701_s21_qp_12 Q: 14`

4. `code: '9701_s16_qp_12 Q: 11'` with `masterCode: '9701_m99_qp_12 Q: 311'`
   - ✅ Keep **current (top)**
   - ❌ Do not take incoming `9701_s15_qp_12 Q: 11`

## Why
- The incoming (bottom) paper codes are currently not present in `chemistry_master_answer_key.js`.
- Accepting incoming without adding corresponding master entries would break centralized runtime lookup.
- Current (top) variants are already wired to valid master mappings through `masterCode` overrides and pass runtime audits.
