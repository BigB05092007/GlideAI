export {};

declare global {
  interface GlideAppDesktop {
    readonly isDesktop: true;
    quit: () => Promise<boolean | void>;
  }

  interface Window {
    glideApp?: GlideAppDesktop;
  }
}
