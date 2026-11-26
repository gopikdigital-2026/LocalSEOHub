import json
T='src/features/meta-connection/__tests__/a351MetaConnection.test.ts'
L=json.load(open('auditoria-a2/gbp02-fix02f/evidence/lineage.json'))
s=open(T).read(); changes=[]
for f,r in L.items():
  if r['pinned']==r['current']: continue
  old=f"'{f}': '{r['pinned']}'"; new=f"'{f}': '{r['current']}'"
  assert s.count(old)==1 and s.count(r['pinned'])==1, f
  s=s.replace(old,new); changes.append({'file':f,'before':r['pinned'],'after':r['current']})
assert len(changes)==13
open(T,'w').write(s)
json.dump(changes,open('auditoria-a2/gbp02-fix02f/evidence/repin-13.json','w'),indent=1)
print(len(changes))
