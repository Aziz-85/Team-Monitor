/**
 * Type declaration for react-native when the package's types are not resolved.
 * Install with: npm install (in mobile-native).
 */
declare module 'react-native' {
  export const Platform: {
    OS: 'ios' | 'android' | 'windows' | 'macos' | 'web';
    select<T>(specifics: { ios?: T; android?: T; default?: T }): T;
  };
}
