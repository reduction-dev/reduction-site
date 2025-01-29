export interface LayoutParams {
  width: number;
  height: number;
  rowSpacing: number;
  columnSpacing: number;
  boxSize: number;
  edgePadding: number;
}

const EDGE_PADDING = 5

export class Layout {
  #boxSize: number;
  #edgePadding: number;

  constructor(private params: LayoutParams) {
    this.#boxSize = params.boxSize
    this.#edgePadding = params.edgePadding
  }

  private calculateRow(items: number, row: number): { x: number, y: number }[] {
    const effectivePadding = this.#edgePadding + (this.#boxSize / 2);
    const availableWidth = this.params.width - (effectivePadding * 2);
    const spacing = availableWidth / (items - 1);

    // Use percentage-based vertical positioning
    let y;
    if (row === 0) {
      y = this.params.height * 0.25; // First row at 15%
    } else if (row === 1) {
      y = this.params.height * 0.58;  // Middle row at 50%
    } else {
      y = this.params.height * 0.9; // Last row at 85%
    }

    return Array.from({ length: items }, (_, i) => ({
      x: effectivePadding + (i * spacing),
      y
    }));
  }

  sourceRow(): { x: number, y: number }[] {
    return this.calculateRow(4, 0);
  }

  operatorRow(): { x: number, y: number }[] {
    return this.calculateRow(4, 1);
  }

  sinkPosition(): { x: number, y: number } {
    return {
      x: this.params.width / 2,
      y: this.params.height * 0.9 // Align with bottom row
    };
  }
}
