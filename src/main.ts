
// test that we're reading right
document.body.insertAdjacentHTML('afterbegin', '<p>The script is being read correctly. You should see a red square in a green square.</p>');


const canvas = document.querySelector("canvas")!;
// Your WebGPU code will begin here!

if (!navigator.gpu) {
throw new Error("WebGPU not supported on this browser.");
}
else {
console.log("WebGPU is supported!");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

const vertices = new Float32Array([
  // X  Y
  -0.8, -0.8, // Triangle 1 (Blue)
   0.8, -0.8,
   0.8,  0.8,

  -0.8, -0.8, // Triangle 2 (Red)
   0.8,  0.8,
  -0.8,  0.8,
]);

const vertextBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

// 0 is buffer offset
device.queue.writeBuffer(vertextBuffer, 0, vertices);


const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8, // per each vertex
  attributes: [{
    format: "float32x2",
    offset: 0, // "how many bytes into the vertex this particular attribute starts"
    shaderLocation: 0, // Position, see vertex shader
  }],
};

const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
    @vertex
    fn vertexMain(@location(0) pos: vec2f) -> 
      @builtin(position) vec4f {
      return vec4f(pos.x, pos.y, 0, 1);
    }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
      return vec4f(1, 0, 0, 1);
}
  `
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

context.configure({
  device: device,
  format: canvasFormat,
});

const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
    colorAttachments: [{
       view: context.getCurrentTexture().createView(),
       loadOp: "clear",
       clearValue: { r: 0.2, g: 1, b: 0, a: 1.0 },
       storeOp: "store",
    }]
  });

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertextBuffer);
pass.draw(vertices.length / 2); // 6 vertices, 2 floats each

pass.end();

// the above doesn't do anything yet, these are just recorded commands to now execute below:

// opaque handle to the recorded commands
const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
// can be done in one line because you can no longer re-use the commandBuffer after it has been submitted

export { };
