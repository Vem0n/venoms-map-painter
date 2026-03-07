/**
 * WebGL2 Shaders for tile-based map rendering.
 * 
 * Simple textured quad rendering — each tile is drawn as a quad
 * with its texture. The vertex shader handles positioning based
 * on camera offset and zoom.
 */

/** Vertex shader: positions a tile quad in screen space using camera transform */
export const TILE_VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-tile uniforms
uniform vec2 u_tilePosition;  // Top-left corner in global coords
uniform vec2 u_tileSize;      // Tile dimensions (512, 512)

// Camera uniforms
uniform vec2 u_cameraOffset;  // Camera pan offset
uniform float u_zoom;         // Camera zoom level
uniform vec2 u_resolution;    // Canvas resolution

// Quad vertex (0,0), (1,0), (0,1), (1,1)
in vec2 a_position;

out vec2 v_texCoord;

void main() {
    v_texCoord = a_position;
    
    // Tile position in global space
    vec2 worldPos = u_tilePosition + a_position * u_tileSize;
    
    // Apply camera transform
    vec2 screenPos = (worldPos - u_cameraOffset) * u_zoom;
    
    // Convert to clip space (-1 to 1)
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y; // Flip Y (screen coords → GL coords)
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

/** Fragment shader: samples the tile texture, optionally blends overlay + heightmap + grid */
export const TILE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_tileTexture;
uniform sampler2D u_overlayTexture;
uniform sampler2D u_heightmapTexture;
uniform bool u_showGrid;
uniform bool u_showOverlay;
uniform bool u_showHeightmap;
uniform float u_heightmapOpacity;
uniform vec2 u_tileSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    fragColor = texture(u_tileTexture, v_texCoord);

    // Heightmap overlay — blends below the voronoi overlay so boundaries stay visible
    if (u_showHeightmap) {
        vec4 hm = texture(u_heightmapTexture, v_texCoord);
        fragColor = mix(fragColor, hm, u_heightmapOpacity);
    }

    // Overlay blending (Voronoi preview boundaries)
    if (u_showOverlay) {
        vec4 overlay = texture(u_overlayTexture, v_texCoord);
        if (overlay.a > 0.0) {
            fragColor = mix(fragColor, overlay, overlay.a);
        }
    }

    if (u_showGrid) {
        // Draw a 1-pixel border at tile edges
        vec2 pixelPos = v_texCoord * u_tileSize;
        float border = 1.0;
        if (pixelPos.x < border || pixelPos.x > u_tileSize.x - border ||
            pixelPos.y < border || pixelPos.y > u_tileSize.y - border) {
            fragColor = mix(fragColor, vec4(1.0, 1.0, 0.0, 1.0), 0.7);
        }
    }
}
`;

/** Vertex shader for the paste preview quad — same camera transform as tiles */
export const PASTE_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_pastePosition;  // Top-left corner in global map coords
uniform vec2 u_pasteSize;      // Width/height in pixels

uniform vec2 u_cameraOffset;
uniform float u_zoom;
uniform vec2 u_resolution;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = a_position;
    vec2 worldPos = u_pastePosition + a_position * u_pasteSize;
    vec2 screenPos = (worldPos - u_cameraOffset) * u_zoom;
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y;
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

/** Fragment shader for the paste preview — samples texture, discards transparent */
export const PASTE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_pasteTexture;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    vec4 color = texture(u_pasteTexture, v_texCoord);
    if (color.a < 0.01) discard;
    // Slight transparency so user can see what's underneath
    fragColor = vec4(color.rgb, 0.85);
}
`;

/**
 * Compile a shader from source.
 */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }

  return shader;
}

/**
 * Create and link a shader program from vertex and fragment shaders.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  // Force a_position to location 0 so all programs share the same VAO
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  // Clean up individual shaders (they're now part of the program)
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}
