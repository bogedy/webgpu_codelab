
// test that we're reading right
document.body.insertAdjacentHTML('afterbegin', '<p>The script is being read correctly.</p>');

const GRID_SIZE = 32;

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

const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
}),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })];
for (let i = 0; i < cellStateArray.length; i++) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

for (let i = 0; i < cellStateArray.length; i++) {
  cellStateArray[i] = i%2;
}
device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);
/*
Note: As the above code snippet shows, once you call writeBuffer(), you don't have to preserve the contents of the source TypedArray any more. At that point, the contents have been copied and the GPU buffer is guaranteed to receive the data as it was at the time the call is made. This allows you to reuse the JavaScript object for the next upload, which saves on memory!
*/
const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `

    @group(0) @binding(0) var<uniform> grid: vec2<f32>;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    struct VertexInput {
      @location(0) pos: vec2<f32>,
      @builtin(instance_index) instance: u32,
    };

    struct VertexOutput {
      @builtin(position) pos: vec4<f32>,
      @location(0) cell: vec2f,
    };

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
      
      let i = f32(input.instance);
      let cell = vec2f(i % grid.x, floor(i / grid.x));
      let state = f32(cellState[input.instance]);

      let cellOffset = cell / grid * 2;
      let gridPos = (input.pos*state + 1) / grid - 1 + cellOffset;

      var output: VertexOutput;
      output.pos = vec4f(gridPos, 0, 1);
      output.cell = cell;
      return output;
    }

    @fragment
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
      let c = input.cell / grid;
      return vec4f(1-c.x, c, .5);
}
  `
});

// Create the bind group layout and pipeline layout.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [{
    binding: 0,
    // Add GPUShaderStage.FRAGMENT here if you are using the `grid` uniform in the fragment shader.
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    buffer: {} // Grid uniform buffer
  }, {
    binding: 1,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage"} // Cell state input buffer
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage"} // Cell state output buffer
  }]
});

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [ bindGroupLayout ],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
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

const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

const bindGroups = [device.createBindGroup({
  label: "Cell renderer bind group A",
  //layout: cellPipeline.getBindGroupLayout(0), // this 0 corresponds to the @group(0) in the shader code
  layout: bindGroupLayout,
  entries: [{
    binding: 0, // this 0 corresponds to the @binding(0) in the shader code
    resource: {buffer: uniformBuffer,},
  },{
    binding: 1,
    resource: {buffer: cellStateStorage[0],}
    },{
    binding: 2,
    resource: {buffer: cellStateStorage[1],}
    }
    ],}), // immutable, but you can mutate the data in the uniformArray
device.createBindGroup({
  label: "Cell renderer bind group B",
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer }
  }, {
    binding: 1,
    resource: { buffer: cellStateStorage[1] }
  }, {
    binding: 2,
    resource: { buffer: cellStateStorage[0] }
  }],
})
];

context.configure({
  device: device,
  format: canvasFormat,
});

const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
let step = 0; // Track how many simulation steps have been run

/* I suppose that everything in here happens fast enough
the memory has already been copied to the GPU with buffer writes,
we just toggle where to look */
function updateGrid() {
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  // compute work goes here...
  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();

  step++;

  const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0.4, b: 0.4, a: 1.0 },
        storeOp: "store",
      }]
    });

  pass.setPipeline(cellPipeline);
  pass.setVertexBuffer(0, vertextBuffer);

  pass.setBindGroup(0, bindGroups[step % 2]); 
  // The 0 passed as the first argument corresponds to the @group(0) in the shader code. You're saying that each @binding that's part of @group(0) uses the resources in this bind group.

  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices, 2 floats each

  pass.end();

  // the above doesn't do anything yet, these are just recorded commands to now execute below:

  // opaque handle to the recorded commands
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
  // can be done in one line because you can no longer re-use the commandBuffer after it has been submitted
  }

const WORKGROUP_SIZE = 8;

// Create the compute shader that will process the simulation.
const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    fn cell_index(cell: vec2u) -> u32 {
      return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cell_index(vec2(x, y))];
    }

    @compute
    @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {

      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                        cellActive(cell.x+1, cell.y) +
                        cellActive(cell.x+1, cell.y-1) +
                        cellActive(cell.x, cell.y-1) +
                        cellActive(cell.x-1, cell.y-1) +
                        cellActive(cell.x-1, cell.y) +
                        cellActive(cell.x-1, cell.y+1) +
                        cellActive(cell.x, cell.y+1);

      let i = cell_index(cell.xy);
      switch activeNeighbors {
        case 2: { // Active cells with 2 neighbors stay active.
          cellStateOut[i] = cellStateIn[i];
        }
        case 3: { // Cells with 3 neighbors become or stay active.
          cellStateOut[i] = 1;
        }
        default: { // Cells with < 2 or > 3 neighbors become inactive.
          cellStateOut[i] = 0;
        }
      }
    }`
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  }
});

setInterval(updateGrid, UPDATE_INTERVAL);

export { };
