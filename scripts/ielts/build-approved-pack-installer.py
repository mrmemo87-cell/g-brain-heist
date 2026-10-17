"""Build a temporary, capability-authenticated installer from an owner-approved ZIP.
Output stays outside the public repository. Deploy, invoke once, verify, then retire.
"""
import argparse,hashlib,json,pathlib,secrets
p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('object_path');p.add_argument('expected_sha256');p.add_argument('output');a=p.parse_args()
b=pathlib.Path(a.archive).read_bytes()
assert hashlib.sha256(b).hexdigest()==a.expected_sha256
assert len(b)<=20000000
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
secret=secrets.token_hex(32)
source='''import {createClient} from "npm:@supabase/supabase-js@2.78.0";
const capability=CAPABILITY, path=OBJECT_PATH, expected=EXPECTED;
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method!=='POST'||req.headers.get('x-install-capability')!==capability)return new Response('Not authorized',{status:403});
 try {
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 if(Number(req.headers.get('content-length'))!==EXPECTED_SIZE)return new Response('Wrong asset size',{status:400});
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(bytes.length!==EXPECTED_SIZE)return new Response('Wrong asset size',{status:400});
 if(await hash(bytes)!==expected)throw new Error('Source hash mismatch');
 const store=admin.storage.from('ielts-teacher-course-packs');
 const existing=await store.download(path);
 if(existing.data){if(await hash(new Uint8Array(await existing.data.arrayBuffer()))!==expected)throw new Error('Existing object mismatch');}
 else {const upload=await store.upload(path,bytes,{contentType:'application/zip',upsert:false,cacheControl:'3600'});if(upload.error)throw upload.error;}
 const verified=await store.download(path);if(verified.error||!verified.data||await hash(new Uint8Array(await verified.data.arrayBuffer()))!==expected)throw new Error('Stored hash mismatch');
 return Response.json({installed:true,path,sha256:expected,bytes:bytes.length});
 }catch(e){console.error('Approved pack installation failed',String(e));return new Response('Installation failed',{status:500});}
});
'''.replace('CAPABILITY',json.dumps(secret)).replace('OBJECT_PATH',json.dumps(a.object_path)).replace('EXPECTED_SIZE',str(len(b))).replace('EXPECTED',json.dumps(a.expected_sha256))
(out/'index.ts').write_text(source)
(out/'capability.txt').write_text(secret)
print(json.dumps({'output':str(out),'archive_sha256':a.expected_sha256,'bytes':len(b)}))
