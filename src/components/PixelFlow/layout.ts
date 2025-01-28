export interface LayoutParams {
  width: number;
  height: number;
  rowSpacing: number;
  columnSpacing: number;
}

export class Layout {
  constructor(private params: LayoutParams) {}

  private calculateRow(items: number, row: number): { x: number, y: number }[] {
    const totalWidth = (items - 1) * this.params.columnSpacing;
    const startX = (this.params.width - totalWidth) / 2;
    const y = (row * this.params.rowSpacing) + this.params.rowSpacing;

    return Array.from({ length: items }, (_, i) => ({
      x: startX + (i * this.params.columnSpacing),
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
      y: this.params.rowSpacing * 3
    };
  }
}
