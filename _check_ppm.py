# Check PPM headers
for page in range(1, 9):
    path = f'c:\\projetos_devs\\painelsorriso53\\_page_{page}.ppm'
    with open(path, 'rb') as f:
        header = f.read(200)
    # Find newlines to parse PPM header
    parts = header.split(b'\n')
    print(f'Image {page}: magic={parts[0]}, dims={parts[1]}, maxval={parts[2]}')
    print(f'  Full header: {parts[:4]}')
