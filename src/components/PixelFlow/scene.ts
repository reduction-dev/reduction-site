export interface Position {
  x: number;
  y: number;
}

export interface Pixel {
  x: number;
  y: number;
  color: string;
  id: number;
  speed: number;
  stage: number;
  target?: Position;
}

export const COLORS = {
  GREEN: '#4ade80',
  YELLOW: '#facc15',
  RED: '#f87171',
  BLUE: '#60a5fa'
};

const PIXEL_SPEED = 2;
const PIXEL_SPACING = 20;
const PIXEL_SPAWN_INTERVAL = PIXEL_SPACING / PIXEL_SPEED;

export class Box {
  constructor(public x: number, public y: number) {}

  getCenter(): Position {
    return { x: this.x + 20, y: this.y };
  }
}

export class Scene {
  #srBoxes: Box[];
  #opBoxes: Box[];
  #pixels: Pixel[];
  #canvas: HTMLCanvasElement;
  #frameCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas
    this.#pixels = []
    this.#frameCount = 0;

    this.#srBoxes = [
      new Box(160, 240),
      new Box(280, 240),
      new Box(400, 240),
      new Box(520, 240)
    ];

    this.#opBoxes = [
      new Box(160, 360),
      new Box(280, 360),
      new Box(400, 360),
      new Box(520, 360)
    ];
  }

  draw() {
    const ctx = this.#canvas.getContext('2d');

    this.#frameCount += 1;

    // Clear the canvas
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    // Draw boxes
    ctx.fillStyle = '#444';
    [...this.#srBoxes, ...this.#opBoxes].forEach(box => {
      ctx.fillRect(box.x, box.y, 40, 40);
    });
    ctx.fillRect(340, 480, 60, 60); // Final box

    // Update and draw pixels
    this.#pixels = this.#pixels.filter(pixel => {
      // Move pixel
      if (pixel.target !== undefined) {
        const dx = pixel.target.x - pixel.x;
        const dy = pixel.target.y - pixel.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 2) {
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
          pixel.x += (dx / distance) * pixel.speed;
          pixel.y += (dy / distance) * pixel.speed;
        }
      } else if (pixel.y < this.#srBoxes[0].y) {
        pixel.y += pixel.speed;
      } else {
        // Reached first box, set target
        const boxIndex = Math.floor((pixel.x - 140) / 120);
        pixel.target = { x: this.#srBoxes[boxIndex].x + 20, y: this.#srBoxes[boxIndex].y };
      }

      // Draw pixel
      ctx.fillStyle = pixel.color;
      if (pixel.stage < 2) {
        ctx.fillRect(pixel.x - 2, pixel.y - 2, 4, 4);
      } else {
        ctx.fillRect(pixel.x - 8, pixel.y - 8, 16, 16);
      }

      return true;
    });

    // Add new pixels
    const createPixel = (streamIndex: number): Pixel => {
      const colors = [COLORS.GREEN, COLORS.YELLOW, COLORS.RED, COLORS.BLUE];
      return {
        x: this.#opBoxes[streamIndex].getCenter().x,
        y: -10,
        color: colors[Math.floor(Math.random() * colors.length)],
        id: Math.random(),
        speed: PIXEL_SPEED,
        stage: 0
      };
    };

    if (this.#frameCount % PIXEL_SPAWN_INTERVAL === 0) {
      for (let i = 0; i < 4; i++) {
        this.#pixels.push(createPixel(i));
      }
    }
  }
}
