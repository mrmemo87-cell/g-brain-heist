-- Diagnostic Bible 2.0.0 sections 9.5 and 12A: mock results feed the learning record (teacher capture for paper
-- sittings), and eligible full sittings give an indicative band range under bh-indicative-v1.
-- Keys stay in the teacher packs; paper capture records the teacher's marks per item ('1' correct, '0' wrong, '-' blank).

-- 1. Mock forms: item section (l/r), number, question type, and proposed primary (p) / supporting (x) constructs.
--    Construct prefixes: L: bh-ielts-listening-v1-, C: bh-ielts-core-v1-, R: eng.reading.
create table if not exists private.ielts_mock_forms (
 code text primary key check (code ~ '^IELTS-M[1-9]$'),
 version text not null,
 title text not null,
 items jsonb not null
);
alter table private.ielts_mock_forms enable row level security;
insert into private.ielts_mock_forms(code, version, title, items) values
  ('IELTS-M1','1.0.0','Mock Test 1','[{"s":"l","n":1,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":2,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":3,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":4,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":5,"t":"completion","p":"L:dates-times","x":["C:word-limit-spelling"]},{"s":"l","n":6,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":7,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":8,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":9,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":10,"t":"completion","p":"L:dates-times","x":["C:word-limit-spelling"]},{"s":"l","n":11,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":12,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":13,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":14,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":15,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":16,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":17,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":18,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":19,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":20,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":21,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":22,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":23,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":24,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":25,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":26,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":27,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":28,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":29,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":30,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":31,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":32,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":33,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":34,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":35,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":36,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":37,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":38,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":39,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":40,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"r","n":1,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":2,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":3,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":4,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":5,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":6,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":7,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":8,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":9,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":10,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":11,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":12,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":13,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":14,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":15,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":16,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":17,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":18,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":19,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":20,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":21,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":22,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":23,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":24,"t":"summary_box","p":"R:main-ideas.summary","x":["R:explicit-information.locate-detail"]},{"s":"r","n":25,"t":"summary_box","p":"R:main-ideas.summary","x":["R:explicit-information.locate-detail"]},{"s":"r","n":26,"t":"summary_box","p":"R:main-ideas.summary","x":["R:explicit-information.locate-detail"]},{"s":"r","n":27,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":28,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":29,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":30,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":31,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":32,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":33,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":34,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":35,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":36,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":37,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":38,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":39,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":40,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]}]'::jsonb),
  ('IELTS-M2','1.0.0','Mock Test 2','[{"s":"l","n":1,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":2,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":3,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":4,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":5,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":6,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":7,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":8,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":9,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":10,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":11,"t":"matching","p":"C:map-plan-labelling","x":[]},{"s":"l","n":12,"t":"matching","p":"C:map-plan-labelling","x":[]},{"s":"l","n":13,"t":"matching","p":"C:map-plan-labelling","x":[]},{"s":"l","n":14,"t":"matching","p":"C:map-plan-labelling","x":[]},{"s":"l","n":15,"t":"matching","p":"C:map-plan-labelling","x":[]},{"s":"l","n":16,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":17,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":18,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":19,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":20,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":21,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":22,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":23,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":24,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":25,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":26,"t":"matching","p":"L:paraphrase-recognition","x":[]},{"s":"l","n":27,"t":"matching","p":"L:paraphrase-recognition","x":[]},{"s":"l","n":28,"t":"matching","p":"L:paraphrase-recognition","x":[]},{"s":"l","n":29,"t":"matching","p":"L:paraphrase-recognition","x":[]},{"s":"l","n":30,"t":"matching","p":"L:paraphrase-recognition","x":[]},{"s":"l","n":31,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":32,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":33,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":34,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":35,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":36,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":37,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":38,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":39,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":40,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"r","n":1,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":2,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":3,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":4,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":5,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":6,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":7,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":8,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":9,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":10,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":11,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":12,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":13,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":14,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":15,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":16,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":17,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":18,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":19,"t":"multi","p":"C:choose-multiple","x":["R:explicit-information.identify-fact"]},{"s":"r","n":20,"t":"multi","p":"C:choose-multiple","x":["R:explicit-information.identify-fact"]},{"s":"r","n":21,"t":"multi","p":"C:choose-multiple","x":["R:explicit-information.identify-fact"]},{"s":"r","n":22,"t":"multi","p":"C:choose-multiple","x":["R:explicit-information.identify-fact"]},{"s":"r","n":23,"t":"short","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":24,"t":"short","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":25,"t":"short","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":26,"t":"short","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":27,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":28,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":29,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":30,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":31,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":32,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":33,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":34,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":35,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":36,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":37,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":38,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":39,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":40,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]}]'::jsonb),
  ('IELTS-M3','1.0.0','Mock Test 3','[{"s":"l","n":1,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":2,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":3,"t":"completion","p":"L:dates-times","x":["C:word-limit-spelling"]},{"s":"l","n":4,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":5,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":6,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":7,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":8,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":9,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":10,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":11,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":12,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":13,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":14,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":15,"t":"mcq","p":"L:paraphrase-recognition","x":["L:distractor-resistance"]},{"s":"l","n":16,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":17,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":18,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":19,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":20,"t":"matching","p":"L:speaker-attitude","x":[]},{"s":"l","n":21,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":22,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":23,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":24,"t":"multi","p":"C:choose-multiple","x":["L:paraphrase-recognition"]},{"s":"l","n":25,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":26,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":27,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":28,"t":"completion","p":"L:numerical-information","x":["C:word-limit-spelling"]},{"s":"l","n":29,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":30,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":31,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":32,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":33,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":34,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":35,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":36,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":37,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":38,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":39,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"l","n":40,"t":"completion","p":"L:explicit-detail","x":["C:word-limit-spelling"]},{"s":"r","n":1,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":2,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":3,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":4,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":5,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":6,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan","R:multimodal.integrate-modes"]},{"s":"r","n":7,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":8,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":9,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":10,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":11,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":12,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":13,"t":"tfng","p":"R:argument-evaluation.claims-evidence","x":["R:explicit-information.locate-detail"]},{"s":"r","n":14,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":15,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":16,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":17,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":18,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":19,"t":"headings","p":"R:main-ideas.main-supporting","x":[]},{"s":"r","n":20,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":21,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":22,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":23,"t":"matching","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":24,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":25,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":26,"t":"completion","p":"R:explicit-information.locate-detail","x":["R:strategy-selection.scan"]},{"s":"r","n":27,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":28,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":29,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":30,"t":"mcq","p":"R:explicit-information.identify-fact","x":["R:main-ideas.summary"]},{"s":"r","n":31,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":32,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":33,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":34,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":35,"t":"ynng","p":"R:purpose-viewpoint.viewpoint","x":["R:argument-evaluation.claims-evidence"]},{"s":"r","n":36,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":37,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":38,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":39,"t":"endings","p":"R:connections.logical-relations","x":[]},{"s":"r","n":40,"t":"endings","p":"R:connections.logical-relations","x":[]}]'::jsonb)
