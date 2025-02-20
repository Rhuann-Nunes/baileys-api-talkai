const tsConfigPaths = require('tsconfig-paths');
const { resolve } = require('path');

const baseUrl = resolve(__dirname, 'dist');
const cleanup = tsConfigPaths.register({
    baseUrl,
    paths: { '@/*': ['*'] }
});

// Cleanup when the module is unloaded
process.on('exit', cleanup); 