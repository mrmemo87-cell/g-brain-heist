# AI Question Generation Contract

AI generation is allowed only after a locked curriculum map validates successfully.

The generator must receive objective records, blueprint constraints, allowed question types, allowed difficulties, allowed cognitive levels, prohibited extensions, and misconception notes. It must output items with `curriculum_objective_id`, one primary objective, atomic subskill, placement band, difficulty, cognitive level, misconception-aligned distractors, independent explanation, and validation metadata.

The generator must not output placeholder stems, AI/meta wording, unsupported symbols, duplicate normalized stems, artificial paraphrase families, broad-only subskills, later-stage content as difficulty, or any item that reveals the answer through wording, grammar, position, or option length.
