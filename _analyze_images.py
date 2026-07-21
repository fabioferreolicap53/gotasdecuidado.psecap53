# Quick analysis of extracted PPM images
import struct

for page in range(1, 9):
    path = f'c:\\projetos_devs\\painelsorriso53\\_page_{page}.ppm'
    with open(path, 'rb') as f:
        header = f.readline().strip()  # P6
        dims = f.readline().strip()    # width height
        maxval = f.readline().strip()  # 255
        w, h = map(int, dims.split())
        data = f.read()
    
    # Sample pixels at various positions
    stride = w * 3
    # Check center pixel
    cx, cy = w // 2, h // 2
    offset = cy * stride + cx * 3
    center_rgb = data[offset], data[offset+1], data[offset+2]
    
    # Check top-left corner
    tl_rgb = data[0], data[1], data[2]
    
    # Check bottom-right
    br_offset = (h-1) * stride + (w-1) * 3
    br_rgb = data[br_offset], data[br_offset+1], data[br_offset+2]
    
    # Count non-white pixels (rough density check)
    non_white = sum(1 for i in range(0, len(data), 30) if not (data[i] > 240 and data[i+1] > 240 and data[i+2] > 240))
    total_sampled = len(range(0, len(data), 30))
    
    print(f'Image {page}: {w}x{h}')
    print(f'  TL={tl_rgb} Center={center_rgb} BR={br_rgb}')
    print(f'  Content density: {non_white}/{total_sampled} ({100*non_white/total_sampled:.0f}%)')
    print()
