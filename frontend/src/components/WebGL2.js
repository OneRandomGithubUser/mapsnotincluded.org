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

        
        loadImages([
            "/elementIdx8.png",
            "/temperature32.png",
            "/mass32.png",
        ], this.render.bind(this));
    }
    render(images) {
        const gl = this.gl;

        this.resizeCanvas(images[0].width, images[0].height);

        // Create a vertex and fragment shader program, in GLSL
        let vertexShaderSource = `#version 300 es

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

    let fragmentShaderSource = `#version 300 es
 
// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;
 
// our texture
uniform sampler2D u_image_elementIdx8;
uniform sampler2D u_image_temperature32;
uniform sampler2D u_image_mass32;
 
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
 
void main() {
    // Look up a color from the texture.
    vec4 color = texture(u_image_temperature32, v_texCoord);
    vec4 downPixelColor = texture_displacement_in_pixels(u_image_elementIdx8, v_texCoord, vec2pixels(vec2(0, -1)));
    outColor = vec4((color.rgb + downPixelColor.rgb)/2.0, 1);
}
`;

        // Use our boilerplate utils to compile the shaders and link into a program
        this.vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        this.fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = this.createProgram(this.vertexShader, this.fragmentShader);

        // look up where the vertex data needs to go.
        this.positionAttributeLocation = gl.getAttribLocation(this.program, "a_position");
        this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");

        // Create a buffer and put a single pixel space rectangle in
        // it (2 triangles)
        // Create a buffer and put three 2d clip space points in it
        let positionBuffer = gl.createBuffer();

        // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        var positions = [
            10, 20,
            80, 20,
            10, 30,
            10, 30,
            80, 20,
            80, 30,
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        // Create a vertex array object (attribute state)
        this.vao = gl.createVertexArray();

        // and make it the one we're currently working with
        gl.bindVertexArray(this.vao);

        // Turn on the attribute
        gl.enableVertexAttribArray(this.positionAttributeLocation);

        // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset);

        // provide texture coordinates for the rectangle.
        var texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0.0,  0.0,
            1.0,  0.0,
            0.0,  1.0,
            0.0,  1.0,
            1.0,  0.0,
            1.0,  1.0]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.texCoordAttributeLocation);
        var size = 2;          // 2 components per iteration
        var type = gl.FLOAT;   // the data is 32bit floats
        var normalize = false; // don't normalize the data
        var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        var offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            this.texCoordAttributeLocation, size, type, normalize, stride, offset)
        
        // create 2 textures
        var textures = [];
        var framebuffers = [];
        // TODO: gl.TEXTURE_2D_ARRAY
        
        for (var ii = 0; ii < images.length; ++ii) {
            var texture = this.createAndSetupTexture();
            textures.push(texture);
            
            // Upload the image into the texture.
            var mipLevel = 0;               // the largest mip
            var internalFormat = gl.RGBA;   // format we want in the texture
            var srcFormat = gl.RGBA;        // format of data we are supplying
            var srcType = gl.UNSIGNED_BYTE  // type of data we are supplying
            gl.texImage2D(gl.TEXTURE_2D,
                            mipLevel,
                            internalFormat,
                            srcFormat,
                            srcType,
                            images[ii]);
 
            // Create a framebuffer
            var fbo = gl.createFramebuffer();
            framebuffers.push(fbo);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            
            // Attach a texture to it.
            var attachmentPoint = gl.COLOR_ATTACHMENT0;
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, texture, mipLevel);
        }

        // this.resizeCanvasToDisplaySize(); // TODO: is this even relevant in an offscreen context?

        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Tell it to use our program (pair of shaders)
        gl.useProgram(this.program);

        // Bind the attribute/buffer set we want.
        gl.bindVertexArray(this.vao);

        // look up uniform locations
        this.resolutionUniformLocation = gl.getUniformLocation(this.program, "u_resolution");
        let u_image_elementIdx8_location = gl.getUniformLocation(this.program, "u_image_elementIdx8");
        let u_image_temperature32_location = gl.getUniformLocation(this.program, "u_image_temperature32");
        let u_image_mass32_location = gl.getUniformLocation(this.program, "u_image_mass32");
        
        // Pass in the canvas resolution so we can convert from
        // pixels to clip space in the shader
        gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

        // set which texture units to render with.
        // Tell the shader to get the texture from texture unit 0, unit 1
        gl.uniform1i(u_image_elementIdx8_location, 0);
        gl.uniform1i(u_image_temperature32_location, 1);
        gl.uniform1i(u_image_mass32_location, 1);
                        
        // Set each texture unit to use a particular texture.
        // make unit 0 the active texture unit
        // (i.e, the unit all other texture commands will affect.)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textures[0]);
        // make unit 1 the active texture unit
        gl.activeTexture(gl.TEXTURE0 + 1);
        gl.bindTexture(gl.TEXTURE_2D, textures[1]);
        gl.activeTexture(gl.TEXTURE0 + 2);
        gl.bindTexture(gl.TEXTURE_2D, textures[2]);

        // Calling gl.bindFramebuffer with null tells WebGL to render to the canvas instead of one of the framebuffers.
        this.setFramebuffer(null, gl.canvas.width, gl.canvas.height);
      
        
        // Bind the position buffer so gl.bufferData that will be called
        // in setRectangle puts data in the position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        
        // Set a rectangle the same size as the image.
        this.setRectangle(0, 0, images[0].width, images[0].height);
        
        // draw
        var primitiveType = gl.TRIANGLES;
        var offset = 0;
        var count = 6;
        gl.drawArrays(primitiveType, offset, count);

        console.log("Checking WebGL errors at the end of render():", gl.getError()); // TODO: more error reporting
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

        var texture = gl.createTexture();
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

    createShader(type, source) {
        const gl = this.gl;

        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
          return shader;
        }
       
        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl;

        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
          return program;
        }
       
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }
  
    setRectangle(x, y, width, height) {
        const gl = this.gl;

        var x1 = x;
        var x2 = x + width;
        var y1 = y;
        var y2 = y + height;
       
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