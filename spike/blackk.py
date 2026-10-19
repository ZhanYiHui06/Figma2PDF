# Spike: rewrite neutral near-black sRGB fills/strokes to DeviceCMYK K-only.
import pypdf,re,sys
from pypdf.generic import NameObject, StreamObject
src,dst=sys.argv[1],sys.argv[2]; TH=float(sys.argv[3]) if len(sys.argv)>3 else 0.2
r=pypdf.PdfReader(src); w=pypdf.PdfWriter(clone_from=r)
pat=re.compile(rb'(?m)^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (scn|SCN)$')
stats={'k':0,'kept':0}
def fix(data, csname):
    def rep(m):
        r_,g,b=(float(x) for x in m.group(1,2,3)); op=m.group(4)
        neutral=max(r_,g,b)-min(r_,g,b)<0.03
        if neutral and max(r_,g,b)<=TH:
            stats['k']+=1
            return b'0 0 0 1 '+(b'k' if op==b'scn' else b'K')
        stats['kept']+=1
        cs=b'cs' if op==b'scn' else b'CS'
        return b'/'+csname+b' '+cs+b' '+m.group(0)
    return pat.sub(rep,data)
seen=set()
def walk(obj):
    res=obj.get('/Resources'); res=res.get_object() if res else {}
    for n,x in (res.get('/XObject') or {}).items():
        xo=x.get_object()
        if xo.get('/Subtype')!='/Form' or id(xo) in seen: continue
        seen.add(id(xo))
        csn=list((xo['/Resources'].get('/ColorSpace') or {}).keys())
        if csn:
            xo.set_data(fix(xo.get_data(), csn[0][1:].encode()))
        walk(xo)
for p in w.pages: walk(p)
w.write(dst); print(stats)
