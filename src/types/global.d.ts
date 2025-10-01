export {};

declare global {
  interface Window {
    _stopResizeListener?: () => void;
  }
}
