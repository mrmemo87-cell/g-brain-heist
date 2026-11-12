import { Composition } from "remotion";
import { loadFonts } from "./components/fonts";
import { Demo } from "./Demo";
import { FPS, totalFrames } from "./timing";

loadFonts();

export const Root: React.FC = () => (
  <>
    <Composition id="DesktopDemo" component={Demo} defaultProps={{ layout: "landscape" as const }} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />
    <Composition id="MobileDemo" component={Demo} defaultProps={{ layout: "portrait" as const }} durationInFrames={totalFrames} fps={FPS} width={1080} height={1920} />
  </>
);
