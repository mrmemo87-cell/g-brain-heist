import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import { getClanColor } from "../../../utils/clanColors";
import {
  NEON_MEGACITY_HEIGHT,
  NEON_MEGACITY_TERRITORIES,
  NEON_MEGACITY_WIDTH,
  type NeonMegacityTerritory,
} from "../neonMegacityTerritories";

export const RENDER_WIDTH = 1280;
export const RENDER_HEIGHT = 720;
export const MAX_SHADER_CLANS = 4;

export type RankedInfluence = {
  clanId: ClanId;
  influence: number;
  territoryPct: number;
  normalizedShare: number;
  color: string;
  name: string;
};

export type ZoneVisual = {
  entries: RankedInfluence[];
  rawTotal: number;
  occupation: number;
  neutralPct: number;
  contested: boolean;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.trim().replace(/^#/, "");
  const full = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [0.15, 0.82, 0.93];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

export const getZoneVisual = (
  state: ZoneState | undefined,
  clans: Record<ClanId, ClanMetadata>,
): ZoneVisual => {
  const rawEntries = Object.entries(state?.influence ?? {})
    .filter(([, influence]) => influence > 0)
    .sort((a, b) => b[1] - a[1]);
  const rawTotal = rawEntries.reduce((sum, [, influence]) => sum + influence, 0);
  const occupation = Math.min(100, rawTotal);
  const neutralPct = Math.max(0, 100 - occupation);
  const scale = rawTotal > 100 ? 100 / rawTotal : 1;
  const entries = rawEntries.map(([clanId, influence]) => ({
    clanId,
    influence,
    territoryPct: influence * scale,
    normalizedShare: rawTotal > 0 ? influence / rawTotal : 0,
    color: clans[clanId]?.color ?? getClanColor(clanId),
    name: clans[clanId]?.name ?? clanId,
  }));
  const leader = entries[0];
  const runnerUp = entries[1];
  const contested = Boolean(
    leader && runnerUp && Math.abs(leader.influence - runnerUp.influence) / Math.max(leader.influence, 1) <= 0.2,
  );
  return { entries, rawTotal, occupation, neutralPct, contested };
};

export const zoneNumber = (zoneId: ZoneId | null | undefined): number => {
  if (!zoneId) return 0;
  const match = /^zone-(\d+)$/.exec(zoneId);
  return match ? Number(match[1]) : 0;
};

export const buildIdMask = (): HTMLCanvasElement => {
  const mask = document.createElement("canvas");
  mask.width = NEON_MEGACITY_WIDTH;
  mask.height = NEON_MEGACITY_HEIGHT;
  const ctx = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx) return mask;
  ctx.clearRect(0, 0, mask.width, mask.height);
  ctx.imageSmoothingEnabled = false;
  for (const territory of NEON_MEGACITY_TERRITORIES) {
    const id = zoneNumber(territory.zoneId);
    ctx.beginPath();
    territory.points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = `rgb(${id},0,0)`;
    ctx.fill();
  }
  return mask;
};

export const territoryAtPoint = (x: number, y: number): NeonMegacityTerritory | null => {
  const pointInPolygon = (points: readonly (readonly [number, number])[]) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  };
  for (let index = NEON_MEGACITY_TERRITORIES.length - 1; index >= 0; index -= 1) {
    const territory = NEON_MEGACITY_TERRITORIES[index];
    if (pointInPolygon(territory.points)) return territory;
  }
  return null;
};

