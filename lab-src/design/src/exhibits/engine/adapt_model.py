"""Adapt Grab3D CC0 rotor mesh into independently driven LP / HP assemblies.

Usage: python adapt_model.py original.glb output.glb
Retains source UVs and PBR textures. Removes the illustrative common shaft;
the application supplies a nested pair of shafts. Coordinates: airflow +X,
Y up, rotor axis at Y=Z=0. No external Python dependencies.
"""
import collections
import copy
import json
import math
from pathlib import Path
import struct
import sys

source = Path(sys.argv[1]).read_bytes()
length = struct.unpack_from('<I', source, 12)[0]
original = json.loads(source[20:20 + length])
binary = source[28 + length:]

def read_accessor(index):
    a = original['accessors'][index]
    v = original['bufferViews'][a['bufferView']]
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
    stride = v.get('byteStride', struct.calcsize(fmt) * count)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * count, binary, start + i * stride) for i in range(a['count'])]

primitive = original['meshes'][1]['primitives'][0]
positions = read_accessor(primitive['attributes']['POSITION'])
normals = read_accessor(primitive['attributes']['NORMAL'])
uvs = read_accessor(primitive['attributes']['TEXCOORD_0'])
indices = [i[0] for i in read_accessor(primitive['indices'])]
groups = collections.defaultdict(list)
discarded = 0
for k in range(0, len(indices), 3):
    triangle = indices[k:k + 3]
    points = [positions[i] for i in triangle]
    radius = max(math.hypot(p[1], p[2]) for p in points)
    if radius < 0.14:
        discarded += 1
        continue
    x = sum(p[0] for p in points) / 3 + original['nodes'][1]['translation'][0]
    group = 'fan' if x > 0.9 else 'lpc' if x > 0.45 else 'hpc' if x > -0.4 else 'hpt' if x > -0.85 else 'lpt'
    groups[group].extend(triangle)

doc = {'asset': {'version': '2.0', 'generator': 'Design Secrets CC0 rotor adapter'},
       'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
       'accessors': [], 'bufferViews': [], 'buffers': [], 'images': [],
       'textures': [], 'samplers': copy.deepcopy(original['samplers'])}
out = bytearray()

def buffer_view(data, target=None):
    while len(out) % 4:
        out.append(0)
    view = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
    if target:
        view['target'] = target
    doc['bufferViews'].append(view)
    out.extend(data)
    return len(doc['bufferViews']) - 1

def accessor(values, kind, component=5126):
    fmt = 'f' if component == 5126 else 'I'
    size = len(values[0])
    data = struct.pack('<' + fmt * (len(values) * size), *(n for row in values for n in row))
    view = buffer_view(data, 34963 if kind == 'SCALAR' else 34962)
    a = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'VEC3':
        a['min'] = [min(row[i] for row in values) for i in range(3)]
        a['max'] = [max(row[i] for row in values) for i in range(3)]
    doc['accessors'].append(a)
    return len(doc['accessors']) - 1

for name, triangles in groups.items():
    remap = {old: i for i, old in enumerate(dict.fromkeys(triangles))}
    xyz = [(-(positions[i][0] + original['nodes'][1]['translation'][0]), positions[i][1], -positions[i][2]) for i in remap]
    normal = [(-normals[i][0], normals[i][1], -normals[i][2]) for i in remap]
    attrs = {'POSITION': accessor(xyz, 'VEC3'), 'NORMAL': accessor(normal, 'VEC3'),
             'TEXCOORD_0': accessor([uvs[i] for i in remap], 'VEC2')}
    index = accessor([(remap[i],) for i in triangles], 'SCALAR', 5125)
    ni = len(doc['nodes'])
    doc['scenes'][0]['nodes'].append(ni)
    doc['nodes'].append({'name': name, 'mesh': ni})
    doc['meshes'].append({'name': name, 'primitives': [{'attributes': attrs, 'indices': index, 'material': 0}]})

for i in (3, 4, 5):
    image = original['images'][i]
    v = original['bufferViews'][image['bufferView']]
    start = v.get('byteOffset', 0)
    doc['images'].append({'mimeType': image['mimeType'], 'bufferView': buffer_view(binary[start:start + v['byteLength']])})
    doc['textures'].append({'sampler': 0, 'source': len(doc['images']) - 1})
material = copy.deepcopy(original['materials'][1])
material['normalTexture']['index'] = 0
material['pbrMetallicRoughness']['baseColorTexture']['index'] = 1
material['pbrMetallicRoughness']['metallicRoughnessTexture']['index'] = 2
material['doubleSided'] = False
doc['materials'] = [material]
doc['buffers'] = [{'byteLength': len(out)}]
doc['extras'] = {'source': 'https://grab3d.com/models/vehicles/jet-engine/', 'license': 'CC0-1.0',
                 'modifications': 'Rotor mesh split into fan, LPC, HPC, HPT and LPT; common illustrative shaft removed; axis normalized.',
                 'triangles': {name: len(ids) // 3 for name, ids in groups.items()}, 'removedShaftTriangles': discarded}
j = json.dumps(doc, separators=(',', ':')).encode()
j += b' ' * (-len(j) % 4)
out += b'\0' * (-len(out) % 4)
result = struct.pack('<III', 0x46546c67, 2, 28 + len(j) + len(out)) + struct.pack('<II', len(j), 0x4e4f534a) + j + struct.pack('<II', len(out), 0x004e4942) + out
Path(sys.argv[2]).write_bytes(result)
print(json.dumps({'bytes': len(result), **doc['extras']}, ensure_ascii=False))
