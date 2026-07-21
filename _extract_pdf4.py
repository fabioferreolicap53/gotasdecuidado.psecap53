import re, zlib, struct

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find all image streams with their metadata
# Pattern: image object definition followed by stream
pattern = rb'/Subtype/Image.*?>>\s*stream\s(.+?)\s*endstream'
images = []
for m in re.finditer(pattern, data, re.DOTALL):
    raw = m.group(1).rstrip(b'\r\n')
    ctx = data[max(0,m.start()-300):m.start()]
    # Extract dimensions
    w = re.search(rb'/Width\s*(\d+)', ctx)
    h = re.search(rb'/Height\s*(\d+)', ctx)
    cs = re.search(rb'/ColorSpace\s*/(\w+)', ctx)
    w_val = int(w.group(1)) if w else 0
    h_val = int(h.group(1)) if h else 0
    cs_val = cs.group(1).decode() if cs else 'unknown'
    images.append((raw, w_val, h_val, cs_val, m.start()))

print(f'Found {len(images)} images:')
for i, (raw, w, h, cs, pos) in enumerate(images):
    print(f'  Image {i+1}: offset={pos}, {w}x{h}, {cs}, stream={len(raw)} bytes ({len(raw)/1024:.0f} KB)')

# Extract and save each image as PPM (simple format)
for i, (raw, w, h, cs, pos) in enumerate(images):
    try:
        decompressed = zlib.decompress(raw)
        print(f'\nImage {i+1}: decompressed to {len(decompressed)} bytes, expected {w*h*4 if cs=="DeviceCMYK" else w*h*3} bytes')
        
        if cs == 'DeviceCMYK':
            # CMYK to RGB conversion
            pixels = bytearray()
            for j in range(0, len(decompressed), 4):
                if j+3 < len(decompressed):
                    c, m, y, k = decompressed[j], decompressed[j+1], decompressed[j+2], decompressed[j+3]
                    # Simple CMYK to RGB
                    r = int(255 * (1 - c/255) * (1 - k/255))
                    g = int(255 * (1 - m/255) * (1 - k/255))
                    b = int(255 * (1 - y/255) * (1 - k/255))
                    pixels.extend([max(0,min(255,r)), max(0,min(255,g)), max(0,min(255,b))])
            
            outpath = f'c:\\projetos_devs\\painelsorriso53\\_page_{i+1}.ppm'
            with open(outpath, 'wb') as f:
                f.write(f'P6\n{w} {h}\n255\n'.encode())
                f.write(bytes(pixels))
            print(f'  Saved: {outpath}')
    except Exception as e:
        print(f'Image {i+1}: ERROR - {e}')
