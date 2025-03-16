// Confused? See https://webgl2fundamentals.org/webgl/lessons/webgl-fundamentals.html.

import { loadImages } from "./LoadImage";

export default class WebGL2CanvasManager {
    constructor(width = 300, height = 300) {
        // Get A WebGL context
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl = this.canvas.getContext("webgl2");
        if (!this.gl) {
            console.error("WebGL2CanvasManager: WebGL2 is not supported.");
            return;
        }
    }
    render(images, width, height, left_edge_x, bottom_edge_y) {
        const gl = this.gl;

        this.resizeCanvas(images[0].width, images[0].height);

        const vertexShaderSource = this.getVertexShaderGLSL();
        const fragmentShaderSource = this.getFragmentShaderGLSL();

        // Use our boilerplate utils to compile the shaders and link into a program
        const shaders = this.setupShaders(vertexShaderSource, fragmentShaderSource);
        this.program = shaders.program;
        const vertexShader = shaders.vertexShader;
        const fragmentShader = shaders.fragmentShader;

        const positionBuffer = this.setupPositionBuffer();
        const texCoordBuffer = this.setupTextureBuffers();

        // provide texture coordinates for the rectangle.
        
        const worldDataImages = images.slice(0, 3);
        const { textures: worldDataTextures, framebuffers } = this.setupTextures(worldDataImages);
        const worldEtmTextureArray = this.setupTextureArray(worldDataImages, null, null, true);

        const elementDataImageAtlas = images[3]; // TODO: keep style consistent
        const getElementDataAtlasBounds = (layerIndex) => {
            return { x: layerIndex, y: 0, width: 1, height: 2 };
        };
        const elementDataTextureArray = this.setupTextureArray(elementDataImageAtlas, getElementDataAtlasBounds, elementDataImageAtlas.width, true);
        // NOTE: assumption that the elementDataImageAtlas is a horizontal strip of 1x1 images. row 1 is the ui overlay color, row 2 is the element texture index (0-255, or invisible if there is none)
        // TODO: does this need to be a texture array?

        const naturalTilesImageAtlas = images[4];
        const NATURAL_TILES_TEXTURE_SIZE = 1024;
        const getNaturalTileAtlasBounds = (layerIndex) => {
            return { x: layerIndex * NATURAL_TILES_TEXTURE_SIZE, y: 0, width: NATURAL_TILES_TEXTURE_SIZE, height: NATURAL_TILES_TEXTURE_SIZE };
        };
        const naturalTilesTextureArray = this.setupTextureArray(naturalTilesImageAtlas, getNaturalTileAtlasBounds, naturalTilesImageAtlas.width/NATURAL_TILES_TEXTURE_SIZE, true);

        // this.resizeCanvasToDisplaySize(); // TODO: is this even relevant in an offscreen context?

        this.resetCanvasState();

        // Tell it to use our program (pair of shaders)
        gl.useProgram(this.program);

        this.setupUniforms();

        this.bindTextureToUnit(worldDataTextures[0], images[0], "u_world_data_image_elementIdx8", 0);
        this.bindTextureToUnit(worldDataTextures[1], images[1], "u_world_data_image_temperature32", 1);
        this.bindTextureToUnit(worldDataTextures[2], images[2], "u_world_data_image_mass32", 2);

        this.bindTextureArrayToUnit(worldEtmTextureArray, "u_world_data_image_array", 3);
        this.bindTextureArrayToUnit(elementDataTextureArray, "u_element_data_image_array", 4);
        this.bindTextureArrayToUnit(naturalTilesTextureArray, "u_natural_tile_image_array", 5);

        // Calling gl.bindFramebuffer with null tells WebGL to render to the canvas instead of one of the framebuffers.
        this.setFramebuffer(null, gl.canvas.width, gl.canvas.height);
      
        
        // Bind the position buffer so gl.bufferData that will be called
        // in setRectangle puts data in the position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        
        // Set a rectangle the same size as the image.
        //this.setRectangle(0, 0, images[0].width * 2, images[0].height * 2);
        //this.setRectangle(0, 0, images[0].width, images[0].height);
        this.setRectangle(left_edge_x, bottom_edge_y, width, height); // TODO

        this.drawScene();

        console.log("Checking WebGL errors at the end of render():", gl.getError()); // TODO: more error reporting
    }

