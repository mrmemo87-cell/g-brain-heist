import { continueRender, delayRender, staticFile } from "remotion";

let loaded: Promise<void> | null = null;

/** Loads IBM Plex Sans from the project's public folder before any frame renders. */
export const loadFonts = (): Promise<void> => {
  if (loaded) return loaded;
  const handle = delayRender("Loading IBM Plex Sans");
  const faces = [
    new FontFace("IBM Plex Sans", `url(${staticFile("fonts/IBMPlexSans_400Regular.ttf")})`, { weight: "400" }),
    new FontFace("IBM Plex Sans", `url(${staticFile("fonts/IBMPlexSans_700Bold.ttf")})`, { weight: "700" }),
  ];
  loaded = Promise.all(faces.map((face) => face.load()))
    .then((results) => {
      results.forEach((face) => document.fonts.add(face));
    })
    .catch((error) => {
      console.warn("Font load failed, falling back to system fonts", error);
    })
    .finally(() => continueRender(handle));
  return loaded;
};
