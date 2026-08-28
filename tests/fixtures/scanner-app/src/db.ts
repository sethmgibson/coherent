export interface UserRecord {
  id: string;
  name: string;
}

export const userRepo = {
  async findById(id: string): Promise<UserRecord> {
    return { id, name: id };
  },
};

export async function loadUsersNPlusOne(ids: string[]): Promise<UserRecord[]> {
  const rows: UserRecord[] = [];
  for (const id of ids) {
    rows.push(await userRepo.findById(id));
  }
  return rows;
}

export async function loadDashboard(userId: string): Promise<{ user: UserRecord; other: UserRecord }> {
  const user = await userRepo.findById(userId);
  const other = await userRepo.findById("stats");
  return { user, other };
}

export async function loadUserTwice(id: string): Promise<UserRecord> {
  const first = await userRepo.findById(id);
  const second = await userRepo.findById(id);
  return first.name === second.name ? first : second;
}

export async function loadThenUse(id: string): Promise<string> {
  const user = await userRepo.findById(id);
  const extra = await userRepo.findById(user.id);
  return extra.name;
}
