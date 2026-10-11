"""Recreate the simple vector-style extension icons using only Python's standard library."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / "assets" / "icons"
ROOT.mkdir(parents=True, exist_ok=True)

def line(x, y, ax, ay, bx, by, width):
    dx, dy = bx-ax, by-ay
    t = max(0, min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
    return (x-ax-t*dx)**2+(y-ay-t*dy)**2 < width*width

def color(x, y):
    # Rounded teal tile, a prompt chevron and a small optimization spark.
    cx, cy = max(.19, min(.81, x)), max(.19, min(.81, y))
    if (x-cx)**2+(y-cy)**2 > .16**2:
        return (0, 0, 0, 0)
    white = (240, 255, 250, 255)
    if line(x,y,.25,.35,.43,.50,.036) or line(x,y,.43,.50,.25,.65,.036):
        return white
    if line(x,y,.49,.65,.69,.65,.03):
        return white
    if abs(x-.69)/.115 + abs(y-.33)/.145 < 1:
        return (169, 233, 202, 255)
    return (25, 94, 80, 255)

def chunk(kind, data):
    return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)

for size in (16,32,48,128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [color((x+(sx+.5)/4)/size,(y+(sy+.5)/4)/size) for sy in range(4) for sx in range(4)]
            rows.extend(round(sum(c[k] for c in samples)/16) for k in range(4))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR",struct.pack(">IIBBBBB",size,size,8,6,0,0,0))
    png += chunk(b"IDAT",zlib.compress(bytes(rows),9))+chunk(b"IEND",b"")
    (ROOT/f"icon{size}.png").write_bytes(png)
print("Generated 16, 32, 48, 128px icons.")
