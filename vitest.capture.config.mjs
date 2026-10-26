if (!process.env.COMPAT_LAB_ROOT) throw new Error('Run node scripts/test-capture.cjs');
export default {
  root: process.env.COMPAT_REPO,
  cacheDir: `${process.env.COMPAT_LAB_ROOT}/vite-capture-cache`,
  test: { include: ['tests/capture/**/*.test.js'], pool: 'forks', maxWorkers: 1,
    fileParallelism: false, testTimeout: 10000, hookTimeout: 10000,
    reporters: ['default', 'json'],
    outputFile: { json: `${process.env.COMPAT_LAB_ROOT}/results.json` } }
};
