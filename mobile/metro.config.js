const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The web app one level up has its own node_modules (React 19.3); keep this bundle isolated.
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules")];

module.exports = config;
