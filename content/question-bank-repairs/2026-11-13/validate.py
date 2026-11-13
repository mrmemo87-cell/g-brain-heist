import hashlib,json,re,uuid,xml.etree.ElementTree as ET
from pathlib import Path

folder=Path(__file__).resolve().parent
root=folder.parents[2]
d=json.loads((folder/'repairs.json').read_text())
reps=d['repairs']
assert len(reps)==139
assert len({r['original_id'] for r in reps})==139 and len({r['replacement_id'] for r in reps})==139
for r in reps:
 uuid.UUID(r['original_id']);uuid.UUID(r['replacement_id'])
 p=r['patch']
 assert set(p)<= {'question_text','image_url','image_alt_text'}, 'only the stem and visual context may change'
 new=p['question_text']
 assert new and new==new.strip() and len(new.split())<len(r['original_text'].split()), r['original_id']
 assert not re.match(r'(?i)^(use|uses|we use|introduce)\s',new), new
 if 'image_url' in p:
  assert p['image_url'].startswith('https://www.brainsheist.com/question-assets/2026-11-13/')
  assert 20<=len(p['image_alt_text'])<=240
assert len(d['assets'])==3
for a in d['assets']:
 data=(root/a['path']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==a['sha256'] and a['sha256'][:12] in a['path']
 svg=ET.fromstring(data)
 assert svg.attrib['width']=='640' and svg.attrib['height']=='360'
 assert svg.find('{http://www.w3.org/2000/svg}title') is not None
 for el in svg.iter():
  assert el.tag.split('}')[-1] not in ['script','image','foreignObject']
  assert not any(k.lower().startswith('on') or k.split('}')[-1]=='href' for k in el.attrib)
print('Validated 139 stem replacements and three immutable SVG assets.')
