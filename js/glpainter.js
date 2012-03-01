var FRAG_SHADER_8 = 0;
var FRAG_SHADER_16 = 1;
var FRAG_SHADER_RGB_8 = 2;

function ImageSlice(file, texture, rs, ri, alpha) {
    this.file = file;
    this.texture = texture;
    this.rs = rs;
    this.ri = ri;
    this.alpha = alpha;
}

function GLPainter() {
    this.gl;
    this.shaderProgram;
    this.mvMatrix = mat4.create();
    this.pMatrix = mat4.create();
    this.squareVertexPositionBuffer;
    this.vertexIndexBuffer;
    //this.THE_TEXTURE;
    this.CLUT_TEXTURE;

    this.ww = 200;
    this.wl = 40;
    this.clut_r;
    this.clut_g;
    this.clut_b;
    this.ztrans = -1;
    this.xtrans = 0.0;
    this.ytrans = 0.0;
    this.fovy = 90;
    this.scale = 1;
    this.pan = [0,0];

    this.images = [];
    this.shaderPrograms = {};

}

GLPainter.prototype.is_supported = function() {
    return window.WebGLRenderingContext;
}

GLPainter.prototype.fuse_files = function(file1, file2, alpha) {
    this.images.length = 0;
    this.images.push(new ImageSlice(file1,
                                    this.file_to_texture(file2),
                                    file2.RescaleSlope,
                                    file2.RescaleIntercept,
                                    1.0));
    this.images.push(new ImageSlice(file2,
                                    this.file_to_texture(file1),
                                    file1.RescaleSlope,
                                    file1.RescaleIntercept,
                                    alpha));
    this.rows = file1.Rows;
    this.columns = file1.Columns;
}

GLPainter.prototype.set_file = function(dcmfile) {
    this.images = [new ImageSlice(dcmfile,
                                  this.file_to_texture(dcmfile), 
                                  dcmfile.RescaleSlope, 
                                  dcmfile.RescaleIntercept,
                                  1.0)];
    this.rows = dcmfile.Rows;
    this.columns = dcmfile.Columns;
    //this.THE_TEXTURE = this.file_to_texture(dcmfile);
}

GLPainter.prototype.file_to_texture = function(dcmfile) {
    var internalFormat;
    switch(jQuery.trim(dcmfile.PhotometricInterpretation)) {
    case "MONOCHROME1":
        // TODO: MONOCHROME1 should use inverse cluts.
    case "MONOCHROME2":
        if(dcmfile.BitsStored <= 8) {
            internalFormat = this.gl.LUMINANCE;
        } else {
            internalFormat = this.gl.LUMINANCE_ALPHA;
        }
        break;
    case "RGB":
        internalFormat = this.gl.RGB;
        break;
    default:
        alert("Unknown Photometric Interpretation" + dcmfile.PhotometricInterpretation + "!");
        return;
    }

    var texture = this.gl.createTexture(); 
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);  
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(this.gl.TEXTURE_2D,       // target
                       0,                        // level
                       internalFormat,           // internalformat
                       dcmfile.Columns,          // width
                       dcmfile.Rows,             // height 
                       0,                        // border
                       internalFormat,           // format
                       this.gl.UNSIGNED_BYTE,    // type
                       Uint8Array(dcmfile.PixelData.buffer, dcmfile.PixelData.byteOffset)); // data
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
                  
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    return texture;
}


GLPainter.prototype.set_scale = function(scale) {
    this.scale = Math.min(Math.max(scale, 0.1), 10.0);
    this.draw_image();
}

GLPainter.prototype.get_scale = function(scale) {
    return this.scale;
}

GLPainter.prototype.reset_scale = function(scale) {
    this.scale = 1.0;
}

GLPainter.prototype.set_pan = function(panx, pany) {
    this.pan[0] = panx;
    this.pan[1] = pany;
    this.draw_image();
}

GLPainter.prototype.get_pan = function() {
    return this.pan;
}

GLPainter.prototype.reset_pan = function() {
    this.pan[0] = 0.0;
    this.pan[1] = 0.0;
}

GLPainter.prototype.set_cluts = function(clut_r, clut_g, clut_b) {
    this.clut_r = clut_r;
    this.clut_g = clut_g;
    this.clut_b = clut_b;
    if(!this.gl)
        return;

    // Re-pack as rgb
    var rgb_clut = new Uint8Array(256*3);
    for(var i=0;i<256;++i) {
        rgb_clut[i*3] = this.clut_r[i];
        rgb_clut[i*3 + 1] = this.clut_g[i];
        rgb_clut[i*3 + 2] = this.clut_b[i];
    }

    this.CLUT_TEXTURE = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.CLUT_TEXTURE);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(this.gl.TEXTURE_2D,       // target
                       0,                        // level
                       this.gl.RGB,              // internalformat
                       256,                      // width
                       1,                        // height 
                       0,                        // border
                       this.gl.RGB,             // format
                       this.gl.UNSIGNED_BYTE,    // type
                       rgb_clut);                // data
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
}

