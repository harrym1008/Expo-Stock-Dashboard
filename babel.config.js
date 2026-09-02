// Babel config: keep cache forever (app doesn't swap configs)
module.exports = function (api) {
  api.cache(true);
  return {
    // Only preset needed; pulls in React Native + Expo transforms
    presets: ['babel-preset-expo'],
  };
};
