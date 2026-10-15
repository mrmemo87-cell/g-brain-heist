# Gulzada 3D comparison pilot

The existing retention gate still governs access. Only student UUID `b30e9c28-96f1-4d34-83e9-9b28b4926f42`, with an enabled companion snapshot, gets the 3D prototype UI. Jess retains the teacher experience. Other students retain their current character and do not request the GLB or renderer.

The prototype defaults on for Gulzada. A visible **Use original character** / **Try 3D character** button saves `bh:echo-3d:v1:<userId>` on the device; it changes no profile, assignments or scores. The same selected character renders in the card or floating language hub, preserving the single-character rule, drag/dock, language submenu, keepsakes and tuck controls. Pilot hide/pause, navigation and practice unmount release the renderer.

Asset: `public/retention/gulla-prototype-v1.glb`, 1,343,728 bytes; 69 mesh primitives, 19 skeletal joints, 33,328 triangles, three animation clips. This is the hand-built articulation prototype delivered for review, not a final likeness/art approval. Cyan face LEDs have a separate material so palette changes affect strands rather than eyes.

Rendering uses a small lazy-loaded WebGL2 module and no added dependency. The model request begins only for a visible 3D surface; it is aborted on unmount and bounded by a 30-second deadline for both the model and lazy renderer. Current artwork covers loading and failure, including unsupported WebGL and context loss. Pixel ratio is capped at 1.5, frames at 30 fps, and each pose plays at most two cycles before settling. Off-screen/background rendering suspends, reduced motion draws a static pose, and cleanup deletes buffers, vertex arrays, shaders and program and releases the context. No new database requests, polling or realtime subscriptions.

Validation: focused strict TypeScript; 26 renderer/language/companion DOM checks, including actual GLB animation matrices, settling, pause, resource release, one-user default, persisted revert and failed-load fallback. The exact app shaders also compiled, linked and rendered the GLB successfully on Mesa OpenGL ES 3.2 without GL errors. Full repository CI is required before release. Software rendering does not establish physical iPhone/Safari visual acceptance or battery performance.

## Mobile loading correction

A visible wrapper now starts loading immediately from viewport geometry and is observed instead of its transparent canvas. This avoids waiting indefinitely for an initial observer callback during floating-hub layout. Loading and context loss no longer remain hidden behind a selected-mode badge: the card reports Loading 3D, 3D live only after the first error-free draw, or Original shown / 3D unavailable with a friendly failure category and Retry 3D. Retry replaces the canvas and all previous resources. The renderer also tries a non-antialiased WebGL2 context if its initial context attributes fail.

Evidence: the deployed GLB returned HTTP 200 with model/gltf-binary content. A regression fixture with a visible wrapper and a silent IntersectionObserver now loads and draws the real GLB, reports ready, handles context loss and recovers on retry. 27 focused checks and strict TypeScript pass. The exact cause on the reporting iPhone is not remotely established, and physical Safari acceptance remains outstanding.
