import path from 'node:path';
export default {
  system: 'calendar', readyPath: '/api/life-categories', route: '/calendar',
  testMatch: '**/quality.spec.mjs', browserTimeout: 600000,
  backendReadinessTimeout:180000,
  scenarios: [
    'calendar.operation-identity', 'calendar.lost-response-retry',
    'calendar.local-draft-autosave', 'calendar.category-recovery',
    'calendar.date-owned-review', 'calendar.short-block-day-week',
    'calendar.late-day-placement', 'calendar.rapid-navigation',
    'calendar.mode-restoration', 'calendar.seoul-today',
    'calendar.week-inactive-editor', 'calendar.nearby-state-conversion'
  ],
  apiChecks: ['/api/activity-categories', '/api/life-categories'],
  backgroundValidation: 'Calendar persistence and real pointer QA only. Unrelated schedulers disabled. DEV uses the canonical owner session provider; this does not certify Supabase JWT authentication.',
  setup:{fixtures:['ID-scoped-disposable-calendar-records'],runtime:[],cleanup:[]},
  async prepare(){return {};},
  async cleanup(ctx){
    await ctx.run('calendar-receipt-cleanup','java',['-cp',ctx.classpath,path.join(ctx.toolRoot,'qa/suites/calendar/CalendarReceiptCleanup.java'),path.join(ctx.dir,'calendar-operations.txt')],ctx.target,ctx.javaEnv,60000);
    return {status:'OWNED_CALENDAR_RECORDS_REMOVED',description:'Only registered disposable Calendar source IDs and their exact owner-scoped operation receipts were removed. No schema or existing user records changed.'};
  }
};
