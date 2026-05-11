const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * 모노레포에서 RN Metro는 기본적으로 mobile/node_modules만 본다.
 * 루트 node_modules에 hoist된 패키지를 찾도록 watchFolders 확장.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
