export default function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-transform-runtime', {
        helpers: true,
        regenerator: true,
      }],
      '@babel/plugin-transform-class-static-block',
    ],
  };
};