import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

// Use a locally installed Chromium instead of letting Remotion download one.
// Set REMOTION_BROWSER to override, e.g. on a machine where Chrome lives elsewhere.
const browser = process.env.REMOTION_BROWSER ?? (process.platform === "linux" ? "/opt/pw-browsers/chromium" : undefined);
if (browser) Config.setBrowserExecutable(browser);
