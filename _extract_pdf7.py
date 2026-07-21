import re, zlib

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find image definitions and extract their stream data using /Length
# Pattern: match image object with /Length NNN, then find the stream after it
for obj_match in re.finditer(rb'(/Subtype/Image.*?/Length\s*(\d+).*?)>>\s*stream\s*', data, re.DOTALL):
    length = int(obj_match.group(2))
    header = obj_match.group(1)
    
    # The stream data starts right after "stream\n" or "stream\r\n"  
    stream_start = obj_match.end()  # end of the regex match is right after "stream"
    
    if data[stream_start:stream_start+1] == b'\r':
        stream_start += 1
    if data[stream_start:stream_start+1] == b'\n':
        stream_start += 1
    
    raw_stream = data[stream_start:stream_start+length]
    
    # Extract metadata
    w = int(re.search(rb'/Width\s*(\d+)', header).group(1))
    h = int(re.search(rb'/Height\s*(\d+)', header).group(1))
    
    print(f'Image: {w}x{h}, /Length={length}, actual_stream={len(raw_stream)} bytes')
    
    try:
        decomp = zlib.decompress(raw_stream)
        expected = w * h * 4
        print(f'  Decompressed: {len(decomp)} bytes (expected {expected})')
        
        if len(decomp) >= expected:
            rgb = bytearray()
            for j in range(0, expected, 4):
                c, m, y, k = decomp[j], decomp[j+1], decomp[j+2], decomp[j+3]
                r = int(255 * (1 - c/255) * (1 - k/255))
                g = int(255 * (1 - m/255) * (1 - k/255))
                b_val = int(255 * (1 - y/255) * (1 - k/255))
                rgb.extend([max(0,min(255,r)), max(0,min(255,g)), max(0,min(255,b_val))])
            
            out = f'c:\\projetos_devs\\painelsorriso53\\_page_{w}x{h}.ppm'
            with open(out, 'wb') as f:
                f.write(f'P6\n{w} {h}\n255\n'.encode())
                f.write(bytes(rgb))
            print(f'  -> Saved {out}')
        else:
            print(f'  Data too short: {len(decomp)} < {expected}')
    except Exception as ex:
        print(f'  Decompress error: {ex}')
        # Try with different offsets
        for offset in range(-5, 6):
            try:
                chunk = raw_stream[offset:] if offset >= 0 else data[stream_start+offset:stream_start+length+offset]
                test = zlib.decompress(chunk[:length])
                print(f'  Worked with offset {offset}!')
                break
            except:
                pass
