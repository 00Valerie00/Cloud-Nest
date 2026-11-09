const CONTINENTS = [
  [[-168, 72], [-150, 60], [-137, 57], [-130, 50], [-124, 48], [-124, 40], [-117, 32], [-108, 30], [-105, 23], [-97, 18], [-91, 16], [-85, 9], [-81, 9], [-78, 24], [-73, 32], [-66, 44], [-57, 50], [-60, 57], [-76, 62], [-90, 70], [-112, 74], [-140, 73]],
  [[-81, 12], [-72, 10], [-61, 8], [-50, 0], [-47, -14], [-51, -25], [-59, -34], [-66, -42], [-70, -55], [-75, -43], [-74, -28], [-79, -10]],
  [[-53, 82], [-42, 78], [-30, 71], [-37, 61], [-48, 59], [-58, 65]],
  [[-11, 36], [-4, 44], [5, 46], [8, 55], [20, 60], [31, 59], [41, 67], [58, 70], [75, 76], [100, 75], [119, 68], [138, 61], [157, 59], [174, 52], [164, 44], [146, 42], [137, 34], [123, 30], [116, 22], [108, 16], [101, 8], [90, 8], [80, 18], [69, 23], [57, 25], [49, 37], [39, 40], [31, 45], [18, 39], [10, 42], [0, 39], [-11, 36]],
  [[-17, 36], [1, 38], [18, 34], [31, 30], [36, 18], [42, 11], [40, 1], [35, -10], [31, -22], [24, -34], [15, -35], [9, -26], [1, -17], [-7, -5], [-14, 8], [-16, 22]],
  [[67, 25], [74, 31], [84, 27], [90, 21], [88, 8], [81, 5], [76, 9], [72, 19]],
  [[42, 31], [55, 27], [57, 17], [50, 12], [43, 17]],
  [[112, -11], [129, -10], [145, -15], [154, -25], [146, -38], [132, -43], [116, -35], [113, -24]],
  [[130, 33], [136, 36], [142, 43], [146, 42], [143, 35], [137, 31]],
  [[-180, -66], [-135, -70], [-90, -68], [-45, -72], [0, -69], [45, -73], [90, -68], [135, -72], [180, -66], [180, -90], [-180, -90]]
]

const SPHERE_VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform vec2 u_rotation;
uniform vec2 u_view;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  float cy = cos(u_rotation.x);
  float sy = sin(u_rotation.x);
  float cp = cos(u_rotation.y);
  float sp = sin(u_rotation.y);
  float x = cy * a_position.x + sy * a_position.z;
  float z = -sy * a_position.x + cy * a_position.z;
  float y = cp * a_position.y - sp * z;
  z = sp * a_position.y + cp * z;
  v_normal = vec3(x, y, z);
  v_uv = a_uv;
  gl_Position = vec4(x * u_view.x, y * u_view.y, -z * 0.54, 1.0);
}`

const SPHERE_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  vec3 n = normalize(v_normal);
  vec2 texel = vec2(0.0024, 0.0048);
  vec3 sharpSource = texture2D(u_texture, v_uv).rgb;
  vec3 softSource = sharpSource * 0.4;
  softSource += texture2D(u_texture, v_uv + vec2(texel.x, 0.0)).rgb * 0.15;
  softSource += texture2D(u_texture, v_uv - vec2(texel.x, 0.0)).rgb * 0.15;
  softSource += texture2D(u_texture, v_uv + vec2(0.0, texel.y)).rgb * 0.15;
  softSource += texture2D(u_texture, v_uv - vec2(0.0, texel.y)).rgb * 0.15;
  vec3 source = mix(sharpSource, softSource, 0.44);
  float luminance = dot(source, vec3(0.299, 0.587, 0.114));
  float land = smoothstep(-0.04, 0.13, source.g - source.b) * (1.0 - smoothstep(0.58, 0.84, luminance));
  vec3 softBase = mix(vec3(0.22, 0.40, 0.53), source, 0.56);
  vec3 paleLand = vec3(0.43, 0.68, 0.63);
  vec3 earth = mix(softBase, paleLand, land * 0.48);
  earth = mix(earth, vec3(0.32, 0.50, 0.62), 0.18);
  float light = 0.88 + max(dot(n, normalize(vec3(-0.42, 0.34, 0.9))), 0.0) * 0.15;
  float limb = 1.0 - max(n.z, 0.0);
  float atmosphere = pow(limb, 1.8);
  float innerGlow = exp(-limb * 8.0);
  vec3 color = earth * light;
  color += vec3(0.12, 0.43, 0.70) * atmosphere * 0.46;
  color += vec3(0.08, 0.34, 0.58) * innerGlow * 0.10;
  gl_FragColor = vec4(color, 1.0);
}`

