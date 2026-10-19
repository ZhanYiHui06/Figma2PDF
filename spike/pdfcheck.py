import pypdf,re,collections,sys
f=sys.argv[1]; r=pypdf.PdfReader(f)
seen=set(); ops=collections.Counter(); cspaces=collections.Counter(); imgs=[]
def walk(obj, data):
    for m in re.findall(r'(?:-?[\d.]+ ){1,4}(?:scn|sc|SCN|SC|rg|RG|k|K|g|G)\b', data): ops[m]+=1
    res=obj.get('/Resources',{})
    res=res.get_object() if res else {}
    for n,cs in (res.get('/ColorSpace') or {}).items():
        cs=cs.get_object(); cspaces[str(cs[0] if isinstance(cs,list) else cs)]+=1
    for n,x in (res.get('/XObject') or {}).items():
        x=x.get_object()
        if id(x) in seen: continue
        seen.add(id(x))
        if x['/Subtype']=='/Image':
            cs=x.get('/ColorSpace'); cs=cs.get_object() if cs is not None else None
            imgs.append((x['/Width'],x['/Height'], str(cs[0] if isinstance(cs,list) else cs), x.get('/Filter')))
        else: walk(x, x.get_data().decode('latin1'))
for p in r.pages:
    walk(p, p.get_contents().get_data().decode('latin1'))
    print('boxes', p.mediabox, p.get('/TrimBox'), p.get('/BleedBox'))
print('colorspaces',dict(cspaces)); print('images',imgs)
for k,v in ops.most_common(12): print(v,k)
print('text:', r.pages[0].extract_text()[:60].replace('\n',' '))
