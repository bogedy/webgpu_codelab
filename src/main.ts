const canvas = document.querySelector("canvas")!;
// Your WebGPU code will begin here!
const ctx = canvas.getContext('2d')!;
if (!navigator.gpu) {
throw new Error("WebGPU not supported on this browser.");
}
else {
console.log("WebGPU is supported!");
}



ctx.fillStyle = 'green';
ctx.fillRect(10, 10, 150, 100);