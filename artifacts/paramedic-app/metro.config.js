const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pdf-lib: Das "module"-Feld zeigt auf es/index.js, das tslib-Submodule
// importiert; auf Web bricht das Bundling mit einem Interop-Fehler
// ("Cannot destructure property '__extends'") und wirft die App aus dem
// Report-Screen. Das selbststaendige ESM-Bundle aus dist/ traegt seine
// Helfer inline und laeuft sauber. Bei einem pdf-lib-Upgrade pruefen, ob
// dist/pdf-lib.esm.js weiterhin existiert.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "pdf-lib" && platform === "web") {
    return {
      filePath: path.resolve(projectRoot, "node_modules/pdf-lib/dist/pdf-lib.esm.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
