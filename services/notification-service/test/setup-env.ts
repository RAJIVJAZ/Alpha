import { setupTestEnv } from '@foodgrid/utils/testing';

// log-only providers, whatever a developer's .env selects
setupTestEnv({ PUSH_PROVIDER: 'console', SMS_PROVIDER: 'console', EMAIL_PROVIDER: 'console' });
