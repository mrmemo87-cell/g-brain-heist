import { Composition } from "remotion";
import { loadFonts } from "./components/fonts";
import { HEIGHT, WIDTH } from "./theme";
import { FPS, totalFrames } from "./timing";
import { Video } from "./Video";

loadFonts();

export const Root: React.FC = () => (
  <Composition id="BubbleSheetDemo" component={Video} durationInFrames={totalFrames} fps={FPS} width={WIDTH} height={HEIGHT} />
);
