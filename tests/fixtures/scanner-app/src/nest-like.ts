function Injectable(): ClassDecorator {
  return () => undefined;
}

function Controller(_path: string): ClassDecorator {
  return () => undefined;
}

@Injectable()
export class BillingService {
  total(): number {
    return 0;
  }
}

@Controller("/users")
export class UsersController {
  constructor(private readonly billing: BillingService) {}

  list(): string[] {
    return [String(this.billing.total())];
  }
}

interface LeasePort { release(): void }

class LocalLeaseStore {
  release(): void { console.log("release"); }
  private unusedPrivate(): void { console.log("unused"); }
}

export function runLease(): void {
  const lease: LeasePort = new LocalLeaseStore();
  lease.release();
}
