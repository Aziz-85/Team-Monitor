/**
 * Type declaration for expo-constants when the package's types are not resolved.
 */
declare module 'expo-constants' {
  export interface ExpoConfig {
    version?: string;
    extra?: { eas?: { projectId?: string } };
  }
  const constants: {
    expoConfig?: ExpoConfig;
    manifest?: { version?: string };
  };
  export default constants;
}
