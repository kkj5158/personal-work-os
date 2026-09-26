/** Adapters register cleanup immediately after creating a uniquely owned fixture. */
export class FixtureScope {
  #cleanup = [];
  own(cleanup) { this.#cleanup.push(cleanup); }
  async close() {
    const failures = [];
    for (const cleanup of this.#cleanup.toReversed()) { try { await cleanup(); } catch (e) { failures.push(e); } }
    if (failures.length) throw new AggregateError(failures, 'OWNED_FIXTURE_CLEANUP_FAILED');
  }
}
export async function apiJson(request, baseURL, endpoint, options = {}) {
  const response = await request.fetch(baseURL + endpoint, options);
  if (!response.ok()) throw new Error(`API ${options.method ?? 'GET'} ${endpoint}: HTTP ${response.status()}`);
  return response.status() === 204 ? undefined : response.json();
}
