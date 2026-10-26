"""Shared frame for the IELTS vocabulary lessons (IELTS-V1..V6).

Each lesson module defines SPEC (content only); build() turns it into a lesson-factory source
(schema bh-ielts-lesson-source/2) that the standard contract, pack builder and validator accept.
Run: python3 scripts/ielts/vocabulary/generate.py  (writes docs/ielts/lessons/lesson-vN/lesson.json)
"""

BIBLES = {"diagnostic": "2.0.0", "lessons": "1.2.0", "visual": "1.2.0"}
VERSION = "1.1.0"
PREVIOUS_APPROVAL = {
    "approved_by": "Owner, Brains Heist LLC",
    "date": "2026-10-26",
    "version": "1.0.0",
    "scope": "Vocabulary lesson content, keys and models for teacher-only release to all eligible schools. Student task publication remains separate.",
    "basis": "Owner instruction in the review conversation on 2026-10-26 11:08 Asia/Bishkek ('Make the needed adjustments and improvements now ... you have all my permissions'). Superseded by v1.1.0 after an external review judged v1.0.0 too easy for Band 6.5+ preparation.",
}
APPROVAL = {
    "approved_by": "Owner, Brains Heist LLC",
    "date": "2026-10-26",
    "version": VERSION,
    "scope": "Vocabulary lesson content, keys and models for teacher-only release to all eligible schools. Student task publication remains separate.",
    "basis": "Owner instruction in the review conversation on 2026-10-26 15:42 Asia/Bishkek, after sharing an external review of V6 v1.0.0 (difficulty 3.5/10; distractors too easy; reading answers copied; Part 3 not interactive; no writing): 'yes, but this time be very accurate', in reply to the proposal to rebuild V1-V6 at Band 6.5-7.5 level and re-release them. Not recorded as an in-platform decision; no review-draft pack was opened before approval.",
}
RIGHTS = ("Original Brains Heist LLC instructional material, AI-assisted. Passages, people and data are fictional and created for practice. "
          "Not official IELTS material. Human editorial and classroom review recommended.")
BLOCKERS = ["Device, print, projector and Microsoft PowerPoint playback acceptance not yet recorded (LB-08).",
            "Student task publication and platform evidence capture remain separate, governed steps."]
MAPPING = ("Focuses use Diagnostic Bible section 7.2 construct names where they apply (lexical resource, paraphrase recognition). Teaching focuses only. "
           "This optional vocabulary lesson sits outside the 24-lesson sequence and changes no scoring, screener, readiness or band logic.")
CALIBRATION = "Editorial relative-difficulty labels only. They do not imply an IELTS band, psychometric calibration, or verified difficulty."


def item(block, n, prompt, answer, evidence, reason, focus, type_, level="core", **extra):
    return {"id": f"{block}-Q{n}", "prompt": prompt, "answer": answer, "evidence": evidence, "reason": reason,
            "focus": focus, "type": type_, "level": level, **extra}


def build(spec):
    n = spec["number"]
    code = f"IELTS-V{n}"
    lesson = {
        "schema": "bh-ielts-lesson-source/2",
        "code": code,
        "number": n,
        "vocabulary": True,
        "placement": spec["placement"],
        "week": spec["week"],
        "version": VERSION,
        "presentation_version": VERSION,
        "title": spec["title"],
        "status": f"Owner approved v{VERSION} on 2026-10-26; teacher release to all eligible schools (optional vocabulary lesson)",
        "duration": 60,
        "test_type": "Academic",
        "bibles": BIBLES,
        "rights": RIGHTS,
        "audio": {"required": False, "statement": "No recording required.", "recordings": []},
        "prerequisites": spec["prerequisites"],
        "objectives": spec["objectives"],
        "levels": spec["levels"],
        "word_bank": spec["word_bank"],
        "stages": spec["stages"],
        "blocks": spec["blocks"],
        "exit_ticket": spec["exit_ticket"],
        "homework": spec["homework"],
        "delayed_followup": spec["delayed_followup"],
        "mapping_notes": MAPPING,
        "release_blockers": BLOCKERS,
        "followup": {
            "id": f"{code}-C1",
            "status": f"WITHHELD from students until the planned fresh check; approved with lesson v{VERSION} on 2026-10-26. Keep private until use.",
            "delivery": spec["followup_delivery"],
            "review": spec["followup_review"],
            "difficulty_calibration": CALIBRATION,
            "blocks": spec["followup_blocks"],
        },
        "previous_approval_record": PREVIOUS_APPROVAL,
        "approval_record": APPROVAL,
    }
    return lesson
