import { useEffect, useRef, type MutableRefObject } from "react";
import type { ZoneId } from "../clanTerritoryTypes";
import {
  buildIdMask,
  FRAGMENT_SHADER,
  hexToRgb,
  MAX_SHADER_CLANS,
  VERTEX_SHADER,
  zoneNumber,
  type ZoneVisual,
} from "./neonMegacityShader";
import {
  NEON_MEGACITY_HEIGHT,
  NEON_MEGACITY_TERRITORIES,
  NEON_MEGACITY_WIDTH,
} from "../neonMegacityTerritories";

type ShaderRefs = {
  zoneVisualsRef: MutableRefObject<Record<ZoneId, ZoneVisual>>;
  selectedZoneRef: MutableRefObject<ZoneId | null>;
  hoveredZoneRef: MutableRefObject<ZoneId | null>;
  selectAtRef: MutableRefObject<number>;
  captureAtRef: MutableRefObject<Record<ZoneId, number>>;
  startTimeRef: MutableRefObject<number>;
};

type UseShaderArgs = ShaderRefs & {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  cityArtUrl: string;
  onReady: (ready: boolean) => void;
  onError: (message: string | null) => void;
};

export const useNeonMegacityShader = ({
  canvasRef,
  cityArtUrl,
  zoneVisualsRef,
  selectedZoneRef,
  hoveredZoneRef,
  selectAtRef,
  captureAtRef,
  startTimeRef,
  onReady,
  onError,
}: UseShaderArgs) => {
  const callbacksRef = useRef({ onReady, onError });
  callbacksRef.current = { onReady, onError };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) {
      callbacksRef.current?.onReady(false);
      callbacksRef.current?.onError("WebGL2 is not available on this device.");
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    const maskCanvas = buildIdMask();
    const image = new Image();
    image.decoding = "async";
    image.src = cityArtUrl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
      }
      return shader;
    };

    const makeTexture = (unit: number, source: TexImageSource, filter: number) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Could not create map texture");
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return texture;
    };

    image.onload = () => {
      if (cancelled) return;
      try {
        const program = gl.createProgram();
        if (!program) throw new Error("Could not create shader program");
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || "Shader program link failed");
        }
        gl.useProgram(program);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "aPos");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        makeTexture(0, image, gl.LINEAR);
        makeTexture(1, maskCanvas, gl.NEAREST);
        gl.uniform1i(gl.getUniformLocation(program, "uArt"), 0);
        gl.uniform1i(gl.getUniformLocation(program, "uId"), 1);
        gl.uniform2f(gl.getUniformLocation(program, "uTexel"), 1 / NEON_MEGACITY_WIDTH, 1 / NEON_MEGACITY_HEIGHT);

        const centers = new Float32Array(22);
        for (const territory of NEON_MEGACITY_TERRITORIES) {
          const id = zoneNumber(territory.zoneId);
          centers[id * 2] = territory.pulseCenter[0] / NEON_MEGACITY_WIDTH;
          centers[id * 2 + 1] = territory.pulseCenter[1] / NEON_MEGACITY_HEIGHT;
        }
        gl.uniform2fv(gl.getUniformLocation(program, "uCenters[0]"), centers);

        const uniform = (name: string) => gl.getUniformLocation(program, name);
        const clanLocs = Array.from({ length: MAX_SHADER_CLANS }, (_, index) => uniform(`uClan${index}[0]`));
        const shareLocs = Array.from({ length: MAX_SHADER_CLANS }, (_, index) => uniform(`uShare${index}[0]`));
        const coverageLoc = uniform("uCoverage[0]");
        const contestedLoc = uniform("uContested[0]");
        const captureLoc = uniform("uCaptureTime[0]");
        const selectedLoc = uniform("uSelected");
        const hoveredLoc = uniform("uHovered");
        const selectAtLoc = uniform("uSelectAt");
        const timeLoc = uniform("uTime");

        const render = () => {
          if (cancelled) return;
          const elapsed = performance.now() / 1000 - startTimeRef.current;
          const clanArrays = Array.from({ length: MAX_SHADER_CLANS }, () => new Float32Array(33));
          const shareArrays = Array.from({ length: MAX_SHADER_CLANS }, () => new Float32Array(11));
          const coverage = new Float32Array(11);
          const contested = new Float32Array(11);
          const capture = new Float32Array(11);

          for (const territory of NEON_MEGACITY_TERRITORIES) {
            const id = zoneNumber(territory.zoneId);
            const visual = zoneVisualsRef.current[territory.zoneId];
            coverage[id] = visual.occupation / 100;
            contested[id] = visual.contested ? 1 : 0;
            capture[id] = captureAtRef.current[territory.zoneId] ?? -999;
            for (let index = 0; index < MAX_SHADER_CLANS; index += 1) {
              const entry = visual.entries[index];
              const color: [number, number, number] = entry ? hexToRgb(entry.color) : [0, 0, 0];
              clanArrays[index].set(color, id * 3);
              shareArrays[index][id] = entry?.normalizedShare ?? 0;
            }
          }

          clanArrays.forEach((array, index) => gl.uniform3fv(clanLocs[index], array));
          shareArrays.forEach((array, index) => gl.uniform1fv(shareLocs[index], array));
          gl.uniform1fv(coverageLoc, coverage);
          gl.uniform1fv(contestedLoc, contested);
          gl.uniform1fv(captureLoc, capture);
          gl.uniform1i(selectedLoc, zoneNumber(selectedZoneRef.current));
          gl.uniform1i(hoveredLoc, zoneNumber(hoveredZoneRef.current));
          gl.uniform1f(selectAtLoc, selectAtRef.current);
          gl.uniform1f(timeLoc, elapsed);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          animationFrame = requestAnimationFrame(render);
        };

        callbacksRef.current?.onError(null);
        callbacksRef.current?.onReady(true);
        render();
      } catch (error) {
        console.error("[NeonMegacityShaderMap] initialization failed", error);
        callbacksRef.current?.onReady(false);
        callbacksRef.current?.onError(error instanceof Error ? error.message : "Could not initialize Neon Megacity.");
      }
    };

    image.onerror = () => {
      if (!cancelled) {
        callbacksRef.current?.onReady(false);
        callbacksRef.current?.onError("Could not load Neon Megacity artwork.");
      }
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [canvasRef, captureAtRef, cityArtUrl, hoveredZoneRef, selectAtRef, selectedZoneRef, startTimeRef, zoneVisualsRef]);
};
