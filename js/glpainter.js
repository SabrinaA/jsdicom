var FRAG_SHADER_8 = 0;
var FRAG_SHADER_16 = 1;

function GLPainter() {
    this.gl;
    this.shaderProgram;
    this.mvMatrix = mat4.create();
    this.pMatrix = mat4.create();
    this.squareVertexPositionBuffer;
    this.vertexIndexBuffer;
    this.THE_TEXTURE;

    this.ww = 200;
    this.wl = 40;
    this.ztrans = -1;
    this.xtrans = 0.0;
    this.ytrans = 0.0;
    this.fovy = 90;
    this.scale = 1;
    this.pan = [0,0];
}

GLPainter.prototype.is_supported = function() {
    return window.WebGLRenderingContext;
}

GLPainter.prototype.set_file = function(dcmfile) {
    var internalFormat;
    if(dcmfile.get_element(0x00280101).get_value() <= 8) {
        internalFormat = this.gl.LUMINANCE;
        // Change shader?
        if(this.shaderProgram.activeFragmentShader == FRAG_SHADER_16) {
            this.shaderProgram.activeFragmentShader = FRAG_SHADER_8;
            this.gl.detachShader(this.shaderProgram, this.shaderProgram.fragmentShader16bit);
            this.gl.detachShader(this.shaderProgram, this.shaderProgram.vertexShader);
            this.set_and_compile_shader(this.shaderProgram.fragmentShader8bit, 
                                        this.shaderProgram.vertexShader);
        }

    } else {
        internalFormat = this.gl.LUMINANCE_ALPHA;
        if(this.shaderProgram.activeFragmentShader == FRAG_SHADER_8) {
            this.shaderProgram.activeFragmentShader = FRAG_SHADER_16;
            this.gl.detachShader(this.shaderProgram, this.shaderProgram.fragmentShader8bit);
            this.gl.detachShader(this.shaderProgram, this.shaderProgram.vertexShader);
            this.set_and_compile_shader(this.shaderProgram.fragmentShader16bit, 
                                        this.shaderProgram.vertexShader);
        }
    }
    THE_TEXTURE = this.gl.createTexture(); 
    this.gl.bindTexture(this.gl.TEXTURE_2D, THE_TEXTURE);  
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(this.gl.TEXTURE_2D,  // target
                  0,                        // level
                  internalFormat,           // internalformat
                  dcmfile.columns,          // width
                  dcmfile.rows,             // height 
                  0,                        // border
                  internalFormat,           // format
                  this.gl.UNSIGNED_BYTE,    // type
                  dcmfile.pixel_data);      // data
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    
                  
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
}


GLPainter.prototype.set_scale = function(scale) {
    this.scale = Math.min(Math.max(scale, 0.1), 10.0);
    this.draw_image();
}

GLPainter.prototype.get_scale = function(scale) {
    return this.scale;
}

GLPainter.prototype.set_pan = function(panx, pany) {
    this.pan[0] = panx;
    this.pan[1] = pany;
    this.draw_image();
}

GLPainter.prototype.get_pan = function() {
    return this.pan;
}

GLPainter.prototype.set_cluts = function(r_clut, g_clut, b_clut) {
    // TODO: send cluts to shader as Uniform array
}

GLPainter.prototype.set_windowing = function(ww, wl) {
    this.ww = ww;
    this.wl = wl;
    this.draw_image();
}
GLPainter.prototype.get_windowing = function(ww, wl) {
    return [this.ww, this.wl];
}

GLPainter.prototype.draw_image = function() {
    this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    mat4.perspective(this.fovy, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0, this.pMatrix);
    mat4.identity(this.mvMatrix);
    mat4.translate(this.mvMatrix, [this.pan[0], -this.pan[1], -1]);
    mat4.scale(this.mvMatrix, [this.scale,this.scale,this.scale]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
    this.gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, 
                           this.squareVertexPositionBuffer.itemSize, 
                           this.gl.FLOAT, 
                           false, 
                           0, 
                           0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
    this.gl.vertexAttribPointer(this.shaderProgram.textureCoordAttribute, this.textureCoordBuffer.itemSize, this.gl.FLOAT, false, 0, 0);

    this.gl.activeTexture(this.gl.TEXTURE0);  
    this.gl.bindTexture(this.gl.TEXTURE_2D, THE_TEXTURE);  
    this.gl.uniform1i(this.shaderProgram.samplerUniform, 0);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
    this.set_matrix_uniforms();
    this.set_window_uniforms();
    this.gl.drawElements(this.gl.TRIANGLES, this.vertexIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);

}

GLPainter.prototype.init = function(canvasid) {
    try {
        var canvas = document.getElementById(canvasid);
        this.gl = canvas.getContext("experimental-webgl");
        this.gl.viewportWidth = canvas.width;
        this.gl.viewportHeight = canvas.height;
    } catch (e) {
    }
    
    this.init_shaders();
    this.init_buffers();
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.enable(this.gl.DEPTH_TEST);

    if (!this.gl) {
        alert("Could not initialise WebGL, sorry :-(");
        return false;
    }
    return true;
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
    var vertexShader = this.compile_shader(vertex_shader, this.gl.VERTEX_SHADER);

    this.shaderProgram = this.gl.createProgram();
    this.shaderProgram.fragmentShader8bit = fragmentShader8;
    this.shaderProgram.fragmentShader16bit = fragmentShader16;
    this.shaderProgram.vertexShader = vertexShader;
    this.shaderProgram.activeFragmentShader = FRAG_SHADER_16;
    this.set_and_compile_shader(fragmentShader16, vertexShader);
}

GLPainter.prototype.set_and_compile_shader = function(fragshader, vertshader) {
    this.gl.attachShader(this.shaderProgram, vertshader);
    this.gl.attachShader(this.shaderProgram, fragshader);
    this.gl.linkProgram(this.shaderProgram);

    if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    this.gl.useProgram(this.shaderProgram);

    this.shaderProgram.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");
    this.gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);
    this.shaderProgram.textureCoordAttribute = this.gl.getAttribLocation(this.shaderProgram, "aTextureCoord");  
    this.gl.enableVertexAttribArray(this.shaderProgram.textureCoordAttribute); 

    this.shaderProgram.pMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uPMatrix");
    this.shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
    this.shaderProgram.samplerUniform = this.gl.getUniformLocation(this.shaderProgram, "uSampler");
    this.shaderProgram.wlUniform = this.gl.getUniformLocation(this.shaderProgram, "uWL");
    this.shaderProgram.wwUniform = this.gl.getUniformLocation(this.shaderProgram, "uWW");
}

GLPainter.prototype.set_matrix_uniforms = function() {
    this.gl.uniformMatrix4fv(this.shaderProgram.pMatrixUniform, false, this.pMatrix);
    this.gl.uniformMatrix4fv(this.shaderProgram.mvMatrixUniform, false, this.mvMatrix);
}

GLPainter.prototype.set_window_uniforms = function() {
    this.gl.uniform1f(this.shaderProgram.wlUniform, this.wl);
    this.gl.uniform1f(this.shaderProgram.wwUniform, this.ww);
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

