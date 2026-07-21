import re

data = open(r'c:\projetos_devs\painelsorriso53\BASE.pdf', 'rb').read()

# Find stream objects with their lengths
# Look for stream...endstream patterns
streams = []
for m in re.finditer(rb'stream\s(.+?)\s*endstream', data, re.DOTALL):
    raw = m.group(1).rstrip(b'\r\n')
    streams.append((m.start(), len(raw)))
    
print(f'Total streams: {len(streams)}')

# Find pages
for m in re.finditer(rb'/Type\s*/Page[^>]*?/TrimBox', data):
    ctx = m.group()[:300]
    print(f'\nPage at {m.start()}:')
    print(f'  {ctx[:200]}')

# Look for image objects - find what comes before each stream
for i, (start, length) in enumerate(streams[:8]):
    # Get context before stream
    before = data[max(0,start-200):start]
    print(f'\nStream {i} at {start}, length {length} bytes ({length/1024:.1f} KB):')
    # Extract the object definition before stream
    obj_match = re.search(rb'(\d+ \d+ obj.*?)stream', data[max(0,start-500):start+50], re.DOTALL)
    if obj_match:
        ctx = obj_match.group(1)[:300]
        print(f'  Context: {ctx[:200]}')
    
    # Check if it could be an image (stream starts after /Image or /XObject)
    near = data[max(0,start-300):start]
    if b'/Image' in near or b'/XObject' in near:
        print(f'  ** LIKELY IMAGE **')
