import re, zlib

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()
print(f'Size: {len(data)} bytes')
print(f'Pages: {data.count(b"/Type /Page")}')

# Extract text between parentheses in PDF
texts = re.findall(rb'\(([^)]*)\)', data)
for t in texts:
    try:
        decoded = t.decode('latin-1').strip()
        if len(decoded) > 3 and all(c.isprintable() or c in ' \n\r\t' for c in decoded):
            print(decoded)
    except:
        pass

# Check for image streams
img_starts = [m.start() for m in re.finditer(rb'/SubType\s*/Image', data)]
print(f'\nImages found: {len(img_starts)}')

# Try to find any readable text blocks  
text_blocks = re.findall(rb'Tj|TJ|Td|Tm|BT|ET', data)
print(f'Text operators: {len(text_blocks)}')
