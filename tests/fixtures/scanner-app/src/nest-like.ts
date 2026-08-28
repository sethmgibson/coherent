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