const POINT_VERTEX_SHADER = `
attribute vec3 a_position;
attribute float a_count;
uniform vec2 u_rotation;
uniform vec2 u_view;
uniform float u_pixel_ratio;
varying float v_count;
void main() {
  float cy = cos(u_rotation.x);
  float sy = sin(u_rotation.x);
  float cp = cos(u_rotation.y);
  float sp = sin(u_rotation.y);
  float x = cy * a_position.x + sy * a_position.z;
  float z = -sy * a_position.x + cy * a_position.z;
  float y = cp * a_position.y - sp * z;
  z = sp * a_position.y + cp * z;
  v_count = a_count;
  gl_Position = vec4(x * u_view.x, y * u_view.y, -z * 0.54 - 0.008, 1.0);
  gl_PointSize = (16.0 + min(a_count, 24.0) * 0.28) * u_pixel_ratio;
}`

const POINT_FRAGMENT_SHADER = `
precision mediump float;
varying float v_count;
void main() {
  float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (radius > 1.0) discard;
  float crowd = clamp(v_count / 24.0, 0.0, 1.0);
  float core = 1.0 - smoothstep(0.04, 0.30, radius);
  float glow = exp(-radius * 4.8) * mix(0.52, 0.78, crowd);
  vec3 halo = mix(vec3(0.15, 0.68, 1.0), vec3(0.51, 0.61, 1.0), crowd * 0.58);
  vec3 color = mix(halo, vec3(0.96, 0.99, 1.0), core);
  gl_FragColor = vec4(color, max(core, glow));
}`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'shader_compile_failed'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program_link_failed')
  return program
}

function pointInPolygon(lon, lat, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const crosses = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 0.000001) + xi)
    if (crosses) inside = !inside
  }
  return inside
}

function makeProceduralEarthTexture(gl) {
  const width = 512
  const height = 256
  const mask = new Uint8Array(width * height)
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const lat = -90 + (y / (height - 1)) * 180
    for (let x = 0; x < width; x++) {
      const lon = -180 + (x / (width - 1)) * 360
      let land = false
      for (let p = 0; p < CONTINENTS.length && !land; p++) land = pointInPolygon(lon, lat, CONTINENTS[p])
      mask[y * width + x] = land ? 1 : 0
    }
  }
  for (let y = 0; y < height; y++) {
    const lat = -90 + (y / (height - 1)) * 180
    const latitudeShade = Math.max(0, 1 - Math.abs(lat) / 105)
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const lon = -180 + (x / (width - 1)) * 360
      const land = mask[index] === 1
      const edge = land && (
        !mask[y * width + Math.max(0, x - 1)] ||
        !mask[y * width + Math.min(width - 1, x + 1)] ||
        !mask[Math.max(0, y - 1) * width + x] ||
        !mask[Math.min(height - 1, y + 1) * width + x]
      )
      const grid = Math.abs((lat + 90) % 15) < 0.35 || Math.abs((lon + 180) % 15) < 0.35
      const grain = ((x * 17 + y * 31) % 13) - 6
      let r = land ? 21 + latitudeShade * 9 : 5 + latitudeShade * 5
      let g = land ? 83 + latitudeShade * 22 : 27 + latitudeShade * 15
      let b = land ? 96 + latitudeShade * 23 : 50 + latitudeShade * 18
      if (edge) { r += 20; g += 47; b += 42 }
      if (grid) { r += land ? -3 : 4; g += land ? 6 : 11; b += land ? 6 : 17 }
      r += grain; g += grain; b += grain
      const offset = index * 4
      pixels[offset] = Math.max(0, Math.min(255, r))
      pixels[offset + 1] = Math.max(0, Math.min(255, g))
      pixels[offset + 2] = Math.max(0, Math.min(255, b))
      pixels[offset + 3] = 255
    }
  }
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  return texture
}

