import { beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lab = require('./lab.cjs');
beforeEach(() => lab.reset());
afterAll(() => lab.close());
