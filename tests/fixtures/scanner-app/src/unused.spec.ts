export class LedgerMock {
  connect(): void {}
  from(_table: string): this {
    return this;
  }
  where(_column: string): this {
    return this;
  }
  jobNames(): string[] {
    return [];
  }
}
