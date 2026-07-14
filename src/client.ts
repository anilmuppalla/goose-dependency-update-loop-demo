export interface User {
  id: string;
  name: string;
}

export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`https://api.example.test/users/${id}`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch user: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as User;
}
