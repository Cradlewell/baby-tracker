// Settings from app.json, plus Google sign-in for iPhone once its client ID is known.
// Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (e.g. 1234-abc.apps.googleusercontent.com) for builds;
// the iPhone app then gets the URL scheme Google sends the user back to.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return config;
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
  return {
    ...config,
    plugins: [...(config.plugins || []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
  };
};
