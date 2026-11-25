import { apiGetPeople, apiGetPerson } from '../api';

export async function fetchOwnedSpacePeople() {
  try {
    const { people } = await apiGetPeople();
    return people || [];
  } catch {
    return [];
  }
}

export async function fetchOwnedSpacePerson(_userId, targetUsername) {
  if (!targetUsername) return null;
  try {
    const { person } = await apiGetPerson(targetUsername);
    return person || null;
  } catch {
    return null;
  }
}
