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
precision highp sampler3D;

uniform sampler2D u_tileTexture;
uniform sampler2D u_overlayTexture;
uniform sampler2D u_heightmapTexture;
uniform bool u_showGrid;
uniform bool u_showOverlay;
uniform bool u_showHeightmap;
uniform float u_heightmapOpacity;
uniform vec2 u_tileSize;
uniform vec2 u_tilePosition;
uniform vec2 u_mapSize;
uniform float u_zoom;
uniform bool u_showTitle;
uniform vec3 u_titleTint;
uniform sampler3D u_titleColors;
uniform sampler2D u_titleLeft;
uniform sampler2D u_titleRight;
uniform sampler2D u_titleUp;
uniform sampler2D u_titleDown;

in vec2 v_texCoord;
out vec4 fragColor;

// Neighbor textures keep the union outline continuous across tile seams.
bool titleMember(ivec2 pixel) {
    vec2 world = u_tilePosition + vec2(pixel);
    if (any(lessThan(world, vec2(0.0))) || any(greaterThanEqual(world, u_mapSize))) return false;
    ivec2 size = ivec2(u_tileSize);
    vec3 rgb;
    if (pixel.x < 0) rgb = texelFetch(u_titleLeft, pixel + ivec2(size.x, 0), 0).rgb;
    else if (pixel.x >= size.x) rgb = texelFetch(u_titleRight, pixel - ivec2(size.x, 0), 0).rgb;
    else if (pixel.y < 0) rgb = texelFetch(u_titleUp, pixel + ivec2(0, size.y), 0).rgb;
    else if (pixel.y >= size.y) rgb = texelFetch(u_titleDown, pixel - ivec2(0, size.y), 0).rgb;
    else rgb = texelFetch(u_tileTexture, pixel, 0).rgb;
    ivec3 key = ivec3(floor(rgb * 255.0 + 0.5));
    return texelFetch(u_titleColors, key, 0).r > 0.5;
}

bool titleEdge(ivec2 pixel, int radius) {
    return !titleMember(pixel + ivec2(radius, 0)) || !titleMember(pixel - ivec2(radius, 0)) ||
           !titleMember(pixel + ivec2(0, radius)) || !titleMember(pixel - ivec2(0, radius));
}

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

    // Display-only de jure membership; internal province boundaries stay unoutlined.
    if (u_showTitle) {
        ivec2 pixel = ivec2(floor(v_texCoord * u_tileSize));
        if (titleMember(pixel)) {
            int radius = int(clamp(ceil(2.0 / u_zoom), 1.0, 32.0));
            if (titleEdge(pixel, 1) || titleEdge(pixel, radius)) {
                fragColor = vec4(mix(u_titleTint, vec3(1.0), 0.2), 1.0);
            } else {
                fragColor.rgb = mix(fragColor.rgb, u_titleTint, 0.12);
            }
        } else {
            fragColor.rgb *= 0.45;
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