on conflict (code) do update set version = excluded.version, title = excluded.title, items = excluded.items;

-- 2. Sittings and results (append-only event history; the current row carries a revision for concurrent edits).
create table if not exists private.ielts_mock_sittings (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null,
 batch_id uuid not null references private.ielts_course_batches(id),
 mock_code text not null references private.ielts_mock_forms(code),
 sat_on date not null,
 delivery text not null check (delivery in ('paper','computer')),
 created_by uuid not null references public.users(id),
 created_at timestamptz not null default now(),
 unique (batch_id, mock_code, sat_on, delivery)
);
alter table private.ielts_mock_sittings enable row level security;

create table if not exists private.ielts_mock_results (
 sitting_id uuid not null references private.ielts_mock_sittings(id),
 student_id uuid not null references public.users(id),
 section text not null check (section in ('listening','reading','writing','speaking')),
 marks text check (marks ~ '^[10-]{40}$'),
 criteria jsonb,
 revision int not null default 1,
 entered_by uuid not null references public.users(id),
 entered_at timestamptz not null default now(),
 primary key (sitting_id, student_id, section),
 check ((section in ('listening','reading')) = (marks is not null)),
 check ((section in ('writing','speaking')) = (criteria is not null))
);
alter table private.ielts_mock_results enable row level security;
create index if not exists ielts_mock_results_student on private.ielts_mock_results(student_id);

create table if not exists private.ielts_mock_result_events (
 id bigint generated always as identity primary key,
 sitting_id uuid not null, student_id uuid not null, section text not null,
 marks text, criteria jsonb, revision int not null, entered_by uuid not null, entered_at timestamptz not null default now()
);
alter table private.ielts_mock_result_events enable row level security;

