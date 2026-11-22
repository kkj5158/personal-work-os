import { apiClient } from "./client";
import { normalizeSpaceDefaults, SPACES, type SpaceDefaults } from "../spaceNavigation";

type Preference = { defaults: SpaceDefaults; revision: number };
type PreferenceResponse = { defaults?: Partial<Record<keyof SpaceDefaults, unknown>>; revision?: unknown };
const endpoint = "/api/pos/preferences/space-defaults";

function readPreference(value: PreferenceResponse | null | undefined): Preference {
  if (typeof value?.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("기본 Space 설정의 응답을 확인할 수 없습니다.");
  }
  return { defaults: normalizeSpaceDefaults(value.defaults), revision: value.revision };
}

export async function getSpaceDefaults(owner: string): Promise<Preference> {
  return readPreference(await apiClient.scoped(owner, endpoint));
}

export async function putSpaceDefaults(owner: string, preference: Preference): Promise<Preference> {
  const body = await apiClient.scoped<PreferenceResponse>(owner, endpoint, "PUT", preference);
  const response = readPreference(body);
  if (response.revision !== preference.revision + 1 ||
      SPACES.some(space => body.defaults?.[space.id] !== preference.defaults[space.id])) {
    throw new Error("기본 Space 설정의 저장 결과를 확인할 수 없습니다.");
  }
  return response;
}
