# Bundled fonts

Runtime font assets are local and work offline. Expo Font loads the four explicit family names used by shared text and input components. If loading fails, the application remains usable with system fonts.

- Inter Regular, Medium, and Semibold: `@expo-google-fonts/inter` 0.4.2, https://github.com/expo/google-fonts/tree/master/font-packages/inter
- Fraunces Regular: `@expo-google-fonts/fraunces` 0.4.1, https://github.com/expo/google-fonts/tree/master/font-packages/fraunces

The TTF files were extracted from the corresponding npm release tarballs. The adjacent `*-LICENSE_FONT` files contain the font licenses; `*-LICENSE` files contain the package licenses. No font is fetched from a remote service at runtime.
