import { setupTestEnv } from '@foodgrid/utils/testing';

// the weather suite sets OPENWEATHER_API_KEY itself, so a developer's key never reaches the network
setupTestEnv({ OPENWEATHER_API_KEY: '' });
