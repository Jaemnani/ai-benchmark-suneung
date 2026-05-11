module.exports = {
  root: true,
  extends: ['@react-native', 'prettier'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  },
  ignorePatterns: ['ios/', 'android/', 'build/', '.cxx/', 'node_modules/'],
};
