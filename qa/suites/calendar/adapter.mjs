export default {
  system: 'calendar', readyPath: '/api/life-categories', route: '/calendar',
  testMatch: '**/quality.spec.mjs', browserTimeout: 600000,
  scenarios: [
    'calendar.operation-identity', 'calendar.lost-response-retry',
    'calendar.local-draft-autosave', 'calendar.category-recovery',
    'calendar.date-owned-review', 'calendar.short-block-day-week',
    'calendar.late-day-placement', 'calendar.rapid-navigation',
    'calendar.mode-restoration', 'calendar.seoul-today',
    'calendar.week-inactive-editor', 'calendar.nearby-state-conversion'
  ],
  apiChecks: ['/api/activity-categories', '/api/life-categories'],
  backgroundValidation: 'Calendar persistence and real pointer QA only. Unrelated schedulers disabled. DEV uses the canonical owner session provider; this does not certify Supabase JWT authentication.'
};
