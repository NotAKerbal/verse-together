// The app reads the repository's own checked-in sources instead of copies: scripture bundles and art under
// public/, the guide index under content/, and pure TypeScript modules under src/ and convex/ shared with the
// web app. Those folders are watched, and every package import, wherever it comes from, resolves from this
// app's own node_modules, so the native bundle never depends on (or duplicates) the web app's install.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = ["public", "src", "convex", "content"].map((dir) => path.join(repoRoot, dir));
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];

const appAnchor = path.join(projectRoot, "package.json");
const insideApp = (file) => file.startsWith(projectRoot + path.sep);
const isBare = (name) => !name.startsWith(".") && !path.isAbsolute(name);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The web modules' "@/lib/…" alias points at the repository's src/.
  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(context, path.join(repoRoot, "src", moduleName.slice(2)), platform);
  }
  if (isBare(moduleName) && !insideApp(context.originModulePath)) {
    return context.resolveRequest({ ...context, originModulePath: appAnchor }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
