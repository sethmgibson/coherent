export function afterReturn(flag: boolean): number {
  if (flag) {
    return 1;
    return 2;
  }
  return 0;
}

export function hoistedVisit(): number {
  return visit();
  function visit(): number { return 1; }
  console.log("actually unreachable after hoisted function");
}

export function hoistedTypes(): Later {
  const value: Later = { count: 1 };
  return value;
  type Count = number;
  interface Later { count: Count }
}

export function hoistedVariable(): unknown {
  return binding;
  var binding = 1;
}
