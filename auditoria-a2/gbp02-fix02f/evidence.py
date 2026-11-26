import os,re,json,hashlib,zipfile,difflib
EV='auditoria-a2/gbp02-fix02f/evidence'
os.makedirs(EV,exist_ok=True)
TEST='src/features/meta-connection/__tests__/a351MetaConnection.test.ts'
BEFORE_SHA='07c224a828c6128c951fd0e227ea335117ccae53b23a8a1b3be7ee587b673d81'
ZIPS=['final-audit','fix01','fix01a','fix02a','fix02b','fix02c','fix02d','fix02e']
FIX02B=['supabase/functions/'+f+'/'+x for f in ['gbp-oauth-start','gbp-disconnect','gbp-sync','gbp-reviews'] for x in ['handler.ts','index.ts']]
FIX02C=['supabase/functions/'+f+'/'+x for f in ['gbp-recover-attempt','gbp-list-locations'] for x in ['handler.ts','index.ts']]+['src/features/reality-engine/engine.ts']
sha=lambda b:hashlib.sha256(b).hexdigest()
fh=lambda p:sha(open(p,'rb').read())
zips={k:zipfile.ZipFile(f'deliverables/localseohub-gbp02-{k}.zip') for k in ZIPS}
def zread(k,p):
  try: return zips[k].read(p)
  except KeyError: return None

before=zread('fix02e',TEST); assert sha(before)==BEFORE_SHA
after=open(TEST,'rb').read()
open(EV+'/a351MetaConnection.test.ts.before','wb').write(before)
open(EV+'/a351MetaConnection.test.ts.after','wb').write(after)
pair=re.compile(r"^\s*'([^']+)': '([0-9a-f]{64})',$",re.M)
def frozen(b):
  t=b.decode(); blk=t[t.index("GBP regression: frozen files"):]; blk=blk[:blk.index('};')]
  return dict(pair.findall(blk))
fb,fa=frozen(before),frozen(after)
assert list(fb)==list(fa) and len(fb)==20
changed=[p for p in fb if fb[p]!=fa[p]]
assert sorted(changed)==sorted(FIX02B+FIX02C),changed
cur={p:fh(p) for p in fa}
assert all(fa[p]==cur[p] for p in fa)
assert all(fb[p]==cur[p] for p in fa if p not in changed)
json.dump({'test':TEST,'test_sha256':BEFORE_SHA,'frozen':fb},open(EV+'/before-hashes.json','w'),indent=1)
json.dump({'test':TEST,'test_sha256':sha(after),'frozen':fa,'current_real':cur},open(EV+'/after-hashes.json','w'),indent=1)

lineage={p:{k:(sha(zread(k,p)) if zread(k,p) is not None else None) for k in ZIPS} for p in fa}
for p in FIX02B:
  assert lineage[p]['fix02a']==fb[p] and lineage[p]['fix02b']==cur[p],p
for p in FIX02C:
  assert lineage[p]['fix02b']==fb[p] and lineage[p]['fix02c']==cur[p],p
for p in changed:
  assert lineage[p]['fix02d']==cur[p] and lineage[p]['fix02e']==cur[p],p
json.dump(lineage,open(EV+'/lineage.json','w'),indent=1)
repin=[{'file':p,'phase':'FIX02B' if p in FIX02B else 'FIX02C','diff_base':'fix02a' if p in FIX02B else 'fix02b','before':fb[p],'after':fa[p]} for p in fb if p in changed]
json.dump(repin,open(EV+'/repin-13.json','w'),indent=1)

td=''.join(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),'a/'+TEST,'b/'+TEST))
open(EV+'/guardian-test.diff','w').write(td)
dl=[l for l in td.splitlines() if l[:1] in '+-' and not l.startswith(('+++','---'))]
assert len(dl)==26 and all(pair.match(l[1:]) for l in dl)
gd,stats='',{}
for r in repin:
  p=r['file']; base=zread(r['diff_base'],p).decode().splitlines(True); now=open(p).read().splitlines(True)
  d=list(difflib.unified_diff(base,now,f"{r['diff_base']}/{p}",'current/'+p)); gd+=''.join(d)
  stats[p]={'base':r['diff_base'],'added':sum(1 for l in d if l.startswith('+') and not l.startswith('+++')),'removed':sum(1 for l in d if l.startswith('-') and not l.startswith('---'))}
open(EV+'/guardian-files.diff','w').write(gd)
json.dump(stats,open(EV+'/guardian-files-stats.json','w'),indent=1)

GEN=('auditoria-a2/gbp02-fix02f/','GBP_02_FIX02F_')
diffs,same,gone=[],0,[]
for n in zips['fix02e'].namelist():
  if n.startswith(('auditoria-a2/gbp02-fix02e/','deliverables/')) or n.endswith('.json') and n.startswith('FIX02E'): continue
  if not os.path.exists(n): gone.append(n); continue
  if sha(zips['fix02e'].read(n))==fh(n): same+=1
  else: diffs.append(n)
assert diffs==[TEST],diffs
integ={'base':'deliverables/localseohub-gbp02-fix02e.zip','compared_identical':same,'changed':diffs,'absent_in_project_not_code':gone}
json.dump(integ,open(EV+'/integrity.json','w'),indent=1)
print(json.dumps({'changed':len(changed),'test_after':sha(after),'test_diff_sha':sha(td.encode()),'files_diff_lines':len(gd.splitlines()),'integrity_same':same,'integrity_changed':diffs,'absent':len(gone)},indent=1))
