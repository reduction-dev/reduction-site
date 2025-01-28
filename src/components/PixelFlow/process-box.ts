import { Position } from "./pixel";

export class ProcessBox {
  constructor(
    public x: number,
    public y: number,
    public size: number
  ) {}

  getCenter(): Position {
    return { x: this.x + this.size/2, y: this.y };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#444';
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}
