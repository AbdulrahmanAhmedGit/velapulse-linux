import struct,zlib,math
from pathlib import Path
w=h=512
rows=[]
for y in range(h):
 row=bytearray()
 for x in range(w):
  a=math.exp(-((x-170)**2+(y-150)**2)/40000);b=math.exp(-((x-350)**2+(y-330)**2)/30000)
  row.extend((int(22+160*a+30*b),int(26+66*a+85*b),int(52+125*a+90*b)))
 rows.append(b'\0'+row)
def chunk(t,data):return struct.pack('>I',len(data))+t+data+struct.pack('>I',zlib.crc32(t+data)&0xffffffff)
Path(__file__).with_name('music-cover.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
