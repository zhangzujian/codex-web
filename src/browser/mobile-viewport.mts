const COARSE_MOBILE_VIEWPORT_MAX_WIDTH = 1440;
const MOBILE_VIEWPORT_MAX_WIDTH = 768;

export function isMobileSidebarViewportForValues(
  viewportWidth: number,
  hasCoarsePointer: boolean,
  maxTouchPoints = 0,
): boolean {
  return (
    viewportWidth <= MOBILE_VIEWPORT_MAX_WIDTH ||
    ((hasCoarsePointer || maxTouchPoints > 0) &&
      viewportWidth <= COARSE_MOBILE_VIEWPORT_MAX_WIDTH)
  );
}

export function mobileSidebarViewportWidth(windowValue: Window): number {
  return Math.min(
    windowValue.innerWidth,
    windowValue.visualViewport?.width ?? windowValue.innerWidth,
    windowValue.screen?.width ?? windowValue.innerWidth,
  );
}

export function isMobileSidebarViewport(windowValue: Window): boolean {
  return isMobileSidebarViewportForValues(
    mobileSidebarViewportWidth(windowValue),
    windowValue.matchMedia("(pointer: coarse)").matches,
    windowValue.navigator.maxTouchPoints,
  );
}

export function initialSidebarStateForValues(
  viewportWidth: number,
  hasCoarsePointer: boolean,
  _memoryPath: string,
  maxTouchPoints = 0,
): boolean {
  return !isMobileSidebarViewportForValues(
    viewportWidth,
    hasCoarsePointer,
    maxTouchPoints,
  );
}

export function initialSidebarStateForRoute(
  windowValue: Window,
  memoryPath: string,
): boolean {
  return initialSidebarStateForValues(
    mobileSidebarViewportWidth(windowValue),
    windowValue.matchMedia("(pointer: coarse)").matches,
    memoryPath,
    windowValue.navigator.maxTouchPoints,
  );
}
