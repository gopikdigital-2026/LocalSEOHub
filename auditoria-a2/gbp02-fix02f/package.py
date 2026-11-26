import os,re,json,hashlib,zipfile,fnmatch,shutil
OUT='deliverables/localseohub-gbp02-fix02f.zip'
ROOT='localseohub-gbp02-fix02f.zip'
CHECKS='auditoria-a2/gbp02-fix02f/delivery-checks.json'
EXD={'node_modules','dist','.git','.bolt','deliverables'}
def skip(p):
  b=os.path.basename(p)
  return b.startswith('.env') or b.endswith('.zip') or any(fnmatch.fnmatch(b,g) for g in ['*.pem','*.key','*.p12','*.pfx','id_rsa*'])
files=[]
for d,ds,fs in os.walk('.'):
  ds[:]=[x for x in ds if x not in EXD]
  for f in fs:
    p=os.path.relpath(os.path.join(d,f))
    if not skip(p) and p!=CHECKS: files.append(p)
files.sort()
repin=json.load(open('auditoria-a2/gbp02-fix02f/evidence/repin-13.json'))
EVF=['meta-guardian-before.log','meta-guardian.log','gbp-fix.log','full-suite.log','full-suite.json','typecheck.log','lint.log','build.log','before-hashes.json','after-hashes.json','integrity.json','lineage.json','repin-13.json','guardian-test.diff','guardian-files.diff','guardian-files-stats.json','a351MetaConnection.test.ts.before','a351MetaConnection.test.ts.after']
req=['GBP_02_FIX02F_REPORT.md','GBP_02_FIX02F_TEST_REPORT.md','src/features/meta-connection/__tests__/a351MetaConnection.test.ts','auditoria-a2/gbp02-fix02f/evidence.py','auditoria-a2/gbp02-fix02f/package.py']+[r['file'] for r in repin]+['auditoria-a2/gbp02-fix02f/evidence/'+x for x in EVF]
missing=[r for r in req if r not in files]; assert not missing,missing
secret=re.compile(rb'(sk_live_[0-9A-Za-z]{10,}|sk_test_[0-9A-Za-z]{10,}|whsec_[0-9A-Za-z]{10,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY|AIza[0-9A-Za-z_\-]{30,}|GOCSPX-[0-9A-Za-z_\-]{10,})')
hits=[p for p in files if secret.search(open(p,'rb').read())]
assert not hits,hits
manifest={'deliverable':'localseohub-gbp02-fix02f.zip','generated':'2026-11-25','entries':{p:{'size':os.path.getsize(p),'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest()} for p in files}}
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
  for p in files: z.write(p,p)
  z.writestr('FIX02F_ZIP_MANIFEST.json',json.dumps(manifest,indent=1))
shutil.copyfile(OUT,ROOT)
with zipfile.ZipFile(OUT) as z:
  names=z.namelist();bad=z.testzip();m=json.loads(z.read('FIX02F_ZIP_MANIFEST.json'))
  mism=[n for n,v in m['entries'].items() if hashlib.sha256(z.read(n)).hexdigest()!=v['sha256']]
h=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
r={'entries':len(names),'crc_bad':bad,'hash_mismatch':mism,'secret_hits':hits,'required_present':all(x in names for x in req),'zip_sha256':h(OUT),'root_copy_identical':h(OUT)==h(ROOT),'zip_size':os.path.getsize(OUT)}
json.dump(r,open(CHECKS,'w'),indent=1);print(json.dumps(r,indent=1))