alter table private.ielts_material_construct_maps drop constraint if exists ielts_material_construct_maps_material_type_check;
alter table private.ielts_material_construct_maps add constraint ielts_material_construct_maps_material_type_check
 check (material_type in ('ielts_listening_set','ielts_reading_set','ielts_writing_task','ielts_speaking_task','targeted','mock'));

-- 3. bh-indicative-v1 (section 9.5). IELTS average marks out of 40 for bands 5/6/7/8, rechecked 2026-10-19.
create or replace function private.ielts_round_half(p numeric) returns numeric
language sql immutable set search_path to '' as $$ select floor(p * 2 + 0.5) / 2 $$;

create or replace function private.ielts_indicative_objective(p_skill text, p_raw int) returns jsonb
language plpgsql immutable set search_path to '' as $$
declare a int[]; bands numeric[] := array[5,6,7,8]; central numeric; i int;
begin
 a := case p_skill when 'listening' then array[16,23,30,35] when 'reading' then array[15,23,30,35] end;
 if a is null or p_raw is null or p_raw < 0 or p_raw > 40 then return null; end if;
 if p_raw < a[1] then return jsonb_build_object('label','Below 5.0','low',null,'high',5.0,'central',null); end if;
 if p_raw >= 38 then return jsonb_build_object('label','8.0 or above','low',8.0,'high',null,'central',null); end if;
 for i in reverse 4..1 loop
  if p_raw >= a[i] then
   central := bands[i];
   if i < 4 and p_raw >= a[i] + (a[i+1] - a[i]) / 2.0 then central := central + 0.5; end if;
   exit;
  end if;
 end loop;
 return jsonb_build_object('label', to_char(central - 0.5,'FM0.0') || '–' || to_char(central + 0.5,'FM0.0'), 'low', central - 0.5, 'high', central + 0.5, 'central', central);
end $$;

create or replace function private.ielts_valid_band(p jsonb) returns boolean
language sql immutable set search_path to '' as $$
 select coalesce(jsonb_typeof(p) = 'number' and (p::text)::numeric between 0 and 9 and ((p::text)::numeric * 2) = floor((p::text)::numeric * 2), false)
$$;

-- Writing: both tasks, four criteria each, Task 2 weighted double. Speaking: four criteria, audio required for Pronunciation.
create or replace function private.ielts_indicative_productive(p_section text, p_criteria jsonb) returns jsonb
language plpgsql immutable set search_path to '' as $$
declare t1 numeric; t2 numeric; central numeric;
begin
 if p_section = 'writing' then
  if not (private.ielts_valid_band(p_criteria->'t1'->'ta') and private.ielts_valid_band(p_criteria->'t1'->'cc') and private.ielts_valid_band(p_criteria->'t1'->'lr') and private.ielts_valid_band(p_criteria->'t1'->'gra')
      and private.ielts_valid_band(p_criteria->'t2'->'tr') and private.ielts_valid_band(p_criteria->'t2'->'cc') and private.ielts_valid_band(p_criteria->'t2'->'lr') and private.ielts_valid_band(p_criteria->'t2'->'gra')) then return null; end if;
  t1 := ((p_criteria->'t1'->>'ta')::numeric + (p_criteria->'t1'->>'cc')::numeric + (p_criteria->'t1'->>'lr')::numeric + (p_criteria->'t1'->>'gra')::numeric) / 4;
  t2 := ((p_criteria->'t2'->>'tr')::numeric + (p_criteria->'t2'->>'cc')::numeric + (p_criteria->'t2'->>'lr')::numeric + (p_criteria->'t2'->>'gra')::numeric) / 4;
  central := private.ielts_round_half((t1 + 2 * t2) / 3);
 elsif p_section = 'speaking' then
  if coalesce((p_criteria->>'audio')::boolean, false) is not true then return null; end if;
  if not (private.ielts_valid_band(p_criteria->'fc') and private.ielts_valid_band(p_criteria->'lr') and private.ielts_valid_band(p_criteria->'gra') and private.ielts_valid_band(p_criteria->'p')) then return null; end if;
  central := private.ielts_round_half(((p_criteria->>'fc')::numeric + (p_criteria->>'lr')::numeric + (p_criteria->>'gra')::numeric + (p_criteria->>'p')::numeric) / 4);
 else return null;
 end if;
 return jsonb_build_object('label', to_char(greatest(central - 0.5, 0),'FM0.0') || '–' || to_char(least(central + 0.5, 9),'FM0.0'),
  'low', greatest(central - 0.5, 0), 'high', least(central + 0.5, 9), 'central', central);
