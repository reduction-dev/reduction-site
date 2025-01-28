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

export type Stage = typeof Stages[keyof typeof Stages];

export class Pixel {
  x: number;
  y: number;
  color: string;
  id: number;
  speed: number;
  stage: Stage;
  target: Position;

  constructor(x: number, y: number, speed: number, target: Position) { 
    const colors = [COLORS.GREEN, COLORS.YELLOW, COLORS.RED, COLORS.BLUE];
    this.x = x;
    this.y = y;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.id = Math.random();
    this.speed = speed;
    this.stage = 0;
    this.target = target;
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;
    if (this.stage < 2) {
      ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    } else {
      ctx.fillRect(this.x - 4, this.y - 4, 8, 8);
    }
  }

  public vector(): Vector {
    return Vector.between({ x: this.x, y: this.y }, this.target);
  }

  public didArrive(): boolean {
    return this.vector().magnitude() < this.speed;
  }

  public move(): void {
    const nextPosition = this.vector().moveTowards(this, this.speed);
    this.x = nextPosition.x;
    this.y = nextPosition.y;
  }
}
