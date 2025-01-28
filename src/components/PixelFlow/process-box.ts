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
  protected targetIllumination = 0;
  
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
    // Update illumination in draw loop
    const diff = this.targetIllumination - this.illuminationLevel;
    this.illuminationLevel += diff * 0.2; // Adjust speed as needed
    
    this.drawGlowingBox(ctx);
  }

  public illuminate(): void {
    this.targetIllumination = Math.min(2, this.targetIllumination + 0.5);
  }

  public decayIllumination(): void {
    this.targetIllumination = Math.max(0, this.targetIllumination * 0.95);
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

export class SinkBox extends BaseBox {
  protected drawGlowingBox(ctx: CanvasRenderingContext2D): void {
    // Draw dark background
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.beginPath();
    ctx.ellipse(
      this.position.x,
      this.position.y + (this.size/1.9),
      this.size * 1.5, // width radius
      this.size * 0.8, // height radius
      0, // rotation
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px monospace';
    
    // Draw glow effect
    ctx.shadowColor = `rgba(255, 255, 255, ${this.illuminationLevel * 0.8})`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(255, 255, 255, ${this.illuminationLevel})`;
    
    // Draw the text
    ctx.fillText('Reduction', this.position.x, this.position.y);
    ctx.restore();
  }

  public illuminate(): void {
    this.targetIllumination = Math.min(1, this.targetIllumination + 0.05);
  }

  public decayIllumination(): void {
    this.targetIllumination = Math.max(0, this.targetIllumination * 0.995);
  }
}