end $$;

-- 4. Read and write RPCs (batch managers of the batch's school only).
create or replace function private.ielts_mock_sitting_assert(p_sitting uuid) returns private.ielts_mock_sittings
language plpgsql stable security definer set search_path to '' as $$
declare s private.ielts_mock_sittings;
begin
 select * into s from private.ielts_mock_sittings where id = p_sitting;
 if s.id is null then raise exception using errcode='42501', message='sitting_access_required'; end if;
 perform private.ielts_batch_assert(s.batch_id);
 return s;
end $$;

create or replace function public.rpc_ielts_mock_sitting_open(p_batch uuid, p_mock text, p_sat_on date, p_delivery text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare b private.ielts_course_batches; sid uuid;
begin
 b := private.ielts_batch_assert(p_batch);
 if not exists(select 1 from private.ielts_mock_forms where code = p_mock) then raise exception 'unknown_mock'; end if;
 if p_delivery not in ('paper','computer') then raise exception 'invalid_delivery'; end if;
 if p_sat_on is null or p_sat_on > (now() at time zone 'Asia/Bishkek')::date + 1 then raise exception 'invalid_date'; end if;
 insert into private.ielts_mock_sittings(school_id, batch_id, mock_code, sat_on, delivery, created_by)
 values (b.school_id, b.id, p_mock, p_sat_on, p_delivery, auth.uid())
 on conflict (batch_id, mock_code, sat_on, delivery) do nothing returning id into sid;
 if sid is null then select id into sid from private.ielts_mock_sittings where batch_id = b.id and mock_code = p_mock and sat_on = p_sat_on and delivery = p_delivery; end if;
 return sid;
end $$;

-- A student's sitting is exposed (practice) when the same mock was recorded for them in an earlier sitting.
create or replace function private.ielts_mock_exposed(p_student uuid, p_sitting uuid) returns boolean
language sql stable security definer set search_path to '' as $$
 select exists(select 1 from private.ielts_mock_results r join private.ielts_mock_sittings s on s.id = r.sitting_id
  join private.ielts_mock_sittings me on me.id = p_sitting
  where r.student_id = p_student and s.mock_code = me.mock_code and s.id <> me.id and (s.sat_on, s.created_at) < (me.sat_on, me.created_at))
$$;

create or replace function private.ielts_mock_result_json(r private.ielts_mock_results, p_exposed boolean) returns jsonb
language sql stable set search_path to '' as $$
 select jsonb_build_object('section', r.section, 'marks', r.marks, 'criteria', r.criteria, 'revision', r.revision, 'entered_at', r.entered_at,
  'raw', case when r.marks is not null then length(r.marks) - length(replace(r.marks,'1','')) end,
  'answered', case when r.marks is not null then 40 - (length(r.marks) - length(replace(r.marks,'-',''))) end,
  'exposed', p_exposed,
  'indicative', case when p_exposed then null
                     when r.marks is not null then private.ielts_indicative_objective(r.section, length(r.marks) - length(replace(r.marks,'1','')))
                     else private.ielts_indicative_productive(r.section, r.criteria) end)
$$;

create or replace function public.rpc_ielts_mock_sittings(p_batch uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch))
 select jsonb_build_object(
  'forms', (select jsonb_agg(jsonb_build_object('code', f.code, 'title', f.title, 'version', f.version) order by f.code) from private.ielts_mock_forms f),
  'sittings', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'mock_code', s.mock_code, 'sat_on', s.sat_on, 'delivery', s.delivery,
     'results', (select count(distinct r.student_id) from private.ielts_mock_results r where r.sitting_id = s.id)) order by s.sat_on desc, s.created_at desc)
   from private.ielts_mock_sittings s join b on b.id = s.batch_id), '[]'))
$$;

