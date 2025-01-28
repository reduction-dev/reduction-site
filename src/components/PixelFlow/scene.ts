import { Pixel, COLORS, Stages } from './pixel';
import { ProcessBox } from './process-box';

const PIXEL_SPEED = 2;
const PIXEL_SPACING = 20;
const PIXEL_SPAWN_INTERVAL = PIXEL_SPACING / PIXEL_SPEED;

export class Scene {
  #srBoxes: ProcessBox[];
  #opBoxes: ProcessBox[];
  #finalBox: ProcessBox;
  #pixels: Pixel[];
  #canvas: HTMLCanvasElement;
  #frameCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas
    this.#pixels = []
    this.#frameCount = 0;

    this.#srBoxes = [
      new ProcessBox(160, 240, 40),
      new ProcessBox(280, 240, 40),
      new ProcessBox(400, 240, 40),
      new ProcessBox(520, 240, 40)
    ];

    this.#opBoxes = [
      new ProcessBox(160, 360, 40),
      new ProcessBox(280, 360, 40),
      new ProcessBox(400, 360, 40),
      new ProcessBox(520, 360, 40)
    ];

    this.#finalBox = new ProcessBox(340, 480, 60);
  }

  draw() {
    const ctx = this.#canvas.getContext('2d');
    if (!ctx) return;

    this.#frameCount += 1;

    // Clear the canvas
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    // Draw boxes
    [
      ...this.#srBoxes,
      ...this.#opBoxes, 
      this.#finalBox,
    ].forEach(box => box.draw(ctx));

    // Update and draw pixels
    this.#pixels = this.#pixels.filter(pixel => {
      // Reroute pixels that arrived at their target
      if (pixel.didArrive()) {
        switch (pixel.stage) {
          case Stages.SINK:
            return false; // Remove pixel
          case Stages.SOURCE:
            pixel.target = this.opForPixel(pixel).inputPosition();
            pixel.stage = Stages.SHUFFLE;
            break;
          case Stages.SHUFFLE:
            pixel.target = this.#finalBox.inputPosition();
            pixel.stage = Stages.SINK;
            break;
        }
      }

      // Draw pixel
      pixel.move();
      pixel.draw(ctx);
      return true;
    });

    if (this.#frameCount % PIXEL_SPAWN_INTERVAL === 0) {
      this.spawnPixels();
    }
  }
  
  // Spawn pixels above headed to sr boxes.
  public spawnPixels() {
    for (let i = 0; i < 4; i++) {
      this.#pixels.push(new Pixel(
        this.#opBoxes[i].inputPosition().x,
        -10,
        PIXEL_SPEED,
        this.#srBoxes[i].inputPosition()
      ));
    }
  }
  
  // Choose the op box that corresponds to the pixel's color.
  public opForPixel(pixel: Pixel): ProcessBox {
    const opBoxIndex = {
      [COLORS.GREEN]: 0,
      [COLORS.YELLOW]: 1,
      [COLORS.RED]: 2,
      [COLORS.BLUE]: 3
    }[pixel.color] || 0;
    
    return this.#opBoxes[opBoxIndex];
  }
}
