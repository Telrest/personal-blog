"""Structural validation of the adapted, locally served CC0 GLB. Stdlib only."""
import json
import math
from pathlib import Path
import struct
import sys

path = Path(sys.argv[1])
data = path.read_bytes()
magic, version, total = struct.unpack_from('<III', data)
assert magic == 0x46546c67 and version == 2 and total == len(data)
size = struct.unpack_from('<I', data, 12)[0]
g = json.loads(data[20:20 + size])
b = data[28 + size:]
assert sorted(n['name'] for n in g['nodes']) == ['fan', 'hpc', 'hpt', 'lpc', 'lpt']
assert g['extras']['license'] == 'CC0-1.0'
assert g['extras']['removedShaftTriangles'] > 0
triangles = 0
for mesh in g['meshes']:
    for primitive in mesh['primitives']:
        count = g['accessors'][primitive['attributes']['POSITION']]['count']
        a = g['accessors'][primitive['indices']]
        v = g['bufferViews'][a['bufferView']]
        ids = struct.unpack_from('<' + 'I' * a['count'], b, v.get('byteOffset', 0))
        assert a['count'] % 3 == 0 and min(ids) >= 0 and max(ids) < count
        triangles += len(ids) // 3
        for key in ['POSITION', 'NORMAL', 'TEXCOORD_0']:
            a = g['accessors'][primitive['attributes'][key]]
            v = g['bufferViews'][a['bufferView']]
            floats = struct.unpack_from('<' + 'f' * (v['byteLength'] // 4), b, v.get('byteOffset', 0))
            assert all(math.isfinite(f) for f in floats)
assert triangles == sum(g['extras']['triangles'].values())
for image in g['images']:
    v = g['bufferViews'][image['bufferView']]
    assert v['byteOffset'] + v['byteLength'] <= len(b)
print(json.dumps({'valid': True, 'bytes': len(data), 'triangles': triangles, 'rotorGroups': len(g['nodes']), 'license': g['extras']['license']}))
