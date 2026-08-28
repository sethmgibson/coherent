export interface ChargeGateway {
  charge(amount: number): Promise<number>;
}

export class StripeChargeGateway implements ChargeGateway {
  async charge(amount: number): Promise<number> {
    return amount;
  }
}

export interface UserRepository {
  findById(id: string): Promise<{ id: string } | undefined>;
}

export class PostgresUserRepository implements UserRepository {
  async findById(id: string): Promise<{ id: string } | undefined> {
    return { id };
  }
}
