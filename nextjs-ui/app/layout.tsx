import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeBootstrapScript = `
(function(){
  var SCHEMES = ['zinc-indigo','slate-sky','stone-amber','neutral-emerald','gray-rose','zinc-violet'];
  try {
    var t = localStorage.getItem('warren:theme');
    if (t !== 'light') document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
  try {
    var s = localStorage.getItem('warren:scheme');
    if (!s || SCHEMES.indexOf(s) === -1) s = 'zinc-indigo';
    document.documentElement.setAttribute('data-scheme', s);
  } catch (e) {
    document.documentElement.setAttribute('data-scheme', 'zinc-indigo');
  }
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('/sw.js').catch(function(){});
      });
    }
  } catch (e) {}
  try {
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      window.__warrenDeferredInstall = e;
      window.dispatchEvent(new Event('warren:install-available'));
    });
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "Warren",
  description: "Warren — home automation dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
