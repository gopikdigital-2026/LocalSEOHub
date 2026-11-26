import zipfile,hashlib,json,re,sys
T='src/features/meta-connection/__tests__/a351MetaConnection.test.ts'
src=open('auditoria-a2/gbp02-fix02f/evidence/a351MetaConnection.test.ts.before').read()
blk=src[src.index("P. GBP regression: frozen files"):src.index("byte-identical")]
pins=dict(re.findall(r"'([^']+)': '([0-9a-f]{64})'",blk))
Z=['localseohub-gbp02-final-audit','localseohub-gbp02-fix01','localseohub-gbp02-fix01a','localseohub-gbp02-fix02a','localseohub-gbp02-fix02b','localseohub-gbp02-fix02c','localseohub-gbp02-fix02d','localseohub-gbp02-fix02e']
zs={z:zipfile.ZipFile(f'deliverables/{z}.zip') for z in Z}
out={}
for f,p in pins.items():
  cur=hashlib.sha256(open(f,'rb').read()).hexdigest()
  row={'pinned':p,'current':cur,'by_zip':{}}
  for z,zf in zs.items():
    try: h=hashlib.sha256(zf.read(f)).hexdigest()
    except KeyError: h=None
    row['by_zip'][z]=('PINNED' if h==p else 'CURRENT' if h==cur else ('ABSENT' if h is None else 'OTHER:'+h))
  out[f]=row
json.dump(out,open(sys.argv[1],'w'),indent=1)
for f,r in out.items(): print(f.split('functions/')[-1][:38].ljust(38),' '.join(v[:7] for v in r['by_zip'].values()))
