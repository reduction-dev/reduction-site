import { ProcessBox } from "./process-box";
import { Vector } from "./vector";

export interface Position {
  x: number;
  y: number;
}

export const COLORS = {
  GREEN: '#4ade80',
  YELLOW: '#facc15',
  RED: '#f87171',
  BLUE: '#60a5fa'
};

export const Stages = {
  SOURCE: 0,
  SHUFFLE: 1,
  SINK: 2
} as const;

export class Pixel {
  x: number;
  y: number;
  color: string;
  id: number;
  speed: number;
  target: ProcessBox;
  size: number = 2;

  private lastPosition?: Position;

  constructor(x: number, y: number, speed: number, target: ProcessBox, scale: number) { 
    const colors = [COLORS.GREEN, COLORS.YELLOW, COLORS.RED, COLORS.BLUE];
    this.x = x;
    this.y = y;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.id = Math.random();
    this.speed = speed * scale;
    this.target = target;
    this.size = 2 * scale;
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;

    // Draw interpolated trail
    if (this.lastPosition) {
      const steps = Math.ceil(this.speed);
      const points = this.interpolatePositions(this.lastPosition, this, steps);
      
      points.forEach((pos, i) => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw current pixel
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }

  public grow(): void {
    this.size = this.size * 1.33333;
  }

  public vector(): Vector {
    return Vector.between({ x: this.x, y: this.y }, this.target.inputPosition());
  }

  public didArrive(): boolean {
    return this.vector().magnitude() < this.speed;
  }

  public move(): void {
    this.lastPosition = { x: this.x, y: this.y };
    const nextPosition = this.vector().moveTowards(this, this.speed);
    this.x = nextPosition.x;
    this.y = nextPosition.y;
  }

  private interpolatePositions(start: Position, end: Position, steps: number): Position[] {
    const points: Position[] = [];
    for (let i = 0; i <= steps; i++) {
      points.push({
        x: start.x + (end.x - start.x) * (i / steps),
        y: start.y + (end.y - start.y) * (i / steps)
      });
    }
    return points;
  }
}
