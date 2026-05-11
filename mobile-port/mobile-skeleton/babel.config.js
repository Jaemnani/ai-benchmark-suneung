module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@mobile': './src',
        },
      },
    ],
    'react-native-reanimated/plugin', // 사용 시. 없으면 제거.
  ],
};
