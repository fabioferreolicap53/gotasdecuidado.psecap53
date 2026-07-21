import re

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find all image-defining objects
for m in re.finditer(rb'(\d+ \d+ obj.*?Subtype/Image.*?endobj)', data, re.DOTALL):
    block = m.group(1).decode('latin-1', errors='replace')
    # Extract key fields
    for line in block.split('\n'):
        line = line.strip()
        if any(x in line for x in ['/Filter', '/Width', '/Height', '/ColorSpace', '/Length', '/Subtype']):
            print(f'  {line}')
    print('---')
