const focused = {
  system: 'workpad', readyPath: '/api/workflow', route: '/workflow/today',
  testMatch: '**/focused.spec.mjs', browserTimeout: 300000,
  scenarios: ['workpad.focused'],
  apiChecks: ['/api/workflow', '/api/workflow/preferences', '/api/workflow/days', '/api/workflow/fixed'],
  setup: { runtimeRequirements: ['authorized-dev'], fixtures: ['owned-workpad-day'], cleanupRequirements: ['clear-owned-workpad-day'] },
  backgroundValidation: 'NOT_RUN: Workpad has no scheduler acceptance. Tests use an initially empty, unique future day; latest-revision cleanup refuses unknown block IDs and restores only the dock preference field.'
};
const dogfood = {
  ...focused, testMatch: '**/dogfood.spec.mjs', browserTimeout: 600000,
  scenarios: ['workpad.dogfood'],
  backgroundValidation: focused.backgroundValidation + ' Dogfood is a separate track and must be invoked only after focused integrated DEV validation passes. New-image upload/new-note creation are excluded from shared DEV because those APIs have no deletion endpoint; existing read-only media/note references are exercised when present.'
};
export default { ...focused, tracks: { 'workpad-focused': focused, 'workpad-dogfood': dogfood } };