    getVertexShaderGLSL() {
        // Create a vertex and fragment shader program, in GLSL
        const vertexShaderSource = `#version 300 es

// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec2 a_position;
in vec2 a_texCoord;

// Used to pass in the resolution of the canvas
uniform vec2 u_resolution;

// Used to pass the texture coordinates to the fragment shader
out vec2 v_texCoord;

// all shaders have a main function
void main() {

    // convert the position from pixels to 0.0 to 1.0
    vec2 zeroToOne = a_position / u_resolution;

    // convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;

    // convert from 0->2 to -1->+1 (clipspace)
    vec2 clipSpace = zeroToTwo - vec2(1.0, 1.0);

    // gl_Position is a special variable a vertex shader
    // is responsible for setting
    gl_Position = vec4(clipSpace, 0, 1);

    // pass the texCoord to the fragment shader
    // The GPU will interpolate this value between points.
    v_texCoord = a_texCoord;
}
`;
        return vertexShaderSource;
    }

    getFragmentShaderGLSL() {
        const fragmentShaderSource = `#version 300 es
 
// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

// our texture
uniform sampler2D u_world_data_image_elementIdx8;
uniform sampler2D u_world_data_image_temperature32;
uniform sampler2D u_world_data_image_mass32;

precision highp sampler2DArray;
uniform sampler2DArray u_world_data_image_array;
uniform sampler2DArray u_element_data_image_array;
uniform sampler2DArray u_natural_tile_image_array;

// the texCoords passed in from the vertex shader.
in vec2 v_texCoord;

// we need to declare an output for the fragment shader
out vec4 outColor;

struct vec2pixels {
    vec2 pixels;
};

vec4 texture_displacement_in_pixels(sampler2D tex, vec2 uv_texCoord, vec2pixels d_pixels_struct) {
    vec2 d_pixels = d_pixels_struct.pixels; // unpack the struct
    vec2 texCoordPerPixel = vec2(1) / vec2(textureSize(tex, 0));
    vec2 d_texCoord = texCoordPerPixel * d_pixels;
    vec2 uv_displaced_texCoord = uv_texCoord + d_texCoord;
    vec4 color = texture(tex, uv_displaced_texCoord);
    return color;
}

// Function to reconstruct 32-bit float from RGBA
float decodeRGBAtoFloat(vec4 rgba) {
    // Convert 8-bit components (0-255 range) to unsigned integer (0.0 - 1.0 scaled)
    uint r = uint(rgba.r * 255.0);
    uint g = uint(rgba.g * 255.0);
    uint b = uint(rgba.b * 255.0);
    uint a = uint(rgba.a * 255.0);

    // Reconstruct IEEE 754 binary representation
    // uint floatBits = (r << 24) | (g << 16) | (b << 8) | a; // big-endian
    uint floatBits = (a << 24) | (r << 16) | (g << 8) | b; // little-endian

    // Convert bit pattern to float
    return uintBitsToFloat(floatBits);
}

// Interpolates between two colors based on a float value and control points
vec3 interpolateColor(float value, float v1, vec3 c1, float v2, vec3 c2) {
    float t = clamp((value - v1) / (v2 - v1), 0.0, 1.0);
    return mix(c1, c2, t); // Linear interpolation TODO readd
}

// Converts a float into an RGBA color using control points
vec4 floatToRGBA(float value) {
    // Define control points (float value → RGB color)
    const int numPoints = 8;
    float controlValues[numPoints] = float[](0.0, -0.1 + 273.15, 9.9 + 273.15, 19.9 + 273.15, 29.9 + 273.15, 36.9 + 273.15, 99.9 + 273.15, 1799.9 + 273.15);
    vec3 controlColors[numPoints] = vec3[](
        vec3(128.0/255.0, 254.0/255.0, 240.0/255.0),
        vec3(50.0/255.0, 170.0/255.0, 209.0/255.0),
        vec3(41.0/255.0, 139.0/255.0, 209.0/255.0),
        vec3(62.0/255.0, 208.0/255.0, 73.0/255.0),
        vec3(197.0/255.0, 209.0/255.0, 18.0/255.0),
        vec3(209.0/255.0, 145.0/255.0, 45.0/255.0),
        vec3(206.0/255.0, 80.0/255.0, 78.0/255.0),
        vec3(206.0/255.0, 19.0/255.0, 18.0/255.0)
    );

    // Find the nearest two control points for interpolation
    for (int i = 0; i < numPoints - 1; i++) {
        if (value >= controlValues[i] && value <= controlValues[i + 1]) {
            vec3 interpolatedColor = interpolateColor(value, 
                                                        controlValues[i], controlColors[i], 
                                                        controlValues[i + 1], controlColors[i + 1]);
            return vec4(interpolatedColor, 1.0); // Alpha = 1
        }
    }
    
    // Default: If outside range, clamp to nearest endpoint
    if (value < controlValues[0]) {
        return vec4(controlColors[0], 1.0);
    } else {
        return vec4(controlColors[numPoints - 1], 1.0);
    }
}


void main() {
    // Look up a color from the texture.
    vec4 color = texture(u_world_data_image_array, vec3(v_texCoord, 0)); // Layer 0 = elementIdx8
    // The color is a grayscale value representing the element index, which we can just use the red channel for // NOTE: assumes grayscale
    uint elementIdx = uint(color.r * 255.0);
    vec4 temperature_rgba = texture(u_world_data_image_temperature32, v_texCoord);
    vec4 downPixelColor = texture_displacement_in_pixels(u_world_data_image_elementIdx8, v_texCoord, vec2pixels(vec2(0, -1)));
    vec4 uiOverlayColor = texture(u_element_data_image_array, vec3(0, 0, elementIdx));


    vec4 naturalTileDataColor = texture(u_element_data_image_array, vec3(0, 1, elementIdx));
    // This represents an index that is used to look up the texture in the natural tile texture atlas, unless it is invisible, which means it is not in the atlas
    uint naturalTileTextureIndex = uint(naturalTileDataColor.r * 255.0); // NOTE: assumes grayscale
    bool isNaturalTileInvisible = naturalTileDataColor.a < 0.001; // If the alpha channel is 0, the texture doesn't exist, so keep it invisible
// TODO: verify
    // Get the world texture size dynamically 
    ivec2 worldSize = textureSize(u_world_data_image_elementIdx8, 0); // Assuming world size texture is the reference
    ivec2 tileTextureSize = textureSize(u_natural_tile_image_array, 0).xy; // Get tile texture resolution

    // Compute cell-relative texture coordinates
    vec2 cellTexCoord = fract(v_texCoord * vec2(worldSize)); 
    vec2 naturalTileTexCoord = cellTexCoord * (vec2(tileTextureSize) / vec2(worldSize));

    // Sample the appropriate tile texture
    vec4 naturalTileTexture = isNaturalTileInvisible ? uiOverlayColor
                                                    : texture(u_natural_tile_image_array, vec3(naturalTileTexCoord, naturalTileTextureIndex));
// TODO: verify
    // Decode the RGBA color as a single 32-bit float
    float floatValue = decodeRGBAtoFloat(temperature_rgba);

    // outColor = vec4((color.rgb + downPixelColor.rgb)/2.0, 1);
    // outColor = vec4(color.rgb, 1);
    // outColor = floatToRGBA(floatValue);
    outColor = naturalTileTexture;
    // outColor = (  vec4(uiOverlayColor.rgb, 1) + vec4(floatToRGBA(floatValue).rgb, 1)   ) / 2.0;
}
`;
        return fragmentShaderSource;
    }

