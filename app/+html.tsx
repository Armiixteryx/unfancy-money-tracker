import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { webBrandForEnvironment } from "../src/platform/runtime/webBrand";
import { isDemoRuntime } from "../src/platform/runtime/demo";

export default function RootHtml({ children }: PropsWithChildren) {
  const brand = webBrandForEnvironment(process.env.EXPO_PUBLIC_ENV);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content={brand.themeColor} />
        {isDemoRuntime() ? <meta httpEquiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'" /> : null}
        <link rel="icon" href={brand.favicon} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={brand.appleTouchIcon} />
        <link rel="manifest" href={brand.manifest} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
