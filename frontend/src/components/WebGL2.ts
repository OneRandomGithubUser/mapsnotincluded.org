// Confused? See https://webgl2fundamentals.org/webgl/lessons/webgl-fundamentals.html.

import {i} from "vite/dist/node/types.d-aGj9QkWt";

function getCanvasImageSourceDims(
    source: TexImageSource
): {
    width: number;
    height: number
} {

    if (
        (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
        (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) ||
        (typeof ImageData !== "undefined" && source instanceof ImageData) ||
        (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) ||
        (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
    ) {
        const width: number = source.width;
        const height: number = source.height;
        return { width, height };
    } else {
        throw new Error("Unsupported image type for width/height lookup");
    }
}

interface TextureLevel {
    getTextureLayer(layerIndex: number, mipmapIndex: number) : {
        sourceImage: TexImageSource,
        width: number,
        height: number
    };
    getNumTextureLayers() : number;
    getTextureWidth() : number;
    getTextureHeight() : number;
}
interface TextureLevelMipmapArray {
    getMipmapArray() : TextureLevel[];
    getMipmapLevel(index: number) : TextureLevel;
    getNumProvidedMipmaps(): number;
    getNumTextureLayers() : number;
}

class TextureArrayCreationSettings {
    // TODO
    private usePixelArtSettings: boolean;
    constructor(usePixelArtSettings: boolean) {
        this.usePixelArtSettings = usePixelArtSettings;
    }
}
class TextureAtlas implements TextureLevel {
    private readonly imageAtlas: TexImageSource;
    private readonly getAtlasBoundsForLayer: (layerIndex: number, mipmapIndex: number) => {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    private readonly atlasDepth: number;
    private readonly width: number;
    private readonly height: number;

    constructor(
        imageAtlas: TexImageSource,
        getAtlasBoundsForLayer: (layerIndex: number, mipmapIndex: number) => {
            x: number;
            y: number;
            width: number;
            height: number;
        },
        atlasDepth: number,
    ) {
        if (atlasDepth <= 0) {
            throw new Error("Atlas depth must be a positive integer");
        }

        this.imageAtlas = imageAtlas;
        this.getAtlasBoundsForLayer = getAtlasBoundsForLayer;
        this.atlasDepth = atlasDepth;

        const firstInfo = this.getTextureLayer(0, 0);
        // TODO: move mipmap index logic elsewhere
        for (let i = 1; i < atlasDepth; i++) {
            const currInfo = this.getTextureLayer(i, 0);
            if (currInfo.height !== firstInfo.height) {
                throw new Error("All heights must match.");
            }
            if (currInfo.width !== firstInfo.width) {
                throw new Error("All widths must match.");
            }
        }
        this.width = firstInfo.width;
        this.height = firstInfo.height;
    }

    private static toCanvasImageSource(source: TexImageSource): CanvasImageSource {
        if (
            (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
            (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
            (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) ||
            (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) ||
            (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
        ) {
            return source; // Already valid
        }

        // Convert ImageData
        if (typeof ImageData !== "undefined" && source instanceof ImageData) {
            const canvas = document.createElement("canvas");
            canvas.width = source.width;
            canvas.height = source.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Failed to get 2D context while converting ImageData.");
            ctx.putImageData(source, 0, 0);
            return canvas;
        }

        // Convert VideoFrame (if supported)
        if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) {
            const canvas = document.createElement("canvas");
            canvas.width = source.displayWidth;
            canvas.height = source.displayHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Failed to get 2D context while converting VideoFrame.");
            // Draw the frame — drawImage supports VideoFrame as of modern browsers
            ctx.drawImage(source, 0, 0);
            return canvas;
        }

        throw new Error("Unsupported TexImageSource type for drawImage conversion.");
    }

    public getTextureLayer(
        layerIndex: number,
        mipmapIndex: number
    ) : {
        sourceImage: TexImageSource,
        width: number,
        height: number
    } {
        // Use the function to get bounds if an atlas is used
        const bounds = this.getAtlasBoundsForLayer(layerIndex, mipmapIndex);
        const sx = bounds.x;
        const sy = bounds.y;
        const sw = bounds.width;
        const sh = bounds.height;

        // Create a temporary canvas to extract the subregion
        const tempCanvas = new OffscreenCanvas(sw, sh);
        const ctx = tempCanvas.getContext("2d");
        if (ctx === null) {
            throw new Error("Failed to get 2D context from temporary canvas.");
        }

        const safeImageAtlas = TextureAtlas.toCanvasImageSource(this.imageAtlas);

        // Draw the subregion onto the temporary canvas
        ctx.drawImage(safeImageAtlas, sx, sy, sw, sh, 0, 0, sw, sh);

        // Update sourceImage to be the extracted subregion
        const sourceImage = tempCanvas;
        const width = sw;
        const height = sh;

        return { sourceImage, width, height };
    }
    getNumTextureLayers() : number {
        return this.atlasDepth;
    }
    getTextureWidth(): number {
        return this.width;
    }
    getTextureHeight(): number {
        return this.height;
    }
}
class TextureArray implements TextureLevel {
    private readonly imageArray: TexImageSource[];
    private readonly width: number;
    private readonly height: number;
    constructor(imageArray: TexImageSource[]) {
        if (imageArray.length <= 0) {
            throw new Error("ImageArray length must be a positive integer");
        }

        this.imageArray = imageArray;

        const firstInfo = this.getTextureLayer(0, 0);
        // TODO: repeated code from TextureAtlas
        for (let i = 1; i < imageArray.length; i++) {
            const currInfo = this.getTextureLayer(i, 0);
            if (currInfo.height !== firstInfo.height) {
                throw new Error("All heights must match.");
            }
            if (currInfo.width !== firstInfo.width) {
                throw new Error("All widths must match.");
            }
        }
        this.width = firstInfo.width;
        this.height = firstInfo.height;
    }

    getTextureLayer(
        layerIndex: number,
        mipmapIndex: number
    ) : {
        sourceImage: TexImageSource,
        width: number,
        height: number
    } {
        // TODO: mipmapIndex
        const sourceImage = this.imageArray[layerIndex];
        const dims = getCanvasImageSourceDims(sourceImage);
        const width = dims.width;
        const height = dims.height;
        return { sourceImage, width, height };
    }
    getNumTextureLayers() : number {
        return this.imageArray.length;
    }
    getTextureWidth(): number {
        return this.width;
    }
    getTextureHeight(): number {
        return this.height;
    }
}
class TextureAtlasMipmapArray implements TextureLevelMipmapArray {
    private readonly imageMipmaps: TextureAtlas[];
    private readonly depth: number;
    constructor(imageMipmaps: TextureAtlas[]) {
        if (imageMipmaps.length <= 0) {
            throw new Error("No image mipmaps found.");
        }

        const firstImageMipmap = imageMipmaps[0];
        this.depth = firstImageMipmap.getNumTextureLayers();
        for (let i = 1; i < imageMipmaps.length; i++) {
            const currImageMipmap = imageMipmaps[i];
            const currTextureLayers = currImageMipmap.getNumTextureLayers();
            if (currTextureLayers !== this.depth) {
                throw new Error("Image mipmaps were not of the same depth.");
            }
        }

        this.imageMipmaps = imageMipmaps;
    }
    getNumProvidedMipmaps() : number {
        return this.imageMipmaps.length;
    }
    getMipmapArray() : TextureLevel[] {
        return this.imageMipmaps;
    }
    getNumTextureLayers(): number {
        return this.depth;
    }
    getMipmapLevel(index: number): TextureLevel {
        return this.imageMipmaps[index];
    }
}
class TextureArrayMipmapArray implements TextureLevelMipmapArray {
    private readonly imageMipmaps: TextureArray[];
    private readonly depth: number;
    constructor(imageMipmaps: TextureArray[]) {
        if (imageMipmaps.length <= 0) {
            throw new Error("No image mipmaps found.");
        }

        // TODO: repeated code from TextureAtlasMipmapArray
        const firstImageMipmap = imageMipmaps[0];
        this.depth = firstImageMipmap.getNumTextureLayers();
        for (let i = 1; i < imageMipmaps.length; i++) {
            const currImageMipmap = imageMipmaps[i];
            const currTextureLayers = currImageMipmap.getNumTextureLayers();
            if (currTextureLayers !== this.depth) {
                throw new Error("Image mipmaps were not of the same depth.");
            }
        }

        this.imageMipmaps = imageMipmaps;
    }
    getNumProvidedMipmaps() : number {
        return this.imageMipmaps.length;
    }
    getMipmapArray() : TextureLevel[] {
        return this.imageMipmaps;
    }
    getNumTextureLayers(): number {
        return this.depth;
    }
    getMipmapLevel(index: number): TextureLevel {
        return this.imageMipmaps[index];
    }
}
export default class WebGL2CanvasManager {
    private canvas: OffscreenCanvas;
    private readonly gl: WebGL2RenderingContext;
    private readonly program: WebGLProgram;
    private readonly vertexShader: WebGLShader;
    private readonly fragmentShader: WebGLShader;
    private readonly positionBuffer : WebGLBuffer;
    private readonly NATURAL_TILES_TEXTURE_SIZE : number;
    private readonly RESOLUTION_LOCATION_NAME : string;
    private readonly MAX_TEXTURE_SLOTS: number;
    private readonly textureLRU: Map<string,number>; // seed ➜ slot index
    private readonly worldDataArray: WebGLTexture;
    private readonly worldDataArrayNumMipmaps: number; // TODO: is this necessary?
    private elementDataTextureArray: WebGLTexture | undefined;
    private spaceTextureArray: WebGLTexture | undefined;
    private naturalTilesTextureArray: WebGLTexture | undefined;
    private readonly DATA_IMAGES_PER_SEED: number;
    constructor(defaultWidth: number = 300, defaultHeight: number = 300) {
        // Get a WebGL context
        this.canvas = new OffscreenCanvas(defaultWidth, defaultHeight);
        const ctx = this.canvas.getContext("webgl2");
        if (!ctx) {
            this.throwError("WebGL2 is not supported.");
        }
        this.gl = ctx;
        const gl = this.gl;

        const vertexShaderSource = this.getVertexShaderGLSL();
        const fragmentShaderSource = this.getFragmentShaderGLSL();

        // Use our boilerplate utils to compile the shaders and link into a program
        const shaders = this.setupShaders(vertexShaderSource, fragmentShaderSource);
        this.program = shaders.program;
        this.vertexShader = shaders.vertexShader;
        this.fragmentShader = shaders.fragmentShader;

        // Tell it to use our program (pair of shaders)
        gl.useProgram(this.program);

        this.positionBuffer = this.setupPositionBuffer("a_position", 0, 0, 1, 1);

        this.NATURAL_TILES_TEXTURE_SIZE = 1024;
        this.RESOLUTION_LOCATION_NAME = "u_resolution";

        this.MAX_TEXTURE_SLOTS = 32;          // adjust ≤ GPU limit
        this.textureLRU = new Map<string,number>();
        this.DATA_IMAGES_PER_SEED = 3;

        // Initialize the world data texture array
        {
            const usePixelArtSettings = true;
            this.worldDataArray = this.createAndSetupTextureArray(true);
            const width = 1200;
            const height = 500;
            const depth = this.MAX_TEXTURE_SLOTS;
            const {numAllocatedMipmaps} = this.allocateTextureArrayStorage(this.worldDataArray, width, height, depth, usePixelArtSettings);
            this.worldDataArrayNumMipmaps = numAllocatedMipmaps;
            // this.bindTextureArrayToUnit(this.worldDataArray, "u_world_data_image_array", 4);
        }
    }
    setup(
        opts?: {
            dataImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            elementDataImage?: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
            bgImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            tileImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            seed?: string
        }
    ) : void {
        // TODO: lazy texture loading with large images
        const gl = this.gl;

        const texCoordBuffer = this.setupTextureBuffers("a_texCoord");
        //this.setRectangle(positionBuffer, num_pixels_num_cells_left_edge_x, num_pixels_num_cells_bottom_edge_y, num_pixels_world_width, num_pixels_world_height);

        // provide texture coordinates for the rectangle.
        console.log("opts", opts);

        if (opts) {
            console.log("opts", opts)
            if (opts.dataImages) {
                if (!opts.seed) {
                    this.throwError("Seed is required for data images.");
                }
                const worldDataImages = opts.dataImages;
                if (worldDataImages.length !== this.DATA_IMAGES_PER_SEED) {
                    this.throwError(`Expected ${this.DATA_IMAGES_PER_SEED} data images, but got ${worldDataImages.length}.`);
                }
                const worldDataImagesWrapper = new TextureArray(worldDataImages);
                const {textures: worldDataTextures, framebuffers} = this.setupTextures(worldDataImages);
                const dummyGetAtlasBoundsForLayer = (layerIndex: number, mipmapIndex: number) => {
                    this.throwError("Called dummy atlas bounds.");
                    return {x: 0, y: 0, width: 0, height: 0};
                };
                const seed = opts.seed;
                const textureArray = this.worldDataArray;
                const imageArrayOrAtlasOrMipmap = worldDataImagesWrapper;
                const usePixelArtSettings = true;
                const flipTexturesY = false;
                const numAllocatedMipmaps = this.worldDataArrayNumMipmaps;
                const slot = this.acquireTextureSlot(seed);
                const layerIdx = slot * this.DATA_IMAGES_PER_SEED;
                this.uploadTextureArray(textureArray, imageArrayOrAtlasOrMipmap, usePixelArtSettings, flipTexturesY, numAllocatedMipmaps, layerIdx);
                this.textureLRU.set(seed, performance.now());
                // const worldEtmTextureArray = this.setupTextureArray(worldDataImagesWrapper, true, false);
                console.log(`World data images uploaded to texture array at slot ${slot} (index ${layerIdx}) for seed: ${seed}`);
            }
            if (opts.elementDataImage) {
                console.log("opts.elementDataImage", opts.elementDataImage)
                const elementDataImageAtlas = opts.elementDataImage;
                const getElementDataAtlasBounds = (layerIndex: number) => {
                    return { x: layerIndex, y: 0, width: 1, height: 2 };
                };
                const elementDataImageAtlasWrapper = new TextureAtlas(
                    elementDataImageAtlas,
                    getElementDataAtlasBounds,
                    elementDataImageAtlas.width
                );
                const elementDataTextureArray = this.setupTextureArray(elementDataImageAtlasWrapper, true, false);
                // NOTE: assumption that the elementDataImageAtlas is a horizontal strip of 1x1 images. row 1 is the ui overlay color, row 2 is the element texture index (0-255, or invisible if there is none)
                // TODO: does this need to be a texture array?
                // this.bindTextureArrayToUnit(elementDataTextureArray, "u_element_data_image_array", 1);
                this.elementDataTextureArray = elementDataTextureArray;
            }
            if (opts.bgImages) {
                const SPACE_TEXTURE_SIZE = 1024;
                const spaceBackgroundImages = opts.bgImages;
                const spaceImagesWrapper = new TextureArray(spaceBackgroundImages);
                const { textures: spaceTextures } = this.setupTextures(spaceBackgroundImages);
                const spaceTextureArray = this.setupTextureArray(spaceImagesWrapper, true, false);
                // this.bindTextureArrayToUnit(spaceTextureArray, "u_space_image_array", 2);
                this.spaceTextureArray = spaceTextureArray;
            }
            if (opts.tileImages) {
                const naturalTilesImageAtlas = opts.tileImages;
                let naturalTilesImageAtlasTemp : TextureAtlas[] = []; // TODO: remove temp
                const getNaturalTileAtlasBounds = (layerIndex: number, mipmapIndex: number) => {
                    const textureSize = this.NATURAL_TILES_TEXTURE_SIZE / (2 ** mipmapIndex);
                    return { x: layerIndex * textureSize, y: 0, width: textureSize, height: textureSize };
                };
                for (let i = 0; i < naturalTilesImageAtlas.length; i++) {
                    naturalTilesImageAtlasTemp.push(new TextureAtlas(
                        naturalTilesImageAtlas[i],
                        getNaturalTileAtlasBounds,
                        naturalTilesImageAtlas[0].width/this.NATURAL_TILES_TEXTURE_SIZE
                    ));
                }
                const naturalTilesImageAtlasWrapper = new TextureAtlasMipmapArray(naturalTilesImageAtlasTemp);
                // TODO: rename to natural tiles everywhere
                //const naturalTilesTextureArray = this.setupTextureArray(images[4], false, false, false);
                const naturalTilesTextureArray = this.setupTextureArray(naturalTilesImageAtlasWrapper, false, true);
                // this.bindTextureArrayToUnit(naturalTilesTextureArray, "u_natural_tile_image_array", 3);
                this.naturalTilesTextureArray = naturalTilesTextureArray;
            }
        }
        if (!this.elementDataTextureArray || !this.spaceTextureArray || !this.naturalTilesTextureArray) {
            console.warn("Textures not yet fully loaded. Skipping binding.");
            return;
        }
        this.bindTextureArrayToUnit(this.elementDataTextureArray, "u_element_data_image_array", 1);
        this.bindTextureArrayToUnit(this.spaceTextureArray, "u_space_image_array", 2);
        this.bindTextureArrayToUnit(this.naturalTilesTextureArray, "u_natural_tile_image_array", 3);
        this.bindTextureArrayToUnit(this.worldDataArray, "u_world_data_image_array", 4);

        // TODO: readd if necessary
        // this.bindTextureToUnit(worldDataTextures[0], "u_world_data_image_elementIdx8", 0);
        //this.bindTextureToUnit(worldDataTextures[1], images[1], "u_world_data_image_temperature32", 1);
        //this.bindTextureToUnit(worldDataTextures[2], images[2], "u_world_data_image_mass32", 2);

        this.checkWebGLError();
    }
    render(
        seed: string,
        numCellsWorldWidth: number,
        numCellsWorldHeight: number,
        num_cells_width: number,
        num_cells_height: number,
        num_cells_left_edge_x: number,
        num_cells_bottom_edge_y: number,
        canvas_width: number,
        canvas_height: number
    ): void {
        const gl = this.gl;

        this.resizeCanvas(canvas_width, canvas_height);
        this.resetCanvasState();

        // Set the currently rendering seed
        const layer = [...this.textureLRU.keys()].indexOf(seed);
        if (layer < 0) {
            console.warn("Seed not loaded:", seed);
            return;
        }
        this.bind1UniformIntsToUnit(layer, "u_worldLayer");

        // --- Phase 1: draw full-screen background ---
        // TODO: make space background follow the Leaflet map, not individual Leaflet tiles
        this.updatePositionBuffer(this.positionBuffer, 0, 0, canvas_width, canvas_height);
        this.bind2UniformFloatsToUnit(canvas_width, canvas_height, this.RESOLUTION_LOCATION_NAME);

        this.bind1UniformFloatsToUnit(0.0, "u_lod_level"); // lod not needed for background
        this.bind2UniformFloatsToUnit(1.0, 1.0, "u_natural_texture_tiles_per_cell"); // identity mapping
        this.setFramebuffer(null, canvas_width, canvas_height, this.RESOLUTION_LOCATION_NAME);
        this.bindUniformBoolToUnit(true, "u_rendering_background"); // for foreground/world pass
        this.drawScene();

        // --- Phase 2: draw world on top ---
        // TODO: make space background consistent in first and second pass, possibly with frame buffers

        // Set a rectangle the same size as the image.
        // NOTE: assumes that the world data images are the same size and are the same size as the world
        const num_pixels_world_width = canvas_width / num_cells_width * numCellsWorldWidth;
        const num_pixels_world_height = canvas_height / num_cells_height * numCellsWorldHeight;
        const num_pixels_num_cells_left_edge_x = canvas_width / num_cells_width * num_cells_left_edge_x;
        const num_pixels_num_cells_bottom_edge_y = canvas_width / num_cells_width * num_cells_bottom_edge_y;

        this.updatePositionBuffer(
            this.positionBuffer,
            num_pixels_num_cells_left_edge_x,
            num_pixels_num_cells_bottom_edge_y,
            num_pixels_world_width,
            num_pixels_world_height
        );

        // Pass in the canvas resolution so we can convert from pixels to clip space in the shader
        this.bind2UniformFloatsToUnit(gl.canvas.width, gl.canvas.height, this.RESOLUTION_LOCATION_NAME);

        const NATURAL_TEXTURE_TILES_PER_CELL_X = 1 / 8;
        const NATURAL_TEXTURE_TILES_PER_CELL_Y = 1 / 8;
        const lodLevel = this.computeLodLevel(num_cells_width, num_cells_height, NATURAL_TEXTURE_TILES_PER_CELL_X, NATURAL_TEXTURE_TILES_PER_CELL_Y);
        this.bind1UniformFloatsToUnit(lodLevel, "u_lod_level");
        this.bind2UniformFloatsToUnit(NATURAL_TEXTURE_TILES_PER_CELL_X, NATURAL_TEXTURE_TILES_PER_CELL_Y, "u_natural_texture_tiles_per_cell");
        this.bindUniformBoolToUnit(false, "u_rendering_background"); // for foreground/world pass

        // Calling gl.bindFramebuffer with null tells WebGL to render to the canvas instead of one of the framebuffers.
        this.setFramebuffer(null, gl.canvas.width, gl.canvas.height, this.RESOLUTION_LOCATION_NAME);

        this.drawScene();

        this.checkWebGLError(); // TODO: more error reporting
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

precision highp sampler2DArray;
uniform sampler2DArray u_world_data_image_array;
uniform sampler2DArray u_element_data_image_array;
uniform sampler2DArray u_natural_tile_image_array;
uniform sampler2DArray u_space_image_array;

uniform float u_lod_level;
uniform vec2 u_natural_texture_tiles_per_cell;
uniform bool u_rendering_background;
uniform int u_worldLayer;   // which layer triplet to sample

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

// TODO: see if this is built-in
vec2 pairwise_mult(vec2 vector_1, vec2 vector_2) {
    return vec2(vector_1.x * vector_2.x, vector_1.y * vector_2.y);
}

void main() {
    if (u_rendering_background) {
        vec2 cellTexCoord = v_texCoord;
        vec4 space_background = texture(u_space_image_array, vec3(cellTexCoord, 0));
        vec4 space_foreground = texture(u_space_image_array, vec3(cellTexCoord, 1));
        outColor = space_background + space_foreground;
        // TODO: why u_element_data_image_array is space, u_space_image_array is u_natural_tile_image_array
        // u_natural_tile_image_array is world data, u_world_data_image_array is element data
        //outColor = texture(u_space_image_array,
        //             vec3(v_texCoord, 1.0));
    } else {
    
    // TODO: half-pixel correction
    // Look up a color from the texture.
    vec4 elementIdxColorData = texture(u_world_data_image_array,
                     vec3(v_texCoord, float(u_worldLayer*3))); // Layer 0 = elementIdx8
    vec4 tempColorData = texture(u_world_data_image_array,
                     vec3(v_texCoord, float(u_worldLayer*3+1))); // Layer 1 = temperature32
    vec4 massColorData = texture(u_world_data_image_array,
                     vec3(v_texCoord, float(u_worldLayer*3+2))); // Layer 2 = mass32
    // The color is a grayscale value representing the element index, which we can just use the red channel for // NOTE: assumes grayscale
    uint elementIdx = uint(elementIdxColorData.r * 255.0);
    float temperature = decodeRGBAtoFloat(tempColorData);
    float mass = decodeRGBAtoFloat(massColorData);
    // vec4 downPixelColor = texture_displacement_in_pixels(_____, v_texCoord, vec2pixels(vec2(0, -1)));
    vec4 uiOverlayColor = elementIdx == 255u ? vec4(0,0,0,0) : texture(u_element_data_image_array, vec3(0, 0, elementIdx));


    vec4 naturalTileColorData = elementIdx == 255u ? vec4(0,0,0,0) : texture(u_element_data_image_array, vec3(0, 1, elementIdx));
    // This represents an index that is used to look up the texture in the natural tile texture atlas, unless it is invisible, which means it is not in the atlas
    uint naturalTileTextureIndex = uint(naturalTileColorData.r * 255.0); // NOTE: assumes grayscale
    bool isNaturalTileInvisible = naturalTileColorData.a < 0.001; // If the alpha channel is 0, the texture doesn't exist, so keep it invisible
// TODO: verify
    // Get the world texture size dynamically
    ivec2 worldSize = textureSize(u_world_data_image_array, 0).xy; // Get world texture resolution
    // e.g. (636, 404)
    ivec2 tileTextureSize = textureSize(u_natural_tile_image_array, 0).xy; // Get tile texture resolution
    // e.g. (1024, 1024)

    // Compute cell-relative texture coordinates
    vec2 v_worldCellPositionFloat = v_texCoord * vec2(worldSize);   
    // e.g. if v_texCoord = (0.123, 0.456) and worldSize = (636, 404) then v_worldCellPositionFloat = (78.228, 184.224)

    // NOTE: fract is not needed if we use GL_REPEAT to repeat the textures and "loop around" the edges when the coordinate is outside of the [0, 1] range
    vec2 cellTexCoord = v_worldCellPositionFloat * u_natural_texture_tiles_per_cell;

    // e.g. if v_worldCellPositionFloat = (78.228, 184.224) then cellTexCoord = (0.228, 0.224)
    vec2 naturalTileTexCoord = cellTexCoord;

    // Sample the appropriate tile texture
    vec4 naturalTileTexture = isNaturalTileInvisible ? uiOverlayColor
                                                    : textureLod(u_natural_tile_image_array, vec3(naturalTileTexCoord, naturalTileTextureIndex), u_lod_level);
// TODO: verify

    // outColor = vec4((color.rgb + downPixelColor.rgb)/2.0, 1);
    // outColor = vec4(color.rgb, 1);
    // outColor = floatToRGBA(temperature);
    vec4 foreground = naturalTileTexture;
    
    vec4 space_background = texture(u_space_image_array, vec3(v_texCoord, 0));
    vec4 space_foreground = texture(u_space_image_array, vec3(v_texCoord, 1));
    vec4 space_texture = space_background + space_foreground;
    
    outColor = mix(space_texture, foreground, foreground.a);
    }
    
}
`;
        return fragmentShaderSource;
    }

    resetCanvasState() : void {
        const gl = this.gl;

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    drawScene() : void {
        const gl = this.gl;

        // draw
        const primitiveType = gl.TRIANGLES;
        const offset = 0;
        const count = 6;
        gl.drawArrays(primitiveType, offset, count);
    }

    private checkWebGLError() {
        const gl = this.gl;
        const error = gl.getError();
        const errorMsgPrefix = "WebGL error: ";
        switch (error) {
            case gl.NO_ERROR:
                // No error, do nothing
                break;
            case gl.INVALID_ENUM:
                this.throwError(`${errorMsgPrefix} INVALID_ENUM`);
                break;
            case gl.INVALID_VALUE:
                this.throwError(`${errorMsgPrefix} INVALID_VALUE`);
                break;
            case gl.INVALID_OPERATION:
                this.throwError(`${errorMsgPrefix} INVALID_OPERATION`);
                break;
            case gl.INVALID_FRAMEBUFFER_OPERATION:
                this.throwError(`${errorMsgPrefix} INVALID_FRAMEBUFFER_OPERATION`);
                break;
            case gl.OUT_OF_MEMORY:
                this.throwError(`${errorMsgPrefix} OUT_OF_MEMORY`);
                break;
            case gl.CONTEXT_LOST_WEBGL:
                this.throwError(`${errorMsgPrefix} CONTEXT_LOST_WEBGL`);
                break;
            default:
                this.throwError(`${errorMsgPrefix} Unknown error`);
                break;
        }
    }

    private throwError(msg: string) {
        const prefixedMsg = `[WebGL2CanvasManager] ${msg}`;
        this.throwError(prefixedMsg);
    }

    private acquireTextureSlot(seed:string): number {
        if (this.textureLRU.has(seed)) {
            this.textureLRU.set(seed, performance.now());
            return [...this.textureLRU.keys()].indexOf(seed);
        }
        if (this.textureLRU.size >= this.MAX_TEXTURE_SLOTS) {
            // evict eldest
            const eldest = [...this.textureLRU.entries()]
                .sort((a,b)=>a[1]-b[1])[0][0];
            const idx = [...this.textureLRU.keys()].indexOf(eldest);
            this.textureLRU.delete(eldest);
            // caller must re-upload into idx
            return idx;
        }
        // free slot = size
        return this.textureLRU.size;
    }

    setupShaders(vertexShaderSource: string,
                 fragmentShaderSource: string
    ) : {
        program: WebGLProgram,
        vertexShader: WebGLShader,
        fragmentShader: WebGLShader
    } {
        const gl = this.gl;

        // Compile shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);

        if (vertexShader === undefined || vertexShader === null) {
            this.throwError("Failed to compile vertex shader.");
        }

        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        if (fragmentShader === undefined || fragmentShader === null) {
            this.throwError("Failed to compile fragment shader.");
        }

        // Link program
        const program = this.createProgram(vertexShader, fragmentShader);

        if (program === undefined || program === null) {
            this.throwError("WebGL2CanvasManager: Failed to link shaders.");
        }

        return { program, vertexShader, fragmentShader };
    }

    setupFramebufferTexture(width: number, height: number) {
        // TODO: rendering options
        const gl = this.gl;

        const framebuffer = gl.createFramebuffer();
        if (framebuffer === undefined || framebuffer === null) {
            this.throwError("Failed to create background framebuffer.");
        }
        const texture = gl.createTexture();
        if (texture === undefined || texture === null) {
            this.throwError("Failed to create background texture.");
        }

        // Bind and configure the background texture
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Attach the texture to the framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        // Cleanup
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        return { framebuffer, texture };

    }

    setupPositionBuffer(position_location: string,
                        x: number,
                        y: number,
                        width: number,
                        height: number) : WebGLBuffer {
        const gl = this.gl;

        // look up where the vertex data needs to go.
        const positionAttributeLocation = gl.getAttribLocation(this.program, position_location);


        // Create a buffer and put a single pixel space rectangle in
        // it (2 triangles)
        // Create a buffer and put three 2d clip space points in it
        const positionBuffer = gl.createBuffer();

        if (positionBuffer === null) {
            this.throwError("Failed to create position buffer.");
        }

        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        const x1 = x;
        const x2 = x + width;
        const y1 = y;
        const y2 = y + height;

        const positions = new Float32Array([
            x1, y1,
            x2, y1,
            x1, y2,
            x1, y2,
            x2, y1,
            x2, y2
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // Create a vertex array object (attribute state)
        const vao = gl.createVertexArray();

        if (vao === null) {
            this.throwError("Failed to create vertex array object.");
        }

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

    updatePositionBuffer(
        positionBuffer: WebGLBuffer,
        x: number,
        y: number,
        width: number,
        height: number
    ): void {
        const gl = this.gl;

        // Bind the existing position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // Compute new rectangle coordinates
        const x1 = x;
        const x2 = x + width;
        const y1 = y;
        const y2 = y + height;

        // Update the buffer with new positions
        const positions = new Float32Array([
            x1, y1,
            x2, y1,
            x1, y2,
            x1, y2,
            x2, y1,
            x2, y2
        ]);

        // Update buffer data with new positions
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    }


    setupTextureBuffers(texture_location: string) : WebGLBuffer {
        const gl = this.gl;

        // look up where the vertex data needs to go.
        const texCoordAttributeLocation = gl.getAttribLocation(this.program, texture_location);

        const texCoordBuffer = gl.createBuffer();

        if (texCoordBuffer === null) {
            this.throwError("Failed to create texture coordinate buffer.");
        }

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

    // TODO: class for number as pixels, cells, texture tiles, clip space, etc.
    setFramebuffer(fbo: WebGLFramebuffer | null,
                   width: number,
                   height: number,
                   resolutionLocationName: string) : void {
        const gl = this.gl;

        const resolutionLocation = this.getUniformLocation(resolutionLocationName);

        // make this the framebuffer we are rendering to.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        // Tell the shader the resolution of the framebuffer.
        gl.uniform2f(resolutionLocation, width, height);

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, width, height);
    }

    createAndSetupTexture() : WebGLTexture {
        const gl = this.gl;

        const texture = gl.createTexture();

        if (texture === null) {
            this.throwError("Failed to create texture.");
        }

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

    setupTextures(
        images: (TexImageSource)[]
    ) : {
        textures: WebGLTexture[],
        framebuffers: WebGLFramebuffer[]
    } {
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

            if (fbo === null) {
                this.throwError("Failed to create framebuffer.");
            }

            framebuffers.push(fbo);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            // Attach a texture to it.
            const attachmentPoint = gl.COLOR_ATTACHMENT0;
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, texture, mipLevel);
        }
        return { textures, framebuffers };
    }

    bindTextureToUnit(texture: WebGLTexture,
                      glsl_location: string,
                      texture_unit_index: number) : void {
        const gl = this.gl;

        // Set the image location to use inside the shader's GLSL code
        const u_image_location = this.getUniformLocation(glsl_location);

        if (u_image_location === null) {
            const msg = `Failed to get image location: ${glsl_location} (location is invalid or unused)`;
            this.throwError(msg);
        }

        // set which texture units to render with.
        // Tell the shader to get the texture from texture unit 0, unit 1
        this.bind1UniformIntsToUnit(texture_unit_index, glsl_location);

        gl.activeTexture(gl.TEXTURE0 + texture_unit_index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    createAndSetupTextureArray(usePixelArtSettings: boolean) : WebGLTexture { // TODO: mipmaps
        const gl = this.gl;

        const texture = gl.createTexture();

        if (texture === null) {
            this.throwError("Failed to create texture array.");
        }

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
            this.throwError("usePixelArtSettings must be a boolean.");
        }
        return texture;
    }

    static isTexImageSource(obj: any): obj is TexImageSource {
        // TODO: helper JS file?
        return (
            obj instanceof HTMLImageElement ||
            obj instanceof HTMLCanvasElement ||
            obj instanceof ImageBitmap ||
            obj instanceof ImageData ||
            obj instanceof HTMLVideoElement ||
            (typeof OffscreenCanvas !== "undefined" &&
                obj instanceof OffscreenCanvas)
        );
    }

    allocateTextureArrayStorage(textureArray: WebGLTexture,
                                width: number,
                                height: number,
                                depth: number,
                                usePixelArtSettings: boolean
    ) : { numAllocatedMipmaps: number; } {
        const gl = this.gl;


        // Bind the texture array before allocating storage
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

        const max_texture_dimension = Math.max(width, height);
        const max_mipmap_levels = Math.floor(Math.log2(max_texture_dimension)) + 1;
        const numAllocatedMipmaps = usePixelArtSettings ? 1 : max_mipmap_levels;

        // Allocate immutable storage for a 3D texture (TEXTURE_2D_ARRAY)
        gl.texStorage3D(
            gl.TEXTURE_2D_ARRAY,    // Specifies the texture type
            numAllocatedMipmaps,    // Number of mipmap levels (1 = no mipmaps)
            gl.RGBA8,               // Internal storage format (8-bit RGBA per channel)
            width, height, depth    // Texture dimensions and depth (number of layers)
        );

        return {numAllocatedMipmaps};
    }

    /**
     * Upload an image array / atlas / mipmap-array into a WebGL 2
     * TEXTURE_2D_ARRAY.
     *
     * @param textureArray  the already-allocated GL texture array
     * @param imageArrayOrAtlasOrMipmap  any of TextureAtlas | TextureArray | TextureAtlasMipmapArray | TextureArrayMipmapArray
     * @param usePixelArtSettings  affects filtering / wrapping
     * @param flipTexturesY        gl.UNPACK_FLIP_Y_WEBGL
     * @param numAllocatedMipmaps  how many mip levels were allocated in texStorage3D
     * @param layerOffset          first layer (Z) to write into – *defaults to 0*
     */
    uploadTextureArray(
        textureArray: WebGLTexture,
        imageArrayOrAtlasOrMipmap: TextureAtlas | TextureArray | TextureAtlasMipmapArray | TextureArrayMipmapArray,
        usePixelArtSettings: boolean,
        flipTexturesY: boolean,
        numAllocatedMipmaps: number,
        layerOffset = 0
    ) : void {
        const gl = this.gl;

        /* ---------- validation -------------------- */
        const numProvidedMipmaps =
            (imageArrayOrAtlasOrMipmap instanceof TextureAtlasMipmapArray || imageArrayOrAtlasOrMipmap instanceof TextureArrayMipmapArray) // TextureLevelMipmapArray
                ? imageArrayOrAtlasOrMipmap.getNumProvidedMipmaps()
                : 1;
        if ((imageArrayOrAtlasOrMipmap instanceof TextureAtlasMipmapArray || imageArrayOrAtlasOrMipmap instanceof TextureArrayMipmapArray) && numProvidedMipmaps !== numAllocatedMipmaps) {
            this.throwError("The number of provided mipmaps must be equal to the maximum number of mipmap levels in manual mipmap uploads.");
        }

        const depth = imageArrayOrAtlasOrMipmap.getNumTextureLayers(); // Number of layers
        if (depth === 0) {
            this.throwError("Cannot have empty texture source.");
        } else if (depth < 0) {
            this.throwError("Cannot have negative texture sources.");
        }

        if (numProvidedMipmaps === 0) {
            this.throwError("no mipmaps provided"); // TODO: this should be a class check
        } else if (numProvidedMipmaps < 0) {
            this.throwError("negative mipmaps provided");
        }

        /* ---------- bind & pixel-store ---------- */

        // Bind the texture array before uploading
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

        if (flipTexturesY) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        } else if (!flipTexturesY) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }

        /* ---------- main upload loop ---------- */

        for (let mipmapLevel = 0; mipmapLevel < numProvidedMipmaps; mipmapLevel++) {
            const sourceimageArrayOrAtlasOrMipmap =
                (imageArrayOrAtlasOrMipmap instanceof TextureAtlasMipmapArray || imageArrayOrAtlasOrMipmap instanceof TextureArrayMipmapArray) // TextureLevelMipmapArray
                    ? imageArrayOrAtlasOrMipmap.getMipmapLevel(mipmapLevel)
                    : imageArrayOrAtlasOrMipmap;
            // Upload each image as a separate layer in the texture array
            for (let i = 0; i < depth; i++) {
                const { sourceImage, width, height } =
                        sourceimageArrayOrAtlasOrMipmap.getTextureLayer(i, mipmapLevel);
                const layerIdx = layerOffset + i; // layerOffset is the first layer to write into
                gl.texSubImage3D(
                    gl.TEXTURE_2D_ARRAY,    // Target texture type
                    mipmapLevel,            // Mipmap level
                    0, 0, layerIdx,                // x, y, z offsets (0 = no offset, z = layer index)
                    width, height, 1,       // Width, height, depth (1 layer at a time)
                    gl.RGBA,                // Source format
                    gl.UNSIGNED_BYTE,       // Source type
                    sourceImage             // Image data
                );
            }
        }
        if (!usePixelArtSettings && !(imageArrayOrAtlasOrMipmap instanceof TextureAtlasMipmapArray || imageArrayOrAtlasOrMipmap instanceof TextureArrayMipmapArray)) { // TextureLevelMipmapArray
            gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        }
    }

    setupTextureArray(
        imageArrayOrAtlasOrMipmap: TextureAtlas | TextureArray | TextureAtlasMipmapArray | TextureArrayMipmapArray,
        usePixelArtSettings: boolean,
        flipTexturesY: boolean
    ) : WebGLTexture {
        // Create and set up a texture array
        const textureArray = this.createAndSetupTextureArray(usePixelArtSettings);
        const largestImageArrayOrAtlas: TextureLevel =
            (imageArrayOrAtlasOrMipmap instanceof TextureAtlasMipmapArray || imageArrayOrAtlasOrMipmap instanceof TextureArrayMipmapArray) // TextureLevelMipmapArray
                ? imageArrayOrAtlasOrMipmap.getMipmapLevel(0)
                : imageArrayOrAtlasOrMipmap;

        const width = largestImageArrayOrAtlas.getTextureWidth();
        const height = largestImageArrayOrAtlas.getTextureHeight();
        const depth = largestImageArrayOrAtlas.getNumTextureLayers();

        const { numAllocatedMipmaps } = this.allocateTextureArrayStorage(textureArray, width, height, depth, usePixelArtSettings);
        this.uploadTextureArray(textureArray, imageArrayOrAtlasOrMipmap, usePixelArtSettings, flipTexturesY, numAllocatedMipmaps);
        return textureArray;
    }

    bindTextureArrayToUnit(textureArray: WebGLTexture,
                           glsl_location: string,
                           texture_unit_location_index: number) : void {
        const gl = this.gl;

        gl.useProgram(this.program);

        // TODO: type and bound checking`

        const u_image_location = this.getUniformLocation(glsl_location);

        // Bind the texture array to texture unit at texture_unit_location_index
        gl.activeTexture(gl.TEXTURE0 + texture_unit_location_index);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);

        // Bind texture array to texture unit at texture_unit_location_index
        this.bind1UniformIntsToUnit(texture_unit_location_index, glsl_location);
    }

    getUniformLocation(uniformName: string) : WebGLUniformLocation {
        const gl = this.gl;
        const location = gl.getUniformLocation(this.program, uniformName);
        if (location === null) {
            const msg = `Failed to get image location: ${uniformName} (location is invalid or unused)`;
            this.throwError(msg);
        }
        return location;
    }

    bind1UniformIntsToUnit(a: number, uniformLocation: string) : void {
        const gl = this.gl;

        // Get the uniform location in the shader
        const u_uniform_location = this.getUniformLocation(uniformLocation);

        // Pass the screen size to the shader
        gl.uniform1i(u_uniform_location, a);
    }

    bind1UniformFloatsToUnit(a: number, uniformLocation: string) : void {
        const gl = this.gl;

        // Get the uniform location in the shader
        const u_uniform_location = this.getUniformLocation(uniformLocation);

        // Pass the screen size to the shader
        gl.uniform1f(u_uniform_location, a);
    }

    bind2UniformFloatsToUnit(a: number, b: number, uniformLocation: string) : void {
        const gl = this.gl;

        // Get the uniform location in the shader
        const u_uniform_location = this.getUniformLocation(uniformLocation);

        // Pass the screen size to the shader
        gl.uniform2f(u_uniform_location, a, b);
    }

    bindUniformBoolToUnit(value: boolean, uniformLocation: string): void {
        this.bind1UniformIntsToUnit(value ? 1 : 0, uniformLocation);
    }

    computeLodLevel(renderedCellsX: number,
                    renderedCellsY: number,
                    textureTilesPerCellX: number,
                    textureTilesPerCellY: number) : number {
        // How many texture tiles will be rendered
        const renderedTextureTilesX = renderedCellsX * textureTilesPerCellX;
        const renderedTextureTilesY = renderedCellsY * textureTilesPerCellY;

        // Compute LOD using log2
        const lodLevel = Math.log2(Math.max(renderedTextureTilesX, renderedTextureTilesY));
        return lodLevel;
    }

    createShader(type: number, source: string) : WebGLShader {
        const gl = this.gl;

        const shader = gl.createShader(type);
        if (shader === null || shader === undefined) {
            this.throwError("Failed to create shader.");
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }

        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);

        this.throwError("Failed to create shader.");
    }

    createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
        const gl = this.gl;

        const program = gl.createProgram();
        if (program === null || program === undefined) {
            this.throwError("Failed to create program.");
        }
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }

        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);

        this.throwError("Failed to create program.");
    }

    setRectangle(
        positionBuffer: WebGLBuffer,
        x: number,
        y: number,
        width: number,
        height: number
    ) : void {
        const gl = this.gl;

        const x1 = x;
        const x2 = x + width;
        const y1 = y;
        const y2 = y + height;

        // Bind the position buffer so gl.bufferData that will be called
        // in setRectangle puts data in the position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        const positions = new Float32Array([
            x1, y1,
            x2, y1,
            x1, y2,
            x1, y2,
            x2, y1,
            x2, y2
        ])

        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    }

    drawRectangles() {
        // TODO
    }

    clearCanvas() {
        // TODO
    }

    async copyImageBlob(options?: ImageEncodeOptions) : Promise<Blob> {
        try {
            return this.canvas.convertToBlob(options);
        } catch (err) {
            console.error(`Failed to get image blob`, err);
            throw err;
        }
    }
    async copyImageArrayBuffer(options?: ImageEncodeOptions) : Promise<ArrayBuffer> {
        try {
            const blob = await this.copyImageBlob(options);
            return blob.arrayBuffer();
        } catch (err) {
            console.error(`Failed to get image blob array buffer`, err);
            throw err;
        }
    }
    transferImageBitmap() : ImageBitmap {
        try {
            return this.canvas.transferToImageBitmap();
        } catch (err) {
            console.error(`Failed to get image bitmap`, err);
            throw err;
        }
    }

    resizeCanvas(width: number, height: number) : void {
        this.canvas.width = width;
        this.canvas.height = height;
    }
}