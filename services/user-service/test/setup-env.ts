import { setupTestEnv } from '@foodgrid/utils/testing';

// email verification codes are returned in non-production responses, like OTP devCode
setupTestEnv({ OTP_EXPOSE_IN_RESPONSE: 'true' });
