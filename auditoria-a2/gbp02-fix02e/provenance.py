import hashlib,zipfile,glob,os,json
names=['photo-exif-gps.jpg','photo-text-exif.png'];base='src/features/publications/__tests__/fixtures/'
cur={n:{'size':os.path.getsize(base+n),'sha256':hashlib.sha256(open(base+n,'rb').read()).hexdigest()} for n in names}
cp=[]
for z in sorted(glob.glob('*.zip')+glob.glob('deliverables/*.zip')):
  if 'fix02e' in z: continue
  with zipfile.ZipFile(z) as f:
    for i in f.infolist():
      if os.path.basename(i.filename) in names:
        b=f.read(i);cp.append({'zip':z,'entry':i.filename,'size':len(b),'sha256':hashlib.sha256(b).hexdigest()})
json.dump({'current':cur,'archived_copies':cp},open('auditoria-a2/gbp02-fix02e/evidence/provenance.json','w'),indent=1)
print(len(cp),len({c['zip'] for c in cp}),all(c['sha256']==cur[os.path.basename(c['entry'])]['sha256'] for c in cp))