function makeEarthTexture(gl, canvas, onReady) {
  const state = { texture: gl.createTexture(), image: null, disposed: false }
  gl.bindTexture(gl.TEXTURE_2D, state.texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([15, 45, 68, 255]))

  const image = canvas.createImage()
  state.image = image
  image.onload = () => {
    if (state.disposed) return
    gl.bindTexture(gl.TEXTURE_2D, state.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    if (anisotropic) {
      const maxAnisotropy = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1
      gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(6, maxAnisotropy))
    }
    if (onReady) onReady()
  }
  image.onerror = () => {
    if (state.disposed) return
    gl.deleteTexture(state.texture)
    state.texture = makeProceduralEarthTexture(gl)
    if (onReady) onReady()
  }
  image.src = '/assets/earthmap.jpg'
  return state
}

function makeSphereMesh() {
  const latitudeSegments = 96
  const longitudeSegments = 192
  const vertices = []
  for (let latIndex = 0; latIndex <= latitudeSegments; latIndex++) {
    const lat = -Math.PI / 2 + (latIndex / latitudeSegments) * Math.PI
    const cosLat = Math.cos(lat)
    for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex++) {
      const lon = -Math.PI + (lonIndex / longitudeSegments) * Math.PI * 2
      const x = cosLat * Math.sin(lon)
      const y = Math.sin(lat)
      const z = cosLat * Math.cos(lon)
      const u = (lonIndex / longitudeSegments)
      const v = (latIndex / latitudeSegments)
      vertices.push(x, y, z, u, v)
    }
  }
  const indices = []
  for (let latIndex = 0; latIndex < latitudeSegments; latIndex++) {
    for (let lonIndex = 0; lonIndex < longitudeSegments; lonIndex++) {
      const first = latIndex * (longitudeSegments + 1) + lonIndex
      const second = first + longitudeSegments + 1
      indices.push(first, second, first + 1, second, second + 1, first + 1)
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) }
}

function toSpherePoint(city) {
  const lat = city.lat * Math.PI / 180
  const lon = city.lon * Math.PI / 180
  const cosLat = Math.cos(lat)
  return [cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon)]
}

function rotate(point, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const x = cy * point[0] + sy * point[2]
  const z = -sy * point[0] + cy * point[2]
  const y = cp * point[1] - sp * z
  return [x, y, sp * point[1] + cp * z]
}

