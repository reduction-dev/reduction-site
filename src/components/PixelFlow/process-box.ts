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
    this.targetIllumination = Math.max(0, this.targetIllumination * 0.97);
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
  private readonly baseAlpha = 0.3;
  private fontSize: number;

  constructor(position: Position, size: number, fontSize: number) {
    super(position, size);
    this.illuminationLevel = this.baseAlpha;
    this.targetIllumination = this.baseAlpha;
    this.fontSize = fontSize;
  }

  protected drawGlowingBox(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, 1)`;
    ctx.shadowBlur = this.fontSize / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.beginPath();
    ctx.ellipse(
      this.position.x,
      this.position.y + (this.size/1.9),
      this.size * 1.5, // width radius
      this.size * 0.75, // height radius
      0, // rotation
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${this.fontSize}px monospace`;
    
    // Draw glow effect
    ctx.shadowColor = `rgba(255, 255, 255, ${this.illuminationLevel * 0.8})`;
    ctx.shadowBlur = this.fontSize / 5;

    const textAlpha = Math.max(this.baseAlpha, this.illuminationLevel);
    ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
    
    // Draw the text
    ctx.fillText('Reduction', this.position.x, this.position.y);
    ctx.restore();
  }

  public illuminate(): void {
    const increase = 0.07
    if (this.targetIllumination <= this.baseAlpha) {
      this.targetIllumination = this.baseAlpha + increase;
    } else {
      this.targetIllumination = Math.min(1, this.targetIllumination + increase);
    }
  }

  public decayIllumination(): void {
    this.targetIllumination = Math.max(this.baseAlpha, this.targetIllumination * 0.995);
  }
}