create or replace function public.rpc_ielts_mock_sitting(p_sitting uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare s private.ielts_mock_sittings;
begin
 s := private.ielts_mock_sitting_assert(p_sitting);
 return jsonb_build_object(
  'sitting', jsonb_build_object('id', s.id, 'mock_code', s.mock_code, 'sat_on', s.sat_on, 'delivery', s.delivery, 'batch_id', s.batch_id),
  'form', (select jsonb_build_object('code', f.code, 'title', f.title, 'version', f.version, 'items', f.items) from private.ielts_mock_forms f where f.code = s.mock_code),
  'policy', 'bh-indicative-v1',
  'students', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', coalesce(nullif(u.full_name,''),u.username),
      'exposed', private.ielts_mock_exposed(u.id, s.id),
      'results', coalesce((select jsonb_object_agg(r.section, private.ielts_mock_result_json(r, private.ielts_mock_exposed(u.id, s.id)))
                           from private.ielts_mock_results r where r.sitting_id = s.id and r.student_id = u.id), '{}'))
     order by coalesce(nullif(u.full_name,''),u.username))
   from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
   where m.batch_id = s.batch_id and m.left_at is null and u.school_id = s.school_id), '[]'));
end $$;

create or replace function public.rpc_ielts_mock_save(p_sitting uuid, p_student uuid, p_section text, p_marks text, p_criteria jsonb, p_revision int)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s private.ielts_mock_sittings; cur private.ielts_mock_results; saved private.ielts_mock_results;
begin
 s := private.ielts_mock_sitting_assert(p_sitting);
 if not exists(select 1 from private.ielts_course_batch_members m join public.users u on u.id = m.student_id
               where m.batch_id = s.batch_id and m.student_id = p_student and m.left_at is null and u.school_id = s.school_id)
 then raise exception 'student_not_in_batch'; end if;
 if p_section in ('listening','reading') then
  if p_marks is null or p_marks !~ '^[10-]{40}$' then raise exception 'marks_need_40_items'; end if;
  p_criteria := null;
 elsif p_section = 'writing' then
  if p_criteria is null or private.ielts_indicative_productive('writing', p_criteria) is null then raise exception 'writing_needs_eight_ratings'; end if;
  p_marks := null; p_criteria := jsonb_build_object('t1', p_criteria->'t1', 't2', p_criteria->'t2');
 elsif p_section = 'speaking' then
  if p_criteria is null or not (private.ielts_valid_band(p_criteria->'fc') and private.ielts_valid_band(p_criteria->'lr') and private.ielts_valid_band(p_criteria->'gra') and private.ielts_valid_band(p_criteria->'p')) then raise exception 'speaking_needs_four_ratings'; end if;
  p_marks := null; p_criteria := jsonb_build_object('fc', p_criteria->'fc', 'lr', p_criteria->'lr', 'gra', p_criteria->'gra', 'p', p_criteria->'p', 'audio', coalesce((p_criteria->>'audio')::boolean, false));
 else raise exception 'invalid_section';
 end if;
 select * into cur from private.ielts_mock_results where sitting_id = s.id and student_id = p_student and section = p_section for update;
 if cur.sitting_id is not null and cur.revision is distinct from p_revision then raise exception 'result_changed'; end if;
 if cur.sitting_id is null and p_revision is not null then raise exception 'result_changed'; end if;
 insert into private.ielts_mock_results(sitting_id, student_id, section, marks, criteria, revision, entered_by, entered_at)
 values (s.id, p_student, p_section, p_marks, p_criteria, 1, auth.uid(), now())
 on conflict (sitting_id, student_id, section) do update set marks = excluded.marks, criteria = excluded.criteria,
  revision = private.ielts_mock_results.revision + 1, entered_by = excluded.entered_by, entered_at = excluded.entered_at
 returning * into saved;
 insert into private.ielts_mock_result_events(sitting_id, student_id, section, marks, criteria, revision, entered_by)
 values (saved.sitting_id, saved.student_id, saved.section, saved.marks, saved.criteria, saved.revision, saved.entered_by);
 return private.ielts_mock_result_json(saved, private.ielts_mock_exposed(p_student, s.id));
end $$;

