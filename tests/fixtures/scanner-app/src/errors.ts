export async function loadUser(id: string): Promise<string | null> {
  try {
    return await lookup(id);
  } catch {
    return null;
  }
}

export async function loadProfile(id: string): Promise<string | undefined> {
  try {
    return await lookup(id);
  } catch {
    return undefined;
  }
}

export async function loadOrLog(id: string): Promise<string> {
  try {
    return await lookup(id);
  } catch (error) {
    console.log(error);
    return "fallback";
  }
}

export async function loadAndIgnore(id: string): Promise<void> {
  try {
    await lookup(id);
  } catch (error) {
    console.log(error);
  }
}

export async function loadOrRethrow(id: string): Promise<string> {
  try {
    return await lookup(id);
  } catch (error) {
    throw error;
  }
}

export async function loadOrTranslate(id: string): Promise<string> {
  try {
    return await lookup(id);
  } catch (error) {
    throw new Error(`lookup failed: ${String(error)}`);
  }
}

async function lookup(id: string): Promise<string> {
  if (!id) throw new Error("missing");
  return id;
}
