import re, zlib

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find ALL stream...endstream blocks and check if they're CMYK images
idx = 0
count = 0
while True:
    # Find next "stream" keyword
    s = data.find(b'\nstream\n', idx)
    if s == -1:
        s = data.find(b'stream\n', idx)
    if s == -1:
        s = data.find(b'stream ', idx)
    if s == -1:
        break
    
    # Find end of stream data
    e = data.find(b'\nendstream', s + 8)
    if e == -1:
        e = data.find(b'endstream', s + 8)
    if e == -1:
        break
    
    raw = data[s+8:e].strip()
    if raw.startswith(b'\r'):
        raw = raw[1:]
    
    # Look backwards for image definition
    ctx_start = max(0, s - 500)
    ctx = data[ctx_start:s]
    
    if b'DeviceCMYK' in ctx:
        w = re.search(rb'/Width\s*(\d+)', ctx)
        h = re.search(rb'/Height\s*(\d+)', ctx)
        w_val = int(w.group(1)) if w else 0
        h_val = int(h.group(1)) if h else 0
        
        print(f'Image at offset {s}, raw stream = {len(raw)} bytes, {w_val}x{h_val}')
        
        try:
            decomp = zlib.decompress(raw)
            expected = w_val * h_val * 4
            print(f'  Decompressed: {len(decomp)} bytes (expected {expected})')
            
            if len(decomp) >= expected:
                rgb = bytearray()
                for j in range(0, expected, 4):
                    c, m, y, k = decomp[j], decomp[j+1], decomp[j+2], decomp[j+3]
                    r = int(255 * (1 - c/255) * (1 - k/255))
                    g = int(255 * (1 - m/255) * (1 - k/255))
                    b_val = int(255 * (1 - y/255) * (1 - k/255))
                    rgb.extend([max(0,min(255,r)), max(0,min(255,g)), max(0,min(255,b_val))])
                
                count += 1
                out = f'c:\\projetos_devs\\painelsorriso53\\_frm_{count}.ppm'
                with open(out, 'wb') as f:
                    f.write(f'P6\n{w_val} {h_val}\n255\n'.encode())
                    f.write(bytes(rgb))
                print(f'  -> Saved {out}')
        except Exception as ex:
            print(f'  Error: {ex}')
    
    idx = e + 10

print(f'\nTotal CMYK images extracted: {count}')
