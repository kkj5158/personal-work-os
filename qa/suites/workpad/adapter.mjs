export default {
  system: 'workpad', readyPath: '/api/workflow', route: '/workflow/today',
  testMatch: '**/focused.spec.mjs', browserTimeout: 300000,
  scenarios: ['workpad.focused'],
  apiChecks: ['/api/workflow', '/api/workflow/preferences', '/api/workflow/days', '/api/workflow/fixed'],
  setup: { runtimeRequirements: ['authorized-dev'], fixtures: ['owned-workpad-day'], cleanupRequirements: ['clear-owned-workpad-day'] },
  backgroundValidation: 'NOT_RUN: Workpad has no scheduler acceptance. Tests use an initially empty, unique future day; latest-revision cleanup refuses unknown block IDs and restores only the dock preference field.'
};
