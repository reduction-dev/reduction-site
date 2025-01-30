import { Pixel, COLORS } from "./pixel";
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
  #mainCtx: CanvasRenderingContext2D | null; 
  #pixelCtx: CanvasRenderingContext2D | null;
  #frameCount: number;
  #scaleFactor: number
  #canvasWidth: number;
  #canvasHeight: number;

  constructor(canvas: HTMLCanvasElement) {
    this.#scaleFactor = window.devicePixelRatio || 1;
    
    // Get initial canvas dimensions
    const htmlWidth = canvas.width;
    const htmlHeight = canvas.height;

    // Calculate scaled canvas dimensions
    this.#canvasWidth = htmlWidth * this.#scaleFactor;
    this.#canvasHeight = htmlHeight * this.#scaleFactor;
    
    // Possibly scale up the canvas dimensions
    canvas.width = this.#canvasWidth
    canvas.height = this.#canvasHeight
    
    // Reset display size to fit the original HTML element
    canvas.style.width = `${htmlWidth}px`;
    canvas.style.height = `${htmlHeight}px`;

    this.#mainCtx = canvas.getContext("2d");

    // Create pixel canvas
    const pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = canvas.width;
    pixelCanvas.height = canvas.height;
    pixelCanvas.style.width = `${htmlWidth}px`;
    pixelCanvas.style.height = `${htmlHeight}px`;
    this.#pixelCtx = pixelCanvas.getContext("2d");

    this.#pixels = [];
    this.#frameCount = 0;

    // Calculate responsive spacing based on canvas width
    const baseSpacing = Math.min(Math.max(canvas.width / 6, 80), 160) * this.#scaleFactor;

    const boxSize = 38 * this.#scaleFactor;

    const layout = new Layout({
      width: canvas.width,
      height: canvas.height,
      rowSpacing: baseSpacing,
      columnSpacing: baseSpacing,
      boxSize: boxSize,
      edgePadding: 20 * this.#scaleFactor,
    });

    const sinkPosition = layout.sinkPosition();

    this.#srBoxes = layout.sourceRow().map((pos) => new SrBox(pos, boxSize));

    this.#opBoxes = layout.operatorRow().map((pos) => new OpBox(pos, boxSize));

    this.#sinkBox = new SinkBox(sinkPosition, 60 * this.#scaleFactor, 48 * this.#scaleFactor);
  }

  draw() {
    if (!this.#mainCtx || !this.#pixelCtx) return;
    const mainCtx = this.#mainCtx;
    const pixelCtx = this.#pixelCtx;

    this.#frameCount += 1;

    // Clear the main canvas
    mainCtx.clearRect(0, 0, this.#canvasWidth, this.#canvasHeight);

    // Draw boxes on main canvas
    [...this.#srBoxes, ...this.#opBoxes, this.#sinkBox].forEach((box) => {
      box.draw(mainCtx)
      box.decayIllumination();
    });

    // Apply fade effect when clearing the pixel canvas
    pixelCtx.globalCompositeOperation = 'source-over';
    pixelCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
    pixelCtx.fillRect(0, 0, this.#canvasWidth, this.#canvasHeight);

    // Update and draw pixels
    this.#pixels = this.#pixels.filter((pixel) => {
      // Reroute pixels that arrived at their target
      if (pixel.didArrive()) {
        if (pixel.target instanceof SrBox) {
          pixel.target.illuminate(); // illuminate the sr box
          pixel.target = this.opForPixel(pixel); // set new op target
        } else if (pixel.target instanceof OpBox) {
          pixel.grow();
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
    mainCtx.drawImage(this.#pixelCtx.canvas, 0, 0);
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
          this.#srBoxes[i],
          this.#scaleFactor
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