revoke all on function public.rpc_ielts_mock_sitting_open(uuid,text,date,text) from public, anon;
revoke all on function public.rpc_ielts_mock_sittings(uuid) from public, anon;
revoke all on function public.rpc_ielts_mock_sitting(uuid) from public, anon;
revoke all on function public.rpc_ielts_mock_save(uuid,uuid,text,text,jsonb,int) from public, anon;
grant execute on function public.rpc_ielts_mock_sitting_open(uuid,text,date,text) to authenticated;
grant execute on function public.rpc_ielts_mock_sittings(uuid) to authenticated;
grant execute on function public.rpc_ielts_mock_sitting(uuid) to authenticated;
grant execute on function public.rpc_ielts_mock_save(uuid,uuid,text,text,jsonb,int) to authenticated;
revoke all on function private.ielts_round_half(numeric) from public, anon, authenticated;
revoke all on function private.ielts_indicative_objective(text,int) from public, anon, authenticated;
revoke all on function private.ielts_valid_band(jsonb) from public, anon, authenticated;
revoke all on function private.ielts_indicative_productive(text,jsonb) from public, anon, authenticated;
revoke all on function private.ielts_mock_sitting_assert(uuid) from public, anon, authenticated;
revoke all on function private.ielts_mock_exposed(uuid,uuid) from public, anon, authenticated;
revoke all on function private.ielts_mock_result_json(private.ielts_mock_results,boolean) from public, anon, authenticated;

-- 5. Mock item evidence joins the learning record once its construct mappings are approved.
create or replace function private.ielts_student_construct_sources(p_student uuid)
returns table(node_id uuid, skill text, kind text, source_key text, at timestamptz, opps int, correct int, independent boolean)
language sql stable security definer set search_path to '' as $$
 with attempts as (
  select e.attempt_id, e.version_id, e.started_at,
         row_number() over (partition by e.version_id order by e.started_at, e.attempt_id) as nth
  from private.ielts_diagnostic_attempt_evidence e
  where e.student_id = p_student and exists(select 1 from private.ielts_diagnostic_scoring_runs r where r.attempt_id = e.attempt_id)
 ), runs as (
  select distinct on (r.attempt_id) r.attempt_id, r.outcomes, r.created_at
  from private.ielts_diagnostic_scoring_runs r join attempts a on a.attempt_id = r.attempt_id
  where r.server_verified
  order by r.attempt_id, r.run_version desc, r.created_at desc
 ), screener as (
  select n.id as node_id, o->>'skill' as skill, 'screener'::text as kind, a.attempt_id::text as source_key,
         coalesce(a.started_at, r.created_at) as at,
         sum((o->>'marks_possible')::int)::int as opps, sum((o->>'marks_awarded')::int)::int as correct, a.nth = 1 as independent
  from runs r join attempts a using (attempt_id)
  cross join lateral jsonb_array_elements(r.outcomes) o
  join public.academic_skill_registry_nodes n on n.code = o->>'construct'
  where o->>'response_state' = 'answered'
  group by n.id, o->>'skill', a.attempt_id, a.started_at, r.created_at, a.nth
 ), targeted as (
  select (o->>'taxonomy_node_id')::uuid as node_id, t.skill, 'targeted'::text as kind, al.id::text as source_key, s.submitted_at as at,
         count(*)::int as opps, count(*) filter (where (o->>'correct')::boolean)::int as correct,
         t.purpose = 'independent_check' and not exists(
           select 1 from private.ielts_learning_allocations p where p.student_id = al.student_id and p.task_code = al.task_code and p.created_at < al.created_at) as independent
  from private.ielts_learning_allocations al
  join private.ielts_learning_submissions s on s.allocation_id = al.id
  join private.ielts_learning_tasks t on t.code = al.task_code
  cross join lateral jsonb_array_elements(s.outcomes) o
  where al.student_id = p_student and t.skill in ('listening','reading') and o ? 'taxonomy_node_id' and o->>'response_state' = 'answered'
  group by 1, t.skill, al.id, al.student_id, al.task_code, al.created_at, s.submitted_at, t.purpose
 ), mock as (
  select m.node_id, r.section as skill, 'mock'::text as kind, s.id::text || ':' || r.section as source_key,
         (s.sat_on::timestamp at time zone 'Asia/Bishkek') as at,
         count(*)::int as opps, count(*) filter (where substr(r.marks, i, 1) = '1')::int as correct,
         not private.ielts_mock_exposed(r.student_id, s.id) as independent
  from private.ielts_mock_results r
  join private.ielts_mock_sittings s on s.id = r.sitting_id
  cross join generate_series(1, 40) i
  join private.ielts_material_construct_maps m on m.material_type = 'mock' and m.material_id = s.mock_code
   and m.item_key = (case r.section when 'listening' then 'L' else 'R' end) || i::text and m.status = 'approved' and m.role = 'primary'
  where r.student_id = p_student and r.marks is not null and substr(r.marks, i, 1) <> '-'
  group by m.node_id, r.section, s.id, s.sat_on, r.student_id
 )
 select * from screener union all select * from targeted union all select * from mock;
