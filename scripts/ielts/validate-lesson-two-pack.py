#!/usr/bin/env python3
"""Validate the prepared artifact contract, without approving academic content."""
import hashlib,json,re,sys,zipfile
from pathlib import Path
from pypdf import PdfReader
from xml.etree import ElementTree as ET
root=Path(__file__).resolve().parents[2]
p=Path(sys.argv[1]).resolve();d=json.loads((root/'docs/ielts/lessons/lesson-two/lesson.json').read_text());m=json.loads((p/'manifest.json').read_text())
assert d['status']=='Private teacher-review draft'
assert m['source_sha256']==hashlib.sha256((root/'docs/ielts/lessons/lesson-two/lesson.json').read_bytes()).hexdigest()
assert d['stages'][0]['start']==0 and d['stages'][-1]['end']==60
for i,s in enumerate(d['stages']):
 assert s['end']>s['start']
 if i:assert d['stages'][i-1]['end']==s['start']
assert len(d['reading']['items'])==6 and len({q['id'] for q in d['reading']['items']})==6
assert [q['answer'] for q in d['reading']['items']].count('TRUE')==2
assert [q['answer'] for q in d['reading']['items']].count('FALSE')==2
assert [q['answer'] for q in d['reading']['items']].count('NOT GIVEN')==2
for q in d['reading']['items']+d['followup']['items']:
 assert q['evidence'] and q['reason'] and q['statement']
# Complete, deliberately paginated printable files.
for f in m['files']:
 reader=PdfReader(p/f['file']);assert len(reader.pages)==f['pages'],f['file']
 assert all(page.extract_text().strip() for page in reader.pages)
 for page in reader.pages:
  assert 'IELTS-02 v1.0.0' in page.extract_text(),f['file']
student=' '.join(page.extract_text() for path in (p/'Students').glob('*.pdf') for page in PdfReader(path).pages)
assert not re.search(r'Q\d:\s*(TRUE|FALSE|NOT GIVEN)',student)
assert d['followup']['passage'] not in student
assert 'Private reading key' not in student
key=' '.join(page.extract_text() for page in PdfReader(p/'Teacher-private/Teacher_Keys_and_Models.pdf').pages)
for i,q in enumerate(d['reading']['items']):assert f"Q{i+1}: {q['answer']}" in key
# All local start-guide links resolve and do not accidentally create external requests.
start=(p/'01-START-HERE.html').read_text()
for href in re.findall(r'href="([^"]+)"',start):assert (p/href).is_file(),href
slides=json.loads((p/'Teacher-private/slides.json').read_text())
assert len(slides)==17
assert 'No recording required' in start
assert 'Teacher-private/Fresh_Transfer_Check.pdf' in start
assert slides[10]['body']==d['writing']['model']
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
with zipfile.ZipFile(p/'Teacher-private/Lesson_2_Presentation.pptx') as z:
 paths=sorted([n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+.xml',n)],key=lambda n:int(re.search(r'(\d+)\.xml',n)[1]))
 assert len(paths)==len(slides)
 for path,s in zip(paths,slides):
  node=ET.fromstring(z.read(path)); text='\n'.join(t.text or '' for t in node.findall('.//a:t',ns))
  assert s['title'] in text,path
  for line in s['body'].splitlines():assert line in text,path
  assert node.find('p:timing',ns) is None,path
  transition=node.find('p:transition',ns);assert transition is None or transition.get('advTm') is None
 assert len([n for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+.xml',n)])==17
assert (p/'Teacher-private/Lesson_2_Presentation.pptx').read_bytes()==(p/'Teacher-private/Lesson_2_Presentation_static.pptx').read_bytes()
print('PASS: continuous 60-minute plan; seven paginated PDFs; student/key separation; withheld fresh prompts; local links; source hash; PPTX/HTML body parity; notes and motion-free playback structure.')
