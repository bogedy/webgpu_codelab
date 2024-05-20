
// test that we're reading right
document.body.insertAdjacentHTML('afterbegin', '<p>The script is being read correctly. You should see a green square.</p>');


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
context.configure({
  device: device,
  format: canvasFormat,
});

const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
    colorAttachments: [{
       view: context.getCurrentTexture().createView(),
       loadOp: "clear",
       clearValue: { r: 0.0, g: 0.3, b: 0.0, a: 1.0 },
       storeOp: "store",
    }]
  });

pass.end();

// the above doesn't do anything yet, these are just recorded commands to now execute below:

// opaque handle to the recorded commands
const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);
// can be done in one line because you can no longer re-use the commandBuffer after it has been submitted

export { };