$$;
revoke all on function private.ielts_student_construct_sources(uuid) from public, anon, authenticated;

-- Mock items show their question type in the mapping review queue.
create or replace function public.rpc_ielts_construct_mapping_queue() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
 perform private.ielts_mapping_admin();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',b.id,'title',b.title,'status',b.status,'proposed_by',b.proposed_by,'proposal_basis',b.proposal_basis,
  'created_at',b.created_at,'decided_at',b.decided_at,'decision_notes',b.decision_notes,
  'reviewer',(select coalesce(nullif(u.full_name,''),u.username) from public.users u where u.id=b.reviewer_id),
  'sha256',private.ielts_mapping_batch_sha(b.id),
  'minimum_sample',greatest(3,ceil(0.2*(select count(*) from private.ielts_material_construct_maps m where m.batch_id=b.id and m.status<>'superseded'))::int),
  'items',(select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'material_type',m.material_type,'material_id',m.material_id,
     'display_code',coalesce(private.ielts_material_code(m.material_type,m.material_id),m.material_id),
     'title',coalesce(r.content->>'title',m.material_id),'item_key',m.item_key,
     'item_text',coalesce((select coalesce(q->>'question',q->>'prompt') from jsonb_array_elements(r.content->'questions') q where q->>'n'=m.item_key limit 1),
       (select 'Question type: '||(i->>'t') from private.ielts_mock_forms f, jsonb_array_elements(f.items) i where m.material_type='mock' and f.code=m.material_id and upper(i->>'s')||(i->>'n')=m.item_key limit 1)),
     'node_code',n.code,'node_name',n.name,'role',m.role,'rationale',m.rationale,'status',m.status)
     order by m.material_type, nullif(regexp_replace(m.material_id,'\D','','g'),'')::int, m.material_id, nullif(regexp_replace(coalesce(m.item_key,''),'\D','','g'),'')::int nulls first, m.role),'[]')
   from private.ielts_material_construct_maps m
   join public.academic_skill_registry_nodes n on n.id=m.node_id
   left join private.ielts_reviewed_practice r on r.material_type=m.material_type and r.material_id=m.material_id
   where m.batch_id=b.id and m.status<>'superseded')) order by b.created_at desc) from private.ielts_content_review_batches b where b.kind='construct_mapping'),'[]');
end $$;
revoke all on function public.rpc_ielts_construct_mapping_queue() from public, anon;
grant execute on function public.rpc_ielts_construct_mapping_queue() to authenticated;

-- 6. AI-proposed construct mappings for all 240 mock items (pending a named administrator's batch review).
with b as (
 insert into private.ielts_content_review_batches(kind,title,proposed_by,proposal_basis)
 select 'construct_mapping','Construct mappings: mock tests M1–M3 (240 Listening and Reading items)',
  'Claude (AI assistant) on the owner''s instruction of 2026-10-19',
  'Rule-based proposals from each item''s question type, instructions and key in the approved v1.0.0 mock sources. Diagnostic Bible 2.0.0 sections 7.5, 12A and 15E.2A. A named content administrator must review a sample and approve or request changes.'
 where not exists(select 1 from private.ielts_content_review_batches where title like 'Construct mappings: mock tests M1–M3%')
 returning id)
insert into private.ielts_material_construct_maps(batch_id,material_type,material_id,item_key,node_id,role,rationale)
select b.id, 'mock', f.code, upper(i->>'s') || (i->>'n'), n.id, x.role,
 'Proposed from the ' || (i->>'t') || ' question type (' || case i->>'s' when 'l' then 'Listening' else 'Reading' end || ').'
from b cross join private.ielts_mock_forms f cross join lateral jsonb_array_elements(f.items) i
cross join lateral (select i->>'p' as c, 'primary'::text as role union all select jsonb_array_elements_text(i->'x'), 'supporting') x
join public.academic_skill_registry_nodes n on n.code = replace(replace(replace(x.c, 'L:', 'bh-ielts-listening-v1-'), 'C:', 'bh-ielts-core-v1-'), 'R:', 'eng.reading.');

do $$ begin
 if (select count(*) from private.ielts_material_construct_maps where material_type='mock') <> 437
 then raise exception 'expected 437 proposed mock mappings (a construct code did not resolve)'; end if;
end $$;
