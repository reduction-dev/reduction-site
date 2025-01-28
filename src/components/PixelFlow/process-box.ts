import { Pixel, Position } from './pixel';

export interface ProcessBox {
  inputPosition(): Position;
  draw(ctx: CanvasRenderingContext2D): void;
  emit?(pixel: Pixel): boolean;
  illuminate(): void;
  decayIllumination(): void;
}

class BaseBox implements ProcessBox {
  protected illuminationLevel = 0;
  
  constructor(
    protected position: Position,
    protected size: number
  ) {}

  public inputPosition(): Position {
    return this.position;
  }

  protected drawGlowingBox(ctx: CanvasRenderingContext2D): void {
    if (this.illuminationLevel <= 0) return;

    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${this.illuminationLevel * 1})`;
    ctx.shadowColor = `rgba(255, 255, 255, ${this.illuminationLevel * 0.4})`;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.position.x - this.size/2,
      this.position.y - this.size/2,
      this.size,
      this.size
    );
    ctx.restore();
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    this.drawGlowingBox(ctx);
  }

  public illuminate(): void {
    this.illuminationLevel += 0.25;
    this.illuminationLevel = Math.min(2, this.illuminationLevel);
  }

  public decayIllumination(): void {
    if (this.illuminationLevel > 0) {
      this.illuminationLevel = Math.max(0, this.illuminationLevel * 0.85);
    }
  }
}

export class SrBox extends BaseBox {}

export class OpBox extends BaseBox {
  private pixelCount = 0;

  public emit(pixel: Pixel): boolean {
    this.pixelCount++;
    return this.pixelCount % 4 === 0;
  }
}

export class SinkBox extends BaseBox {}