export const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv=vec2((aPos.x+1.0)*0.5,1.0-(aPos.y+1.0)*0.5);
  gl_Position=vec4(aPos,0.0,1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uArt;
uniform sampler2D uId;
uniform vec2 uTexel;
uniform float uTime;
uniform int uSelected;
uniform int uHovered;
uniform float uSelectAt;
uniform vec3 uClan0[11];
uniform vec3 uClan1[11];
uniform vec3 uClan2[11];
uniform vec3 uClan3[11];
uniform float uShare0[11];
uniform float uShare1[11];
uniform float uShare2[11];
uniform float uShare3[11];
uniform float uCoverage[11];
uniform float uContested[11];
uniform float uCaptureTime[11];
uniform vec2 uCenters[11];
in vec2 vUv;
out vec4 fragColor;
float zoneAt(vec2 uv){ return texture(uId,uv).r*255.0; }
bool sameZone(float a,float b){ return abs(a-b)<0.35; }
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float hashCluster(vec2 uv,float id){ vec2 cell=floor(uv*vec2(58.0,34.0)); return hash21(cell+vec2(id*19.7,id*7.3)); }
float luminance(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }
vec3 hueReplace(vec3 clan,float targetLum){ float clanLum=max(luminance(clan),0.08); return clamp(clan*(targetLum/clanLum),0.0,1.0); }
float boundaryBand(float id,vec2 uv){
  if(id<0.5)return 0.0;
  float b=0.0;
  for(int i=1;i<=5;i++){
    float f=float(i);
    vec2 dx=vec2(uTexel.x*f*1.8,0.0);
    vec2 dy=vec2(0.0,uTexel.y*f*1.8);
    if(!sameZone(id,zoneAt(uv+dx))) b=max(b,1.0-f/6.0);
    if(!sameZone(id,zoneAt(uv-dx))) b=max(b,1.0-f/6.0);
    if(!sameZone(id,zoneAt(uv+dy))) b=max(b,1.0-f/6.0);
    if(!sameZone(id,zoneAt(uv-dy))) b=max(b,1.0-f/6.0);
  }
  return b;
}
vec3 pickClanColor(int id,float h){
  float a=uShare0[id];
  float b=a+uShare1[id];
  float c=b+uShare2[id];
  if(h<a)return uClan0[id];
  if(h<b)return uClan1[id];
  if(h<c)return uClan2[id];
  return uClan3[id];
}
void main(){
  vec4 art=texture(uArt,vUv);
  vec3 original=art.rgb;
  vec3 c=original;
  float idf=zoneAt(vUv);
  int id=int(floor(idf+0.5));
  if(id<1||id>10){ fragColor=vec4(c,1.0); return; }
  float mx=max(original.r,max(original.g,original.b));
  float mn=min(original.r,min(original.g,original.b));
  float sat=(mx-mn)/(mx+0.001);
  float lum=luminance(original);
  float whiteLike=(1.0-smoothstep(0.08,0.26,sat))*smoothstep(0.52,0.88,lum);
  float chromaLight=smoothstep(0.10,0.48,sat)*smoothstep(0.08,0.54,lum);
  float brightLight=smoothstep(0.28,0.82,lum)*smoothstep(0.04,0.22,sat);
  float emissive=clamp(chromaLight*0.90+brightLight*0.42,0.0,1.0)*(1.0-whiteLike*0.96);
  float materialMask=smoothstep(0.16,0.58,sat)*smoothstep(0.07,0.36,lum)*(1.0-smoothstep(0.42,0.76,lum))*0.26;
  float neutralLum=clamp(lum*1.04,0.0,1.0);
  vec3 neutralLight=vec3(neutralLum*0.79,neutralLum*0.88,neutralLum);
  float coverage=uCoverage[id];
  float border=boundaryBand(idf,vUv);
  if(coverage>0.001){
    float cluster=hashCluster(vUv,float(id));
    if(cluster<coverage){
      float ownerHash=hash21(floor(vUv*vec2(86.0,49.0))+vec2(float(id)*3.1,float(id)*11.7));
      if(uContested[id]>0.5){ ownerHash=fract(ownerHash+sin(vUv.x*24.0+vUv.y*17.0+uTime*1.8)*0.018); }
      vec3 clanColor=pickClanColor(id,ownerHash);
      vec3 pureClanLight=hueReplace(clanColor,clamp(lum*1.16,0.0,0.96));
      float lightStrength=emissive*mix(0.60,0.96,smoothstep(0.24,0.82,emissive));
      vec3 lightRelit=mix(original,pureClanLight,lightStrength);
      vec3 clanMaterial=hueReplace(clanColor,clamp(lum*0.82,0.0,0.68));
      vec3 relit=mix(lightRelit,clanMaterial,materialMask);
      c=mix(original,relit,1.0-border*0.76);
    }else{ c=mix(original,neutralLight,emissive*0.42); }
    float age=uTime-uCaptureTime[id];
    if(age>=0.0&&age<1.45){
      float d=distance(vUv,uCenters[id]);
      float radius=age*0.39;
      float ring=1.0-smoothstep(0.0,0.022,abs(d-radius));
      vec3 pulseHue=hueReplace(uClan0[id],clamp(lum*1.30+0.18,0.22,1.0));
      c+=pulseHue*ring*(1.0-age/1.45)*(0.15+emissive*0.68);
    }
  }else{ c=mix(original,neutralLight,emissive*0.24); }
  if(id==uHovered){ c+=vec3(0.18,0.74,0.92)*border*0.055; }
  float selAge=uTime-uSelectAt;
  if(id==uSelected&&selAge>=0.0&&selAge<0.85){
    float d=distance(vUv,uCenters[id]);
    float radius=selAge*0.35;
    float ring=1.0-smoothstep(0.0,0.017,abs(d-radius));
    c+=vec3(1.0,0.76,0.10)*ring*(1.0-selAge/0.85)*0.54;
  }
  fragColor=vec4(clamp(c,0.0,1.0),1.0);
}`;