GLPainter.prototype.set_windowing = function(wl, ww) {
    this.ww = ww;
    this.wl = wl;
    this.draw_image();
}
GLPainter.prototype.get_windowing = function() {
    return [this.wl, this.ww];
}

GLPainter.prototype.unproject = function(canvas_pos) {
    var viewportArray = [
        0, 0, this.gl.viewportWidth, this.gl.viewportHeight
    ];
    
    var projectedPoint = [];
    var unprojectedPoint = [];
    
    var flippedmvMatrix = mat4.create();

    mat4.identity(flippedmvMatrix);
    mat4.translate(flippedmvMatrix, [this.pan[0], this.pan[1], -1]);
    mat4.scale(flippedmvMatrix, [this.scale,this.scale,this.scale]);

    // Hack to fit image if height is greater than width
    if(this.canvas.height > this.canvas.width) {
        var canvas_scale = this.canvas.width/this.canvas.height;
        mat4.scale(flippedmvMatrix, [canvas_scale,canvas_scale,canvas_scale]);
    }

    GLU.project(
        0,0,0,
        flippedmvMatrix, this.pMatrix,
        viewportArray, projectedPoint);
    
    var successFar = GLU.unProject(
        canvas_pos[0], canvas_pos[1], projectedPoint[2], //windowPointX, windowPointY, windowPointZ,
        flippedmvMatrix, this.pMatrix,
        viewportArray, unprojectedPoint);

    return unprojectedPoint;
}

GLPainter.prototype.image_coords_to_row_column = function(pt) {
    return [Math.round((pt[0]+1)/2*this.columns), Math.round((pt[1]+1)/2*this.rows)]
}

GLPainter.prototype.unproject_row_column = function(canvas_pos) {
    var unprojectedPoint = this.unproject(canvas_pos);
    return image_coords_to_row_column(unprojectedPoint);;
}

GLPainter.prototype.update_projection_matrix = function() {
    mat4.perspective(this.fovy, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0, this.pMatrix);
    mat4.identity(this.mvMatrix);
    mat4.translate(this.mvMatrix, [this.pan[0], -this.pan[1], -1]);
    mat4.scale(this.mvMatrix, [this.scale,this.scale,this.scale]);

    // Hack to fit image if height is greater than width
    if(this.canvas.height > this.canvas.width) {
        var canvas_scale = this.canvas.width/this.canvas.height;
        mat4.scale(this.mvMatrix, [canvas_scale,canvas_scale,canvas_scale]);
    }
}

GLPainter.prototype.draw_image = function() {
    this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    //this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);

    this.update_projection_matrix();
    for(var imgidx in this.images) {
        var image = this.images[imgidx];

        var shaderProgram;
        switch(jQuery.trim(image.file.get_element(dcmdict["PhotometricInterpretation"]).get_value())) {
            case "MONOCHROME1":
                // TODO: MONOCHROME1 should use inverse cluts.
            case "MONOCHROME2":
                if(image.file.get_element(dcmdict["BitsStored"]).get_value() <= 8) {
                    shaderProgram = this.shaderPrograms[FRAG_SHADER_8];
                } else {
                    shaderProgram = this.shaderPrograms[FRAG_SHADER_16];
                }
                break;
            case "RGB":
                shaderProgram = this.shaderPrograms[FRAG_SHADER_RGB_8];
                break;
            default:
                alert("Unknown Photometric Interpretation" + image.file.get_element(dcmdict["PhotometricInterpretation"]).get_value() + "!");
                return;
        }
        this.gl.useProgram(shaderProgram);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
        this.gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, 
                               this.squareVertexPositionBuffer.itemSize, 
                               this.gl.FLOAT, 
                               false, 
                               0, 
                               0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
        this.gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, this.textureCoordBuffer.itemSize, this.gl.FLOAT, false, 0, 0);

        this.gl.activeTexture(this.gl.TEXTURE0);  
        this.gl.bindTexture(this.gl.TEXTURE_2D, image.texture);  
        this.gl.uniform1i(shaderProgram.samplerUniform, 0);

        // Clut texture
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.CLUT_TEXTURE);
        this.gl.uniform1i(shaderProgram.clutSamplerUniform, 1);

        this.set_matrix_uniforms(shaderProgram);
        this.set_window_uniforms(shaderProgram, image);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, this.vertexIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
    }


}

