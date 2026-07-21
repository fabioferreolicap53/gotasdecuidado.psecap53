import re, zlib

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find all objects with image definition followed by stream
# Pattern: Look for object that has /Subtype/Image, capture the stream data
pattern = rb'(\d+ \d+ obj.*?Subtype/Image.*?)stream\s(.+?)\s*endstream'
matches = list(re.finditer(pattern, data, re.DOTALL))

print(f'Found {len(matches)} image objects\n')

for i, m in enumerate(matches):
    header = m.group(1).decode('latin-1', errors='replace')
    raw = m.group(2).rstrip(b'\r\n')
    
    # Extract metadata
    w_match = re.search(r'/Width\s*(\d+)', header)
    h_match = re.search(r'/Height\s*(\d+)', header)
    cs_match = re.search(r'/ColorSpace\s*/(\w+)', header)
    bpc_match = re.search(r'/BitsPerComponent\s*(\d+)', header)
    
    w = int(w_match.group(1)) if w_match else 0
    h = int(h_match.group(1)) if h_match else 0
    cs = cs_match.group(1) if cs_match else 'unknown'
    bpc = int(bpc_match.group(1)) if bpc_match else 0
    
    print(f'Image {i+1}:')
    print(f'  Header: {header[:200]}')
    print(f'  Size: {w}x{h}, ColorSpace: {cs}, BPC: {bpc}')
    print(f'  Stream: {len(raw)} bytes raw')
    
    try:
        decomp = zlib.decompress(raw)
        print(f'  Decompressed: {len(decomp)} bytes')
        
        expected = w * h * (bpc // 8) * (4 if cs == 'DeviceCMYK' else 3 if cs == 'DeviceRGB' else 1)
        print(f'  Expected: {expected} bytes')
        
        if w > 0 and h > 0 and len(decomp) >= expected:
            if cs == 'DeviceCMYK':
                rgb = bytearray()
                for j in range(0, len(decomp), 4):
                    if j+3 < len(decomp):
                        c, m, y, k = decomp[j], decomp[j+1], decomp[j+2], decomp[j+3]
                        r = int(255 * (1 - c/255) * (1 - k/255))
                        g = int(255 * (1 - m/255) * (1 - k/255))
                        b = int(255 * (1 - y/255) * (1 - k/255))
                        rgb.extend([max(0,min(255,r)), max(0,min(255,g)), max(0,min(255,b))])
                out = f'c:\\projetos_devs\\painelsorriso53\\_form_{i+1}.ppm'
                with open(out, 'wb') as f:
                    f.write(f'P6\n{w} {h}\n255\n'.encode())
                    f.write(bytes(rgb))
                print(f'  -> Saved {out}')
    except Exception as e:
        print(f'  Error: {e}')
    print()
