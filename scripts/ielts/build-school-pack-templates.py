"""Remove authoring-school branding only; retain reviewed lesson/audio content.
Private inputs and generated ZIPs must never be committed to the public repository.
"""
import argparse,base64,hashlib,io,json,pathlib,zipfile
import fitz
APPROVED='66feb1c16b2ec3d2994d624aa9a17e4a53c91d59feb4d42645e6d32ef30c0775'
OLD='Silk Road International School'; TOKEN='{{BH_SCHOOL_NAME}}'
BLANK=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=')
def digest(b):return hashlib.sha256(b).hexdigest()
def neutral_pdf(b):
 d=fitz.open(stream=b,filetype='pdf');slots=[]
 for page in d:
  names=[];logos=[]
  for block in page.get_text('dict')['blocks']:
   for line in block.get('lines',[]):
    for s in line['spans']:
     if OLD in s['text']:
      names.append(dict(text=s['text'].replace(OLD,TOKEN),x=s['origin'][0],y=s['origin'][1],width=page.rect.width-s['origin'][0]-40,size=s['size'],color=s['color'],bold='Bold' in s['font']))
      page.add_redact_annot(fitz.Rect(s['bbox'])+(-.1,-.1,.1,.1),fill=(1,1,1))
  for image in page.get_image_info():
   if image['width']==1707 and image['height']==1920:
    logos.append(list(image['bbox']));page.add_redact_annot(image['bbox'],fill=(1,1,1))
  page.apply_redactions(images=1,graphics=0,text=0)
  slots.append(dict(names=names,logos=logos))
 d.set_metadata({k:v.replace(OLD,TOKEN) for k,v in d.metadata.items() if isinstance(v,str)})
 d.del_xml_metadata()
 out=d.tobytes(garbage=4,deflate=True)
 with fitz.open(stream=out,filetype='pdf') as check:
  assert len(check)==len(d)
  assert all(OLD not in p.get_text() for p in check)
 return out,slots

def main():
 p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('output');a=p.parse_args()
 raw=pathlib.Path(a.archive).read_bytes();assert digest(raw)==APPROVED
 out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True);index=[]
 with zipfile.ZipFile(io.BytesIO(raw)) as source:
  for code in ['IELTS-03','IELTS-04']:
   files={};pdfs={};pptx_media={}
   for path in sorted(source.namelist()):
    if not path.startswith(code+'/') or path.endswith('/'):continue
    b=source.read(path)
    if path.endswith('.pdf'):b,pdfs[path]=neutral_pdf(b)
    elif path.endswith('.pptx'):
     parts={}
     with zipfile.ZipFile(io.BytesIO(b)) as deck:
      for n in deck.namelist():
       value=deck.read(n)
       if n.endswith('.xml'):value=value.decode().replace(OLD,TOKEN).encode()
       if n=='ppt/media/image.png':value=BLANK
       parts[n]=value
     stream=io.BytesIO()
     with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as deck:
      for n,value in parts.items():deck.writestr(n,value)
     b=stream.getvalue();pptx_media[path]='ppt/media/image.png'
    elif path.endswith(('.html','.txt','.json')):b=b.decode().replace(OLD,TOKEN).encode()
    elif path.endswith('/assets/school-logo.png'):b=BLANK
    files[path]=b
   files['assets/branding-regular.ttf']=pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').read_bytes()
   files['assets/branding-bold.ttf']=pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf').read_bytes()
   files['assets/FONT-LICENSE.txt']=pathlib.Path('/usr/share/doc/fonts-dejavu-core/copyright').read_bytes()
   files['BRANDING.json']=json.dumps(dict(version='1.0.0',lesson_code=code,source_archive_sha256=APPROVED,approved_source_sha256='3e2f36e5713d8cb7851e4eb4868413b05f013e79189f28aa65aabd0217dc5cd2',pdfs=pdfs,pptx_media=pptx_media),ensure_ascii=False).encode()
   files['READ-ME-FIRST.txt']=(TOKEN+'\n'+code+' - approved Academic IELTS teacher pack\nExtract the entire ZIP and open '+code+'/01-START-HERE.html.\nKeep teacher keys, models and fresh follow-up checks private.\nUse the shared smart print controls in the HTML documents. PDFs are school-branded print copies.\nContent revision 2026-10-17.1 and exact recordings approved by the owner.\nClassroom practice does not automatically update Journey or estimate bands.\n').encode()
   files['TEMPLATE-MANIFEST.json']=json.dumps(dict(template_version='1.0.0',source_archive_sha256=APPROVED,files={n:digest(b) for n,b in files.items()}),sort_keys=True).encode()
   target=out/(code+'-school-template-v1.0.0.zip')
   with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for n,b in sorted(files.items()):z.writestr(n,b)
   item=dict(code=code,path=str(target),sha256=digest(target.read_bytes()),bytes=target.stat().st_size,pdf_count=len(pdfs));index.append(item)
 (out/'index.json').write_text(json.dumps(index,indent=2));print(json.dumps(index))
if __name__=='__main__':main()
