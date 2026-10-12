import base64,hashlib,json,re,uuid,xml.etree.ElementTree as ET
from pathlib import Path

folder=Path(__file__).resolve().parent
root=folder.parents[2]
d=json.loads((folder/'repairs.json').read_text())
assert len(d['repairs'])==233 and len(d['retirements'])==48 and len(d['metadata'])==780
assert len({r['original_id'] for r in d['repairs']})==233
assert len({r['replacement_id'] for r in d['repairs']})==233
assert not ({r['original_id'] for r in d['repairs']} & {r['id'] for r in d['retirements']})
for row in d['repairs']:
 uuid.UUID(row['original_id']);uuid.UUID(row['replacement_id'])
 assert re.fullmatch('[0-9a-f]{64}',row['original_hash'])
 patch=row['patch']
 if 'options' in patch:
  assert len(patch['options'])==4
  assert len(set(s.strip().casefold() for s in patch['options']))==4
  assert all(s==s.strip() and s for s in patch['options'])
  assert patch['correct_answer'] in patch['options']
 if 'image_alt_text' in patch:assert 20<=len(patch['image_alt_text'])<=240
assert len(d['assets'])==5
for a in d['assets']:
 data=(root/a['path']).read_bytes()
 assert hashlib.sha256(data).hexdigest()==a['sha256']
 assert a['sha256'][:12] in a['path']
 svg=ET.fromstring(data)
 assert svg.attrib['width']=='640' and svg.attrib['height']=='360'
 assert svg.find('{http://www.w3.org/2000/svg}title') is not None
 for el in svg.iter():
  assert el.tag.split('}')[-1] not in ['script','image','foreignObject']
  assert not any(k.lower().startswith('on') or k.split('}')[-1] in ['href'] for k in el.attrib)
print('Validated 233 replacements, 48 retirements, 780 language corrections and five immutable SVG assets.')