function createGlobe(canvas, options = {}) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true })
  if (!gl) throw new Error('webgl_unavailable')

  const sphereProgram = createProgram(gl, SPHERE_VERTEX_SHADER, SPHERE_FRAGMENT_SHADER)
  const pointProgram = createProgram(gl, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER)
  const mesh = makeSphereMesh()
  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)
  const indexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
  const pointBuffer = gl.createBuffer()

  const sphereLocations = {
    position: gl.getAttribLocation(sphereProgram, 'a_position'),
    uv: gl.getAttribLocation(sphereProgram, 'a_uv'),
    rotation: gl.getUniformLocation(sphereProgram, 'u_rotation'),
    view: gl.getUniformLocation(sphereProgram, 'u_view'),
    texture: gl.getUniformLocation(sphereProgram, 'u_texture')
  }
  const pointLocations = {
    position: gl.getAttribLocation(pointProgram, 'a_position'),
    count: gl.getAttribLocation(pointProgram, 'a_count'),
    rotation: gl.getUniformLocation(pointProgram, 'u_rotation'),
    view: gl.getUniformLocation(pointProgram, 'u_view'),
    pixelRatio: gl.getUniformLocation(pointProgram, 'u_pixel_ratio')
  }
  const pixelRatio = options.pixelRatio || 1
  const state = {
    yaw: -105 * Math.PI / 180,
    pitch: 0.08,
    markers: [],
    autoRotate: true,
    zoom: 1,
    timer: null,
    width: canvas.width,
    height: canvas.height
  }
  const textureState = makeEarthTexture(gl, canvas, () => draw())

  function updateCanvasSize() {
    state.width = canvas.width
    state.height = canvas.height
    gl.viewport(0, 0, state.width, state.height)
  }

  function updateMarkers() {
    const values = []
    state.markers.forEach(marker => {
      const point = toSpherePoint(marker)
      values.push(point[0], point[1], point[2], Math.max(3, marker.count || 3))
    })
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.DYNAMIC_DRAW)
  }

  function draw() {
    updateCanvasSize()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    const minSize = Math.min(state.width, state.height)
    const viewX = minSize / state.width * 0.91 * state.zoom
    const viewY = minSize / state.height * 0.91 * state.zoom
    gl.useProgram(sphereProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(sphereLocations.position)
    gl.vertexAttribPointer(sphereLocations.position, 3, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(sphereLocations.uv)
    gl.vertexAttribPointer(sphereLocations.uv, 2, gl.FLOAT, false, 20, 12)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.uniform2f(sphereLocations.rotation, state.yaw, state.pitch)
    gl.uniform2f(sphereLocations.view, viewX, viewY)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, textureState.texture)
    gl.uniform1i(sphereLocations.texture, 0)
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0)

    if (state.markers.length) {
      gl.useProgram(pointProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer)
      gl.enableVertexAttribArray(pointLocations.position)
      gl.vertexAttribPointer(pointLocations.position, 3, gl.FLOAT, false, 16, 0)
      gl.enableVertexAttribArray(pointLocations.count)
      gl.vertexAttribPointer(pointLocations.count, 1, gl.FLOAT, false, 16, 12)
      gl.uniform2f(pointLocations.rotation, state.yaw, state.pitch)
      gl.uniform2f(pointLocations.view, viewX, viewY)
      gl.uniform1f(pointLocations.pixelRatio, pixelRatio)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      gl.drawArrays(gl.POINTS, 0, state.markers.length)
      gl.disable(gl.BLEND)
    }
  }

  function setMarkers(markers) {
    state.markers = (markers || []).filter(marker => Number.isFinite(marker.lat) && Number.isFinite(marker.lon))
    updateMarkers()
    draw()
  }

  function dragBy(dx, dy) {
    const span = Math.max(1, Math.min(state.width, state.height))
    state.yaw += dx / span * 3.2
    state.pitch = Math.max(-1.12, Math.min(1.12, state.pitch + dy / span * 2.2))
    draw()
  }

  function pickCity(x, y) {
    const minSize = Math.min(state.width, state.height)
    const cx = state.width / 2
    const cy = state.height / 2
    const hitRadius = 20 * pixelRatio
    let closest = null
    let closestDistance = hitRadius * hitRadius
    state.markers.forEach(marker => {
      const rotated = rotate(toSpherePoint(marker), state.yaw, state.pitch)
      if (rotated[2] <= 0.03) return
      const px = cx + rotated[0] * 0.91 * state.zoom * minSize / 2
      const py = cy - rotated[1] * 0.91 * state.zoom * minSize / 2
      const distance = (px - x) * (px - x) + (py - y) * (py - y)
      if (distance < closestDistance) {
        closest = marker
        closestDistance = distance
      }
    })
    return closest
  }

  function setAutoRotate(enabled) { state.autoRotate = !!enabled }
  function zoomBy(factor) {
    const multiplier = Number(factor)
    if (!Number.isFinite(multiplier) || multiplier <= 0) return state.zoom
    state.zoom = Math.max(0.72, Math.min(1.62, state.zoom * multiplier))
    draw()
    return state.zoom
  }
  function reset() { state.yaw = -105 * Math.PI / 180; state.pitch = 0.08; state.zoom = 1; draw() }
  function start() {
    if (state.timer) return
    state.timer = setInterval(() => {
      if (state.autoRotate) state.yaw += 0.0016
      draw()
    }, 40)
  }
  function stop() {
    if (state.timer) clearInterval(state.timer)
    state.timer = null
  }
  function destroy() {
    stop()
    textureState.disposed = true
    if (textureState.image) {
      textureState.image.onload = null
      textureState.image.onerror = null
    }
    gl.deleteTexture(textureState.texture)
    gl.deleteBuffer(vertexBuffer)
    gl.deleteBuffer(indexBuffer)
    gl.deleteBuffer(pointBuffer)
    gl.deleteProgram(sphereProgram)
    gl.deleteProgram(pointProgram)
  }

  updateMarkers()
  draw()
  return { setMarkers, dragBy, pickCity, setAutoRotate, zoomBy, reset, start, stop, destroy }
}

module.exports = { createGlobe }
