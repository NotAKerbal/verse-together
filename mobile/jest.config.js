// Unit, persistence and navigation tests. Shared web modules (../src, ../convex) are compiled with this app's
// Babel preset and resolve packages from this app's node_modules, as the Metro bundle does.
const path = require("path");
const expoPreset = require("jest-expo/jest-preset");

// Better Auth and its helpers ship ES modules as .mjs, which the preset's Babel transform (for .js/.ts) skips.
const babelTransform = expoPreset.transform["\\.[jt]sx?$"];

module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/__tests__"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/../src/$1",
  },
  modulePaths: [path.join(__dirname, "node_modules")],
  transform: { ...expoPreset.transform, "\\.mjs$": babelTransform },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|marked|convex|standard-navigation|@convex-dev/.*|better-auth|@better-auth/.*|@better-fetch/.*|better-call|nanostores|jose|defu|rou3|uncrypto|zod|@noble/.*)",
  ],
  testTimeout: 30000,
};
