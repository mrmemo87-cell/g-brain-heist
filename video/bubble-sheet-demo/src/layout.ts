import type { Layout } from "./plan";

/** Where footage, device frames and hero elements sit for each orientation. */
export const geometry = (layout: Layout) => {
  if (layout === "landscape") {
    const screen = { x: 180, y: 54, width: 1560, height: 878 };
    return {
      width: 1920,
      height: 1080,
      screen,
      captionBottom: 26,
      captionSize: 30,
      sheet: { x: 1120, y: 50, width: 560 },
      heroText: { x: 960, y: 420, size: 112 },
    };
  }
  const screen = { x: 170, y: 130, width: 740, height: 1604 };
  return {
    width: 1080,
    height: 1920,
    screen,
    captionBottom: 44,
    captionSize: 38,
    sheet: { x: 190, y: 330, width: 700 },
    heroText: { x: 540, y: 820, size: 104 },
  };
};
