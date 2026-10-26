if (!process.env.COMPAT_LAB_ROOT) throw new Error('Run npm run test:compat, not Vitest directly.');
export default {
  root: process.env.COMPAT_REPO,
  cacheDir: `${process.env.COMPAT_LAB_ROOT}/vite-cache`,
  test: {
    include: ['tests/compat/**/*.test.js'],
    setupFiles: ['tests/compat/support/setup.js'],
    pool: 'forks', maxWorkers: 1, fileParallelism: false,
    testTimeout: 10000, hookTimeout: 10000,
    reporters: ['default', 'json'],
    onConsoleLog(_log, type) { return type === 'stderr'; },
    outputFile: { json: `${process.env.COMPAT_LAB_ROOT}/results.json` },
  },
};