    resetCanvasState() {
        const gl = this.gl;

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    drawScene() {
        const gl = this.gl;

        // draw
        const primitiveType = gl.TRIANGLES;
        const offset = 0;
        const count = 6;
        gl.drawArrays(primitiveType, offset, count);
    }

    setupShaders(vertexShaderSource, fragmentShaderSource) {
        const gl = this.gl;
    
        // Compile shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        // Link program
        const program = this.createProgram(vertexShader, fragmentShader);
    
        return { program, vertexShader, fragmentShader };
    }

    setupPositionBuffer() {
        const gl = this.gl;

        // look up where the vertex data needs to go.
        const positionAttributeLocation = gl.getAttribLocation(this.program, "a_position");
        

        // Create a buffer and put a single pixel space rectangle in
        // it (2 triangles)
        // Create a buffer and put three 2d clip space points in it
        const positionBuffer = gl.createBuffer();

        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([
            10, 20,
            80, 20,
            10, 30,
            10, 30,
            80, 20,
            80, 30,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        // Create a vertex array object (attribute state)
        const vao = gl.createVertexArray();

        // and make it the one we're currently working with
        gl.bindVertexArray(vao);

        // Bind the attribute/buffer set we want.
        gl.bindVertexArray(vao);

        // Turn on the attribute
        gl.enableVertexAttribArray(positionAttributeLocation);

        // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        const size = 2;          // 2 components per iteration
        const type = gl.FLOAT;   // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

        return positionBuffer;
    }

    setupTextureBuffers() {
        const gl = this.gl;

        // look up where the vertex data needs to go.
        const texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
        
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        const positions = new Float32Array([
            0.0,  0.0,
            1.0,  0.0,
            0.0,  1.0,
            0.0,  1.0,
            1.0,  0.0,
            1.0,  1.0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(texCoordAttributeLocation);
        const size = 2;          // 2 components per iteration
        const type = gl.FLOAT;   // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            texCoordAttributeLocation, size, type, normalize, stride, offset)

        return texCoordBuffer;
    }

    setupUniforms() {
        const gl = this.gl;

        // look up uniform locations
        this.resolutionUniformLocation = gl.getUniformLocation(this.program, "u_resolution");
    
        // Pass in the canvas resolution so we can convert from pixels to clip space in the shader
        gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    }    

    setFramebuffer(fbo, width, height) {
        const gl = this.gl;
        const resolutionLocation = this.resolutionLocation;

        // make this the framebuffer we are rendering to.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
     
        // Tell the shader the resolution of the framebuffer.
        gl.uniform2f(resolutionLocation, width, height);
     
        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, width, height);
    }

    createAndSetupTexture() {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
     
        // Set up texture so we can render any size image and so we are
        // working with pixels.
        // so we don't need mips and so we're not filtering
        // and we don't repeat
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
     
        return texture;
    }

    setupTextures(images) {
        const gl = this.gl;

        // create 2 textures
        const textures = [];
        const framebuffers = [];
        
        for (let ii = 0; ii < images.length; ++ii) {
            const texture = this.createAndSetupTexture();
            textures.push(texture);
            
            // Upload the image into the texture.
            const mipLevel = 0;               // the largest mip
            const internalFormat = gl.RGBA;   // format we want in the texture
            const srcFormat = gl.RGBA;        // format of data we are supplying
            const srcType = gl.UNSIGNED_BYTE  // type of data we are supplying
            gl.texImage2D(gl.TEXTURE_2D,
                            mipLevel,
                            internalFormat,
                            srcFormat,
                            srcType,
                            images[ii]);
 
            // Create a framebuffer
            const fbo = gl.createFramebuffer();
            framebuffers.push(fbo);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            
            // Attach a texture to it.
            const attachmentPoint = gl.COLOR_ATTACHMENT0;
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, texture, mipLevel);
        }
        return { textures, framebuffers };
    }

    bindTextureToUnit(texture, image, glsl_location, texture_unit_location) {
        const gl = this.gl;

        if (typeof glsl_location !== "string") {
            throw new Error("glsl_location must be a string.");
        }

        // Set the image location to use inside the shader's GLSL code
        const u_image_location = gl.getUniformLocation(this.program, glsl_location);

        // set which texture units to render with.
        // Tell the shader to get the texture from texture unit 0, unit 1
        gl.uniform1i(u_image_location, texture_unit_location);
        
        gl.activeTexture(gl.TEXTURE0 + texture_unit_location);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    createAndSetupTextureArray(usePixelArtSettings) { // TODO: mipmaps
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);

        if (usePixelArtSettings === true) {
            // Set up texture so we can render any size image and so we are
            // working with pixels (no mipmaps, no filtering, no repeating)
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else if (usePixelArtSettings === false) {
            // Set up texture with mipmaps, filtering, and repeating
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        } else {
            throw new Error("usePixelArtSettings must be a boolean.");
        }
        return texture;
    }

    allocateTextureArrayStorage(textureArray, imageArrayOrAtlas, getAtlasBoundsForLayer, atlasLength) {
        const gl = this.gl;

        const isAtlas = getAtlasBoundsForLayer !== null; // Check if it's a single atlas image

        // Bind the texture array before allocating storage
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
    
        const width     = isAtlas ? getAtlasBoundsForLayer(0).width     : imageArrayOrAtlas[0].width;
        const height    = isAtlas ? getAtlasBoundsForLayer(0).height    : imageArrayOrAtlas[0].height;
        const depth     = isAtlas ? atlasLength                         : imageArrayOrAtlas.length; // Number of layers
    
        // Allocate immutable storage for a 3D texture (TEXTURE_2D_ARRAY)
        gl.texStorage3D(
            gl.TEXTURE_2D_ARRAY, // Specifies the texture type
            1,                   // Number of mipmap levels (1 = no mipmaps)
            gl.RGBA8,            // Internal storage format (8-bit RGBA per channel)
            width, height, depth // Texture dimensions and depth (number of layers)
        );
    }

    getImageFromAtlas(imageAtlas, layerIndex, getAtlasBoundsForLayer) {
        // Use the function to get bounds if an atlas is used
        const bounds = getAtlasBoundsForLayer(layerIndex);
        const sx = bounds.x;
        const sy = bounds.y;
        const sw = bounds.width;
        const sh = bounds.height;

        // Create a temporary canvas to extract the subregion
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const ctx = tempCanvas.getContext("2d");

        // Draw the subregion onto the temporary canvas
        ctx.drawImage(imageAtlas, sx, sy, sw, sh, 0, 0, sw, sh);

        // Update sourceImage to be the extracted subregion
        const sourceImage = tempCanvas;
        const width = sw;
        const height = sh;

        return { sourceImage, width, height };
    }

    getImageFromImageArray(imageArray, layerIndex) {
        const sourceImage = imageArray[layerIndex];
        const width = sourceImage.width;
        const height = sourceImage.height;
        return { sourceImage, width, height };
    }

    uploadTextureArray(textureArray, imageArrayOrAtlas, getAtlasBoundsForLayer, atlasLength) {
        const gl = this.gl;

        const isAtlas = getAtlasBoundsForLayer !== null; // Check if it's a single atlas image
        const depth = isAtlas ? atlasLength : imageArrayOrAtlas.length; // Number of layers

        // Bind the texture array before uploading
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
        
        // Upload each image as a separate layer in the texture array
        for (let i = 0; i < depth; i++) {
            const { sourceImage, width, height } = isAtlas ? this.getImageFromAtlas(imageArrayOrAtlas, i, getAtlasBoundsForLayer)
                                                           : this.getImageFromImageArray(imageArrayOrAtlas, i);

            gl.texSubImage3D(
                gl.TEXTURE_2D_ARRAY,    // Target texture type
                0,                      // Mipmap level
                0, 0, i,                // x, y, z offsets (0 = no offset, z = layer index)
                width, height, 1,       // Width, height, depth (1 layer at a time)
                gl.RGBA,                // Source format
                gl.UNSIGNED_BYTE,       // Source type
                sourceImage               // Image data
            );
        }
    }

    setupTextureArray(imageArrayOrAtlas, getAtlasBoundsForLayer, atlasLength, usePixelArtSettings) {
        // Create and setup a texture array
        const textureArray = this.createAndSetupTextureArray(usePixelArtSettings);
        this.allocateTextureArrayStorage(textureArray, imageArrayOrAtlas, getAtlasBoundsForLayer, atlasLength);
        this.uploadTextureArray(textureArray, imageArrayOrAtlas, getAtlasBoundsForLayer, atlasLength);
        return textureArray;
    }

    bindTextureArrayToUnit(textureArray,  glsl_location, texture_unit_location) {
        const gl = this.gl;

        // TODO: type and bound checking
       
        const u_image_world_array_location = gl.getUniformLocation(this.program, glsl_location);

        // Bind the texture array to texture unit at texture_unit_location
        gl.activeTexture(gl.TEXTURE0 + texture_unit_location);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

        // Bind texture array to texture unit at texture_unit_location
        gl.uniform1i(u_image_world_array_location, texture_unit_location);
    }

    createShader(type, source) {
        const gl = this.gl;

        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
          return shader;
        }
       
        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl;

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
          return program;
        }
       
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }
  
    setRectangle(x, y, width, height) {
        const gl = this.gl;

        const x1 = x;
        const x2 = x + width;
        const y1 = y;
        const y2 = y + height;
       
        // NOTE: gl.bufferData(gl.ARRAY_BUFFER, ...) will affect
        // whatever buffer is bound to the `ARRAY_BUFFER` bind point
        // but so far we only have one buffer. If we had more than one
        // buffer we'd want to bind that buffer to `ARRAY_BUFFER` first.
       
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
           x1, y1,
           x2, y1,
           x1, y2,
           x1, y2,
           x2, y1,
           x2, y2]), gl.STATIC_DRAW);
    }

    drawRectangles() {
        // TODO
    }
  
    clearCanvas() {
      // TODO
    }
  
    getImage() {
        //this.resizeCanvasToDisplaySize(this.canvas);
      return this.canvas.toDataURL();
    }

    resizeCanvasToDisplaySize() { // TODO
        const { width, height } = this.canvas.getBoundingClientRect();
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            return true;
        }
        return false;
    }

    resizeCanvas(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
  }