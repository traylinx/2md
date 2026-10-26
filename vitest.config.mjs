import { configDefaults } from 'vitest/config';
// Compatibility tests require their own credential-free, network-isolated launcher.
export default { test: { exclude: [...configDefaults.exclude, 'tests/compat/**', 'tests/capture/**'] } };
