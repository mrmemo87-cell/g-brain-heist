import { useEffect, useRef } from 'react';

type GooeyOrbProps = {
  className?: string;
};

const VERTEX_SHADER = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_res;
uniform float u_radius;
uniform float u_deform;
uniform float u_freq;
uniform float u_morphSpeed;
uniform float u_rotSpeed;
uniform float u_specular;
uniform float u_shininess;
uniform float u_glowStrength;
uniform vec3 u_colBlue;
uniform vec3 u_colMag;
uniform vec3 u_glowA;
uniform vec3 u_glowB;
uniform float u_liquidSpeed;
uniform float u_liquidScale;
uniform float u_liquidBright;
uniform float u_filament;
uniform float u_core;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float blobField(vec3 p) {
  float t = u_time * u_morphSpeed;
  float f = u_freq;
  float d = 0.0;
  d += sin(p.x * 2.6 * f + t);
  d += sin(p.y * 2.9 * f - t * 0.8 + 1.3);
  d += sin(p.z * 3.2 * f + t * 1.2 + 2.7);
  d += sin((p.x + p.z) * 2.2 * f - t * 0.9 + 4.1);
  d += sin((p.y - p.x) * 2.4 * f + t * 0.7 + 0.6);
  return d * 0.2;
}

float mapBlob(vec3 p) {
  float t = u_time * u_rotSpeed;
  p.xy *= rot(t * 0.7);
  p.yz *= rot(t * 0.5);
  float r = u_radius + u_deform * blobField(p);
  return length(p) - r;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    mapBlob(p + e.xyy) - mapBlob(p - e.xyy),
    mapBlob(p + e.yxy) - mapBlob(p - e.yxy),
    mapBlob(p + e.yyx) - mapBlob(p - e.yyx)
  ));
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
      mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x),
      f.y
    ),
    mix(
      mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
      mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise3(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

float liquid(vec3 p) {
  float t = u_time * u_liquidSpeed;
  p *= u_liquidScale;
  p.xy *= rot(t * 0.15);
  p.yz *= rot(t * 0.1);
  vec3 w = vec3(
    fbm3(p + t * 0.2),
    fbm3(p + vec3(4.3, 1.2, -t * 0.15)),
    fbm3(p.zxy + vec3(7.7, 2.3, t * 0.1))
  );
  return fbm3(p + 1.8 * w);
}

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;

  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(p, -1.8));
  float t = 0.0;
  bool hit = false;
  vec3 pos = ro;
  float minD = 1e3;

  for (int i = 0; i < 128; i++) {
    pos = ro + rd * t;
    float d = mapBlob(pos);
    minD = min(minD, d);
    if (d < 0.001) {
      hit = true;
      break;
    }
    t += d * 0.4;
    if (t > 6.0) break;
  }

  vec3 light = vec3(0.0);

  if (hit) {
    vec3 n = calcNormal(pos);
    vec3 v = -rd;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 rp = pos + rd * 0.04;
    float trans = 1.0;
    vec3 inner = vec3(0.0);

    for (int k = 0; k < 8; k++) {
      float raw = liquid(rp);
      float dens = smoothstep(0.30, 0.70, raw);
      float fil = pow(1.0 - abs(2.0 * raw - 1.0), 5.0);
      vec3 color = mix(
        u_colMag,
        u_colBlue,
        0.5 + 0.5 * sin(raw * 6.0 + u_time * 0.3 + rp.y * 2.5)
      );
      vec3 emit = color * dens * 0.55
        + color * fil * u_filament
        + vec3(1.0) * pow(fil, 3.0) * u_filament * 0.4;
      emit += u_colBlue * smoothstep(0.5, 0.0, length(rp)) * u_core;
      inner += trans * emit * 0.17;
      trans *= 0.84;
      rp += rd * 0.11;
      if (length(rp) > 1.0) break;
    }

    light += inner * (1.0 - fres * 0.6) * u_liquidBright;
    vec3 rim = mix(u_colMag, u_colBlue, 0.5 + 0.5 * (n.x * 0.7 + n.y * 0.45));
    light += rim * fres * 1.3;

    vec3 l1 = normalize(vec3(0.6, 0.85, 0.6));
    vec3 l2 = normalize(vec3(-0.7, 0.25, 0.55));
    light += vec3(1.0) * pow(max(dot(n, normalize(l1 + v)), 0.0), u_shininess) * 1.3 * u_specular;
    light += vec3(0.8, 0.9, 1.0) * pow(max(dot(n, normalize(l2 + v)), 0.0), u_shininess * 0.45) * 0.6 * u_specular;
  } else {
    float glow = exp(-minD * 5.5);
    float angle = atan(rd.y, rd.x);
    vec3 glowColor = mix(u_glowA, u_glowB, 0.5 + 0.5 * sin(angle * 3.0 + u_time * 0.5));
    light += (
      glowColor * glow * 1.4
      + vec3(0.6, 0.8, 1.0) * pow(glow, 3.0) * 0.7
    ) * u_glowStrength;
  }

  fragColor = vec4(clamp(light, 0.0, 1.0), 1.0);
}`;

const VALUES = {
  radius: 0.24,
  deform: 0.8,
  frequency: 1.1,
  morphSpeed: 0.39,
  rotSpeed: 0.14,
  specular: 1,
  shininess: 140,
  glowStrength: 0.72,
  colorBlue: new Float32Array([64 / 255, 153 / 255, 1]),
  colorMagenta: new Float32Array([230 / 255, 51 / 255, 191 / 255]),
  glowA: new Float32Array([51 / 255, 181 / 255, 1]),
  glowB: new Float32Array([226 / 255, 77 / 255, 208 / 255]),
  liquidSpeed: 0.5,
  liquidScale: 2.2,
  liquidBright: 1,
  filament: 1.4,
  core: 0.3,
} as const;

const GooeyOrb = ({ className = '' }: GooeyOrbProps) => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      host.dataset.webgl = 'fallback';
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create orb shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Orb shader compilation failed';
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };

    let program: WebGLProgram | null = null;
    let frameId = 0;
    let stopped = false;

    try {
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) throw new Error('Unable to create orb program');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Orb program linking failed');
      }
      gl.useProgram(program);

      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const uniform = (name: string) => gl.getUniformLocation(program!, name);
      const u = {
        time: uniform('u_time'),
        res: uniform('u_res'),
        radius: uniform('u_radius'),
        deform: uniform('u_deform'),
        frequency: uniform('u_freq'),
        morphSpeed: uniform('u_morphSpeed'),
        rotSpeed: uniform('u_rotSpeed'),
        specular: uniform('u_specular'),
        shininess: uniform('u_shininess'),
        glowStrength: uniform('u_glowStrength'),
        colorBlue: uniform('u_colBlue'),
        colorMagenta: uniform('u_colMag'),
        glowA: uniform('u_glowA'),
        glowB: uniform('u_glowB'),
        liquidSpeed: uniform('u_liquidSpeed'),
        liquidScale: uniform('u_liquidScale'),
        liquidBright: uniform('u_liquidBright'),
        filament: uniform('u_filament'),
        core: uniform('u_core'),
      };

      gl.uniform1f(u.radius, VALUES.radius);
      gl.uniform1f(u.deform, VALUES.deform);
      gl.uniform1f(u.frequency, VALUES.frequency);
      gl.uniform1f(u.morphSpeed, VALUES.morphSpeed);
      gl.uniform1f(u.rotSpeed, VALUES.rotSpeed);
      gl.uniform1f(u.specular, VALUES.specular);
      gl.uniform1f(u.shininess, VALUES.shininess);
      gl.uniform1f(u.glowStrength, VALUES.glowStrength);
      gl.uniform3fv(u.colorBlue, VALUES.colorBlue);
      gl.uniform3fv(u.colorMagenta, VALUES.colorMagenta);
      gl.uniform3fv(u.glowA, VALUES.glowA);
      gl.uniform3fv(u.glowB, VALUES.glowB);
      gl.uniform1f(u.liquidSpeed, VALUES.liquidSpeed);
      gl.uniform1f(u.liquidScale, VALUES.liquidScale);
      gl.uniform1f(u.liquidBright, VALUES.liquidBright);
      gl.uniform1f(u.filament, VALUES.filament);
      gl.uniform1f(u.core, VALUES.core);

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dprCap = window.innerWidth <= 560 ? 1 : 1.35;
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        const width = Math.max(2, Math.round(rect.width * dpr));
        const height = Math.max(2, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      };

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const draw = (now: number) => {
        if (stopped) return;
        resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(u.time, now * 0.001);
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!reducedMotion) frameId = requestAnimationFrame(draw);
      };

      host.dataset.webgl = 'ready';
      draw(0);
    } catch (error) {
      console.warn('Brains Heist orb fallback enabled.', error);
      host.dataset.webgl = 'fallback';
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return <span ref={hostRef} className={`gooey-orb ${className}`.trim()} data-signal-orb aria-hidden="true"><canvas ref={canvasRef}/><i/></span>;
};

export default GooeyOrb;
