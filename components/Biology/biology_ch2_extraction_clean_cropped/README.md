# Biology Ch2 extraction

Source: `EB-CA-9700-P1-1724-FL.pdf` pages 151-318.

This package extracts Ch2 as image-based questions to avoid OCR mistakes. Each question has:

- `code`, e.g. `9700_m24_qp_12 Q: 7`
- `masterKey`, e.g. `9700_m24_qp_12_07`
- `answer` from `BIOLOGY_MASTER_ANSWER_KEY`
- `image` crop with the rendered question and options

Validation:

```json
{
  "chapter": "2 Biological molecules",
  "source_pdf": "EB-CA-9700-P1-1724-FL.pdf",
  "page_range": "151-318",
  "expected_sn_range": "309-646",
  "questions_extracted": 338,
  "expected_questions": 338,
  "master_keys_available": 2237,
  "matched_answers": 338,
  "missing_answer_keys": [],
  "duplicate_generated_keys": [],
  "sections": {
    "2.1 Testing for biological molecules": 53,
    "2.2 Carbohydrates and lipids": 162,
    "2.3 Proteins": 105,
    "2.4 Water": 18
  }
}
```
