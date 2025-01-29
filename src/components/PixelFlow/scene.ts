import { Pixel, COLORS, Stages } from "./pixel";
import { SrBox, OpBox, SinkBox } from "./process-box";
import { Layout } from "./layout";

const PIXEL_SPEED = 2;
const PIXEL_SPACING = 20;
const PIXEL_SPAWN_INTERVAL = Math.round(PIXEL_SPACING / PIXEL_SPEED);

export class Scene {
  #srBoxes: SrBox[];
  #opBoxes: OpBox[];
  #sinkBox: SinkBox;
  #pixels: Pixel[];
  #mainCanvas: HTMLCanvasElement;
  #pixelCanvas: HTMLCanvasElement;
  #frameCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.#mainCanvas = canvas;
    this.#pixelCanvas = document.createElement("canvas");
    this.#pixelCanvas.width = canvas.width;
    this.#pixelCanvas.height = canvas.height;

    this.#pixels = [];
    this.#frameCount = 0;

    const layout = new Layout({
      width: canvas.width,
      height: canvas.height,
      rowSpacing: 120,
      columnSpacing: 120,
    });

    const sinkPosition = layout.sinkPosition();

    this.#srBoxes = layout.sourceRow().map((pos) => new SrBox(pos, 40));

    this.#opBoxes = layout.operatorRow().map((pos) => new OpBox(pos, 40));

    this.#sinkBox = new SinkBox(sinkPosition, 60);
  }

  draw() {
    const mainCtx = this.#mainCanvas.getContext("2d");
    const pixelCtx = this.#pixelCanvas.getContext("2d");
    if (!mainCtx || !pixelCtx) return;

    this.#frameCount += 1;

    // Clear the main canvas
    mainCtx.clearRect(0, 0, this.#mainCanvas.width, this.#mainCanvas.height);

    // Draw boxes on main canvas
    [...this.#srBoxes, ...this.#opBoxes, this.#sinkBox].forEach((box) => {
      box.draw(mainCtx)
      box.decayIllumination();
    });

    // Apply fade effect when clearing the pixel canvas
    pixelCtx.globalCompositeOperation = 'source-over';
    pixelCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
    pixelCtx.fillRect(0, 0, this.#pixelCanvas.width, this.#pixelCanvas.height);

    // Update and draw pixels
    this.#pixels = this.#pixels.filter((pixel) => {
      // Reroute pixels that arrived at their target
      if (pixel.didArrive()) {
        if (pixel.target instanceof SrBox) {
          pixel.target.illuminate(); // illuminate the sr box
          pixel.target = this.opForPixel(pixel); // set new op target
        } else if (pixel.target instanceof OpBox) {
          pixel.target.illuminate(); // illuminate the op box
          if (pixel.target.emit(pixel)) {
            pixel.target = this.#sinkBox;
          } else {
            return false;
          }
        } else if (pixel.target === this.#sinkBox) {
          this.#sinkBox.illuminate();
          return false; // Remove pixel
        }
      }

      // Draw pixel
      pixel.move();
      pixel.draw(pixelCtx);
      return true;
    });

    // Composite pixel canvas on top with transparency
    mainCtx.globalCompositeOperation = 'destination-over';
    mainCtx.drawImage(this.#pixelCanvas, 0, 0);
    mainCtx.globalCompositeOperation = 'source-over';

    if (this.#frameCount % PIXEL_SPAWN_INTERVAL === 0) {
      this.spawnPixels();
    }
  }

  // Spawn pixels above headed to sr boxes.
  public spawnPixels() {
    for (let i = 0; i < 4; i++) {
      this.#pixels.push(
        new Pixel(
          this.#opBoxes[i].inputPosition().x,
          -10,
          PIXEL_SPEED,
          this.#srBoxes[i]
        )
      );
    }
  }

  // Choose the op box that corresponds to the pixel's color.
  public opForPixel(pixel: Pixel): OpBox {
    const opBoxIndex =
      {
        [COLORS.GREEN]: 0,
        [COLORS.YELLOW]: 1,
        [COLORS.RED]: 2,
        [COLORS.BLUE]: 3,
      }[pixel.color] || 0;

    return this.#opBoxes[opBoxIndex];
  }
}
