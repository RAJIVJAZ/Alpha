import { setupTestEnv } from '@foodgrid/utils/testing';

// no Razorpay keys: the signature-compatible sandbox gateway is used
setupTestEnv({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' });
