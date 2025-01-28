import { Pixel, COLORS, Stages } from './pixel';
import { SrBox, OpBox } from './process-box';

const PIXEL_SPEED = 4;
const PIXEL_SPACING = 20;
const PIXEL_SPAWN_INTERVAL = Math.round(PIXEL_SPACING / PIXEL_SPEED);

export class Scene {
  #srBoxes: SrBox[];
  #opBoxes: OpBox[];
  #finalBox: SrBox;
  #pixels: Pixel[];
  #canvas: HTMLCanvasElement;
  #frameCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas
    this.#pixels = []
    this.#frameCount = 0;

    this.#srBoxes = [
      new SrBox(160, 140, 40),
      new SrBox(280, 140, 40),
      new SrBox(400, 140, 40),
      new SrBox(520, 140, 40)
    ];

    this.#opBoxes = [
      new OpBox(160, 260, 40),
      new OpBox(280, 260, 40),
      new OpBox(400, 260, 40),
      new OpBox(520, 260, 40)
    ];

    this.#finalBox = new SrBox(340, 380, 60);
  }

  draw() {
    const ctx = this.#canvas.getContext('2d');
    if (!ctx) return;

    this.#frameCount += 1;

    // Clear the canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';  // Adjust alpha (0.3) for longer/shorter trails
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);

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
            const op = this.opForPixel(pixel);
            if (op.emit(pixel)) {
              pixel.target = this.#finalBox.inputPosition();
              pixel.stage = Stages.SINK;
            } else {
              return false;
            }
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
  public opForPixel(pixel: Pixel): OpBox {
    const opBoxIndex = {
      [COLORS.GREEN]: 0,
      [COLORS.YELLOW]: 1,
      [COLORS.RED]: 2,
      [COLORS.BLUE]: 3
    }[pixel.color] || 0;
    
    return this.#opBoxes[opBoxIndex];
  }
}
