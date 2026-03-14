export class BudgetEngine {
  private spent = 0;
  private cap: number | null;

  constructor(budget: string) {
    this.cap = budget === 'unlimited' ? null : parseFloat(budget);
  }

  get totalCost(): number { return this.spent; }

  addCost(amount: number): void { this.spent += amount; }

  isExceeded(): boolean {
    if (this.cap === null) return false;
    return this.spent > this.cap;
  }

  estimateScenarioCost(tokens: number, isFreeModel: boolean): number {
    if (isFreeModel) return 0;
    return (tokens / 1_000_000) * 0.15;
  }

  get remaining(): number | null {
    if (this.cap === null) return null;
    return Math.max(0, this.cap - this.spent);
  }
}
