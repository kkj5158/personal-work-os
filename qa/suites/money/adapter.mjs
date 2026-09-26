import bridge from './bridge-adapter.mjs';
import web from './web-adapter.mjs';
export default {
  tracks: { 'money-batch4': bridge, 'money-web-v1-1': web },
  system: 'money',
  readyPath: '/api/money/accounts',
  route: '/money',
  scenarios: ['money.routes', 'money.filters-reload', 'money.account-dialog'],
  apiChecks: ['/api/money/accounts', '/api/money/categories', '/api/money/transactions?limit=1', '/api/money/connection-status'],
  backgroundValidation: 'NOT_RUN: read-only pilot disables money processing and absence backfill; worker-specific scheduler scenarios require an adapter extension'
};
