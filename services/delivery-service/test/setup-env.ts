import { setupTestEnv } from '@foodgrid/utils/testing';

// proof photos must sit under this media base (see isOwnProofUpload)
setupTestEnv({ CDN_BASE_URL: 'https://cdn.test' });
