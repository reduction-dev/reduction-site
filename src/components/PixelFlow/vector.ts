import { Position } from "./pixel";

export class Vector {
  constructor(public x: number, public y: number) {}

  static between(p1: Position, p2: Position) {
    return new Vector(p2.x - p1.x, p2.y - p1.y);
  }

  public magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  moveTowards(position: { x: number, y: number }, speed: number): { x: number, y: number } {
    const distance = this.magnitude();
    if (distance === 0) return position;
    
    return {
      x: position.x + (this.x / distance) * speed,
      y: position.y + (this.y / distance) * speed
    };
  }

  isZero(): boolean {
    return this.magnitude() < 2;
  }
}
