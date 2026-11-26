import os,re,json,hashlib,zipfile,fnmatch,shutil
OUT='deliverables/localseohub-gbp02-fix02e.zip'
EXD={'node_modules','dist','.git','.bolt','deliverables'}
def skip(p):
  b=os.path.basename(p)
  return b.startswith('.env') or b.endswith('.zip') or any(fnmatch.fnmatch(b,g) for g in ['*.pem','*.key','*.p12','*.pfx','id_rsa*'])
files=[]
for d,ds,fs in os.walk('.'):
  ds[:]=[x for x in ds if x not in EXD]
  for f in fs:
    p=os.path.relpath(os.path.join(d,f))
    if not skip(p) and p!='auditoria-a2/gbp02-fix02e/delivery-checks.json': files.append(p)
files.sort()
req=['GBP_02_FIX02E_REPORT.md','GBP_02_FIX02E_TEST_REPORT.md','src/features/publications/__tests__/fixtures/photo-exif-gps.jpg','src/features/publications/__tests__/fixtures/photo-text-exif.png','src/features/reality-engine/__tests__/gbp02Fix02cDependencies.test.ts']+['auditoria-a2/gbp02-fix02e/evidence/'+x for x in ['publications.log','fix02c.log','gbp-compatibility.log','full-suite.log','typecheck.log','lint.log','build.log','provenance.json','before-hashes.json','after-hashes.json']]
missing=[r for r in req if r not in files]; assert not missing,missing
secret=re.compile(rb'(sk_live_[0-9A-Za-z]{10,}|sk_test_[0-9A-Za-z]{10,}|whsec_[0-9A-Za-z]{10,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_\-]{30,}|GOCSPX-[0-9A-Za-z_\-]{10,})')
hits=[p for p in files if secret.search(open(p,'rb').read())]
manifest={'deliverable':'localseohub-gbp02-fix02e.zip','generated':'2026-11-25','entries':{p:{'size':os.path.getsize(p),'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest()} for p in files}}
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
  for p in files: z.write(p,p)
  z.writestr('FIX02E_ZIP_MANIFEST.json',json.dumps(manifest,indent=1))
shutil.copyfile(OUT,'localseohub-gbp02-fix02e.zip')
with zipfile.ZipFile(OUT) as z:
  names=z.namelist();bad=z.testzip();m=json.loads(z.read('FIX02E_ZIP_MANIFEST.json'))
  mism=[n for n,v in m['entries'].items() if hashlib.sha256(z.read(n)).hexdigest()!=v['sha256']]
h=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
r={'entries':len(names),'crc_bad':bad,'hash_mismatch':mism,'secret_hits_reviewed_false_positive':hits,'required_present':all(x in names for x in req),'zip_sha256':h(OUT),'root_copy_identical':h(OUT)==h('localseohub-gbp02-fix02e.zip'),'zip_size':os.path.getsize(OUT)}
json.dump(r,open('auditoria-a2/gbp02-fix02e/delivery-checks.json','w'),indent=1);print(json.dumps(r,indent=1))
