#!/usr/bin/env python3
import argparse, glob, json, os, re
from collections import Counter

def canon(code:str):
    if not code:
        return None
    code=code.strip()
    m=re.match(r'^(9701_[msw]\d{2}_qp_\d{2})\s*\|\s*(\d+)$',code)
    if m:
        return f"{m.group(1)}|{int(m.group(2))}"
    m=re.match(r'^(9701_[msw]\d{2}_qp_\d{2})\s+Q:\s*(\d+)$',code)
    if m:
        return f"{m.group(1)}|{int(m.group(2))}"
    return None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--pages', required=True)
    ap.add_argument('--master', required=True)
    ap.add_argument('--out', default='CHEMISTRY_CODE_AUDIT.json')
    ap.add_argument('--unused-out', default='CHEMISTRY_MASTER_UNUSED_CODES_REPORT.json')
    args=ap.parse_args()

    master_text=open(args.master,encoding='utf-8',errors='ignore').read()
    master_keys=set(re.findall(r"'((?:9701_[msw]\d{2}_qp_\d{2}\|\d+))'\s*:\s*'[ABCD]'",master_text))

    code_pat=re.compile(r"code:\s*'([^']+)'")
    master_pat=re.compile(r"masterCode:\s*'([^']+)'")

    entries=[]
    for f in sorted(glob.glob(os.path.join(args.pages,'*.html'))):
        if f.endswith('index.html'):
            continue
        lines=open(f,encoding='utf-8',errors='ignore').read().splitlines()
        for i,l in enumerate(lines,1):
            m=code_pat.search(l)
            if not m:
                continue
            code=m.group(1).strip()
            master_code=None
            for j in range(i,min(i+4,len(lines))+1):
                mm=master_pat.search(lines[j-1])
                if mm:
                    master_code=mm.group(1).strip();break
            effective=master_code or code
            entries.append({'file':os.path.basename(f),'line':i,'code':code,'masterCode':master_code,'effective':effective,'canonical_code':canon(code),'canonical_effective':canon(effective)})

    eff=[e for e in entries if e['canonical_effective']]
    eff_counter=Counter(e['canonical_effective'] for e in eff)
    dup_eff=sorted([k for k,v in eff_counter.items() if v>1])
    missing=sorted(set(eff_counter.keys())-master_keys)
    unused=sorted(master_keys-set(eff_counter.keys()))

    code_counter=Counter(e['canonical_code'] for e in entries if e['canonical_code'])
    dup_code=sorted([k for k,v in code_counter.items() if v>1])

    audit={
        'schema_version':'2.0',
        'total_entries':len(entries),
        'canonical_parseable':len(eff),
        'invalid_format_count':len([e for e in entries if not e['canonical_effective']]),
        'unique_canonical_codes':len(set(eff_counter.keys())),
        'duplicate_canonical_count':len(dup_eff),
        'missing_in_master_count':len(missing),
        'duplicates':dup_eff,
        'display_code_duplicate_count':len(dup_code),
        'display_code_duplicates':dup_code,
        'master_code_override_count':sum(1 for e in entries if e['masterCode']),
        'missing_in_master':missing,
        'unused_master_count':len(unused),
        'unused_master_codes':unused,
    }
    with open(args.out,'w',encoding='utf-8') as f:
        json.dump(audit,f,indent=2)

    unused_report={
        'schema_version':'2.0',
        'canonical_parseable':audit['canonical_parseable'],
        'invalid_format_count':audit['invalid_format_count'],
        'duplicate_canonical_count':audit['duplicate_canonical_count'],
        'missing_in_master_count':audit['missing_in_master_count'],
        'unused_master_count':audit['unused_master_count'],
        'unused_master_codes':unused,
        'compatibility':{
            'canonical_parseable':'parseable_entries',
            'invalid_format_count':'invalid_entries',
            'duplicate_canonical_count':'duplicate_canonical_codes'
        }
    }
    with open(args.unused_out,'w',encoding='utf-8') as f:
        json.dump(unused_report,f,indent=2)

if __name__=='__main__':
    main()
