data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Look for JPEG markers
jpeg_starts = []
i = 0
while True:
    idx = data.find(b'\xff\xd8\xff', i)
    if idx == -1:
        break
    jpeg_starts.append(idx)
    i = idx + 1

print(f'JPEG images found: {len(jpeg_starts)}')
for idx in jpeg_starts:
    # Find JPEG end marker
    end = data.find(b'\xff\xd9', idx)
    if end != -1:
        size = end + 2 - idx
        print(f'  JPEG at offset {idx}, size {size} bytes ({size/1024:.1f} KB)')
        # Save first JPEG
        if len(jpeg_starts) <= 2:
            out = f'c:\\projetos_devs\\painelsorriso53\\_page_{jpeg_starts.index(idx)+1}.jpg'
            open(out, 'wb').write(data[idx:end+2])
            print(f'  -> Saved to {out}')

# Look for PNG markers
png_starts = []
i = 0
while True:
    idx = data.find(b'\x89PNG\r\n\x1a\n', i)
    if idx == -1:
        break
    png_starts.append(idx)
    i = idx + 1

print(f'PNG images found: {len(png_starts)}')
for idx in png_starts:
    print(f'  PNG at offset {idx}')

# Try to find /XObject which indicates images
import re
xobjs = [(m.start(), data[m.start():m.start()+200]) for m in re.finditer(rb'/XObject', data)]
print(f'\nXObject references: {len(xobjs)}')
for off, ctx in xobjs[:5]:
    print(f'  at {off}: {ctx[:100]}')
