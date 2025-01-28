import { Pixel, COLORS } from './pixel';
import { ProcessBox } from './process-box';
import { Vector } from './vector';

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
      // Move pixel
      const vector = Vector.between(pixel, pixel.target);

      if (pixel.vector().isZero()) {
        if (pixel.stage === 2) {
          return false; // Remove pixel
        }
        // Set new targets based on color and stage
        if (pixel.stage === 0) {
          const opBoxIndex = {
            [COLORS.GREEN]: 0,
            [COLORS.YELLOW]: 1,
            [COLORS.RED]: 2,
            [COLORS.BLUE]: 3
          }[pixel.color] || 0;
          
          pixel.target.x = this.#opBoxes[opBoxIndex].x + 20;
          pixel.target.y = this.#opBoxes[opBoxIndex].y;
          pixel.stage = 1;
        } else if (pixel.stage === 1) {
          pixel.target.x = 370;
          pixel.target.y = 510;
          pixel.stage = 2;
        }
      } else {
        const nextPosition = vector.moveTowards(pixel, pixel.speed);
        pixel.x = nextPosition.x;
        pixel.y = nextPosition.y;
      }

      // Draw pixel
      pixel.draw(ctx);

      return true;
    });

    if (this.#frameCount % PIXEL_SPAWN_INTERVAL === 0) {
      this.spawnPixels();
    }
  }
  
  public spawnPixels() {
    for (let i = 0; i < 4; i++) {
      this.#pixels.push(new Pixel(
        this.#opBoxes[i].getCenter().x,
        -10,
        PIXEL_SPEED,
        this.#srBoxes[i].getCenter()
      ));
    }
  }
}
