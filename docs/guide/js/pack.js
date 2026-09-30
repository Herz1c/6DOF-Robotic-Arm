// Reads one chapter pack written by cad/scripts/build_web_guide.py.
//
// A pack is an ordinary GLB (glTF 2.0 with KHR_mesh_quantization): one node per
// step group, positions as 16-bit integers scaled by the node, normals as signed
// bytes, and the CAD edges as a second primitive of line segments that shares the
// triangle mesh's position buffer.  The layout is fixed and small, so it is read
// directly instead of pulling in a general glTF loader.

import * as THREE from 'three';

const ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array };
const WIDTH = { SCALAR: 1, VEC3: 3 };

export async function fetchPack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parsePack(await response.arrayBuffer());
}

export function parsePack(buffer) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67) throw new Error('pack is not a GLB');
  const jsonLength = header.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binary = 20 + jsonLength + 8;
  const shared = new Map();

  function attribute(index) {
    if (shared.has(index)) return shared.get(index);
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const Type = ARRAY[accessor.componentType];
    const width = WIDTH[accessor.type];
    const offset = binary + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    let result;
    if (view.byteStride && view.byteStride !== Type.BYTES_PER_ELEMENT * width) {
      const slots = view.byteStride / Type.BYTES_PER_ELEMENT;
      const interleaved = new THREE.InterleavedBuffer(
        new Type(buffer, offset, accessor.count * slots), slots);
      result = new THREE.InterleavedBufferAttribute(interleaved, width, 0, !!accessor.normalized);
    } else {
      result = new THREE.BufferAttribute(
        new Type(buffer, offset, accessor.count * width), width, !!accessor.normalized);
    }
    shared.set(index, result);
    return result;
  }

  const nodes = new Map();
  for (const node of gltf.nodes) {
    const holder = new THREE.Group();
    holder.name = node.name;
    holder.position.fromArray(node.translation || [0, 0, 0]);
    holder.scale.fromArray(node.scale || [1, 1, 1]);
    const entry = { holder, mesh: null, lines: null };
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', attribute(primitive.attributes.POSITION));
      geometry.setIndex(attribute(primitive.indices));
      if (primitive.mode === 1) {
        entry.lines = new THREE.LineSegments(geometry);
        holder.add(entry.lines);
      } else {
        geometry.setAttribute('normal', attribute(primitive.attributes.NORMAL));
        entry.mesh = new THREE.Mesh(geometry);
        holder.add(entry.mesh);
      }
    }
    nodes.set(node.name, entry);
  }
  return nodes;
}
