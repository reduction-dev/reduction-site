import { Pixel, Position } from './pixel';

export interface ProcessBox {
  inputPosition(): Position;
  draw(ctx: CanvasRenderingContext2D): void;
  emit?(pixel: Pixel): boolean;
}

export class SrBox implements ProcessBox {
  constructor(
    private x: number,
    private y: number,
    private size: number
  ) {}

  public inputPosition(): Position {
    return { x: this.x, y: this.y };
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#666';
    ctx.strokeRect(
      this.x - this.size/2,
      this.y - this.size/2,
      this.size,
      this.size
    );
  }
}

export class OpBox implements ProcessBox {
  private pixelCount = 0;

  constructor(
    private x: number,
    private y: number,
    private size: number
  ) {}

  public inputPosition(): Position {
    return { x: this.x, y: this.y };
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#666';
    ctx.strokeRect(
      this.x - this.size/2,
      this.y - this.size/2,
      this.size,
      this.size
    );
  }

  public emit(pixel: Pixel): boolean {
    this.pixelCount++;
    return this.pixelCount % 4 === 0;
  }
}