GLPainter.prototype.init = function(canvasid) {
    try {
        var canvas = document.getElementById(canvasid);
        this.gl = canvas.getContext("experimental-webgl");
        //this.gl = canvas.getContext("webgl");
        this.gl.viewportWidth = canvas.width;
        this.gl.viewportHeight = canvas.height;
        this.canvas = canvas;
    } catch (e) {
        alert("Failed to initialize GL-context");
        return;
    }

    this.init_shaders();
    this.init_buffers();
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    //this.gl.enable(this.gl.DEPTH_TEST);

    if (!this.gl) {
        alert("Could not initialise WebGL, sorry :-(");
        return false;
    }
    return true;
}

GLPainter.prototype.onresize = function() {
    this.gl.viewportWidth = this.canvas.clientWidth;
    this.gl.viewportHeight = this.canvas.clientHeight;
    this.draw_image();
}

GLPainter.prototype.compile_shader = function(str, shader_type) {

    shader = this.gl.createShader(shader_type);

    this.gl.shaderSource(shader, str);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        alert(this.gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;

}

GLPainter.prototype.init_shaders = function() {
    var fragmentShader8 = this.compile_shader(fragment_shader_8, this.gl.FRAGMENT_SHADER);
    var fragmentShader16 = this.compile_shader(fragment_shader_16, this.gl.FRAGMENT_SHADER);
    var fragmentShaderRGB8 = this.compile_shader(fragment_shader_rgb_8, this.gl.FRAGMENT_SHADER);
    var vertexShader = this.compile_shader(vertex_shader, this.gl.VERTEX_SHADER);

    this.shaderPrograms[FRAG_SHADER_8] = this.create_shader_program(fragmentShader8, vertexShader);
    this.shaderPrograms[FRAG_SHADER_16] = this.create_shader_program(fragmentShader16, vertexShader);
    this.shaderPrograms[FRAG_SHADER_RGB_8] = this.create_shader_program(fragmentShaderRGB8, vertexShader);
}

GLPainter.prototype.create_shader_program = function(fragshader, vertshader) {
    var shaderProgram = this.gl.createProgram();
    this.gl.attachShader(shaderProgram, vertshader);
    this.gl.attachShader(shaderProgram, fragshader);
    this.gl.linkProgram(shaderProgram);

    if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    shaderProgram.vertexPositionAttribute = this.gl.getAttribLocation(shaderProgram, "aVertexPosition");
    this.gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    shaderProgram.textureCoordAttribute = this.gl.getAttribLocation(shaderProgram, "aTextureCoord");  
    this.gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute); 

    shaderProgram.pMatrixUniform = this.gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.samplerUniform = this.gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.clutSamplerUniform = this.gl.getUniformLocation(shaderProgram, "uClutSampler");

    shaderProgram.wlUniform = this.gl.getUniformLocation(shaderProgram, "uWL");
    shaderProgram.wwUniform = this.gl.getUniformLocation(shaderProgram, "uWW");
    shaderProgram.riUniform = this.gl.getUniformLocation(shaderProgram, "uRI");
    shaderProgram.rsUniform = this.gl.getUniformLocation(shaderProgram, "uRS");
    shaderProgram.alphaUniform = this.gl.getUniformLocation(shaderProgram, "uAlpha");
    return shaderProgram;
}

GLPainter.prototype.set_matrix_uniforms = function(shaderProgram) {
    this.gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, this.pMatrix);
    this.gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, this.mvMatrix);
}

GLPainter.prototype.set_window_uniforms = function(shaderProgram, image) {
    this.gl.uniform1f(shaderProgram.wlUniform, this.wl);
    this.gl.uniform1f(shaderProgram.wwUniform, this.ww);
    this.gl.uniform1f(shaderProgram.rsUniform, image.rs);
    this.gl.uniform1f(shaderProgram.riUniform, image.ri);
    this.gl.uniform1f(shaderProgram.alphaUniform, image.alpha);
}

GLPainter.prototype.init_buffers = function() {
    this.squareVertexPositionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
    vertices = [
        -1.0,  -1.0,  0.0,
         1.0,  -1.0,  0.0,
         1.0,   1.0,  0.0,
        -1.0,   1.0,  0.0
    ];
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
    this.squareVertexPositionBuffer.itemSize = 3;
    this.squareVertexPositionBuffer.numItems = 4;
 
    // Texture coords
    this.textureCoordBuffer = this.gl.createBuffer();  
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);  
    
    var textureCoordinates = [  
        0.0,  0.0,  
        1.0,  0.0,  
        1.0,  1.0,  
        0.0,  1.0
    ];  
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(textureCoordinates),  
                  this.gl.STATIC_DRAW);
    this.textureCoordBuffer.itemSize = 2;
    this.textureCoordBuffer.numItems = 4;

    this.vertexIndexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
    var vertexIndices = [
        0, 1, 2, 0, 2, 3    
    ];
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(vertexIndices), this.gl.STATIC_DRAW);
    this.vertexIndexBuffer.itemSize = 1;
    this.vertexIndexBuffer.numItems = 6;
}

