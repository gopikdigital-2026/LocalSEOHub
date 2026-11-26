import hashlib,os,json,sys
out={}
for root in ['src','supabase','package.json','package-lock.json','tsconfig.json','tsconfig.app.json','vite.config.ts','eslint.config.js']:
  files=[root] if os.path.isfile(root) else [os.path.join(d,f) for d,_,fs in os.walk(root) for f in fs]
  for p in files: out[p]=hashlib.sha256(open(p,'rb').read()).hexdigest()
json.dump(dict(sorted(out.items())),open(sys.argv[1],'w'),indent=1);print(len(out))
