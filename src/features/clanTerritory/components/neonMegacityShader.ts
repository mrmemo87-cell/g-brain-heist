import type { ClanId, ClanMetadata, ZoneId, ZoneState } from "../clanTerritoryTypes";
import { getClanColor } from "../../../utils/clanColors";
import {
  NEON_MEGACITY_HEIGHT,
  NEON_MEGACITY_TERRITORIES,
  NEON_MEGACITY_WIDTH,
  type NeonMegacityTerritory,
} from "../neonMegacityTerritories";

export const RENDER_WIDTH = NEON_MEGACITY_WIDTH;
export const RENDER_HEIGHT = NEON_MEGACITY_HEIGHT;
export const ID_MASK_STEP = 24;

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
  primaryFrac: number;
  secondaryFrac: number;
  contested: boolean;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.trim().replace(/^#/, "");
  const full = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [0.133, 0.827, 0.933];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

export const getZoneVisual = (state: ZoneState | undefined, clans: Record<ClanId, ClanMetadata>): ZoneVisual => {
  const rawEntries = Object.entries(state?.influence ?? {}).filter(([, influence]) => influence > 0).sort((a, b) => b[1] - a[1]);
  const rawTotal = rawEntries.reduce((sum, [, influence]) => sum + influence, 0);
  const occupation = Math.min(100, rawTotal);
  const neutralPct = Math.max(0, 100 - occupation);
  const scale = rawTotal > 100 ? 100 / rawTotal : 1;
  const entries = rawEntries.map(([clanId, influence]) => ({ clanId, influence, territoryPct: influence * scale, normalizedShare: rawTotal > 0 ? influence / rawTotal : 0, color: clans[clanId]?.color ?? getClanColor(clanId), name: clans[clanId]?.name ?? clanId }));
  const first = entries[0];
  const second = entries[1];
  return { entries, rawTotal, occupation, neutralPct, primaryFrac: first?.normalizedShare ?? 0, secondaryFrac: second?.normalizedShare ?? 0, contested: Boolean(rawTotal > 0 && second && second.normalizedShare >= 0.18) };
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
    ctx.fillStyle = `rgb(${id * ID_MASK_STEP},0,0)`;
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
uniform vec3 uPrimaryColor[11];
uniform vec3 uSecondaryColor[11];
uniform float uCoverage[11];
uniform float uPrimaryFrac[11];
uniform float uSecondaryFrac[11];
uniform float uContested[11];
uniform float uCaptureTime[11];
uniform vec2 uCenters[11];
in vec2 vUv;
out vec4 fragColor;
float zoneAt(vec2 uv){return texture(uId,uv).r*255.0/24.0;}
bool sameZone(float a,float b){return abs(a-b)<0.35;}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float hashCluster(vec2 uv,float id){vec2 cell=floor(uv*vec2(58.0,34.0));return hash21(cell+vec2(id*19.7,id*7.3));}
float boundaryBand(float id,vec2 uv){if(id<0.5)return 0.0;float b=0.0;for(int i=1;i<=5;i++){float f=float(i);vec2 dx=vec2(uTexel.x*f*1.8,0.0);vec2 dy=vec2(0.0,uTexel.y*f*1.8);if(!sameZone(id,zoneAt(uv+dx)))b=max(b,1.0-f/6.0);if(!sameZone(id,zoneAt(uv-dx)))b=max(b,1.0-f/6.0);if(!sameZone(id,zoneAt(uv+dy)))b=max(b,1.0-f/6.0);if(!sameZone(id,zoneAt(uv-dy)))b=max(b,1.0-f/6.0);}return b;}
float luminance(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
vec3 hueReplace(vec3 clan,float targetLum){float clanLum=max(luminance(clan),0.08);vec3 pure=clan*(targetLum/clanLum);return clamp(pure,0.0,1.0);}
vec3 sharpenArt(vec2 uv){vec2 t=1.0/vec2(textureSize(uArt,0));vec3 base=texture(uArt,uv).rgb;vec3 n=texture(uArt,uv+vec2(t.x,0.0)).rgb+texture(uArt,uv-vec2(t.x,0.0)).rgb+texture(uArt,uv+vec2(0.0,t.y)).rgb+texture(uArt,uv-vec2(0.0,t.y)).rgb;vec3 sharp=clamp(base*1.50-n*0.125,0.0,1.0);return mix(base,sharp,0.72);}
float aspectDistance(vec2 a,vec2 b){vec2 d=a-b;d.x*=1.776833;return length(d);}
void main(){
vec3 original=sharpenArt(vUv);vec3 c=original;float idf=zoneAt(vUv);int id=int(floor(idf+0.5));if(id<1||id>10){fragColor=vec4(c,1.0);return;}
float mx=max(original.r,max(original.g,original.b));float mn=min(original.r,min(original.g,original.b));float sat=(mx-mn)/(mx+0.001);float lum=luminance(original);
float whiteLike=(1.0-smoothstep(0.08,0.26,sat))*smoothstep(0.48,0.86,lum);
float chromaLight=smoothstep(0.08,0.42,sat)*smoothstep(0.06,0.50,lum);
float brightLight=smoothstep(0.20,0.72,lum);
float emissive=clamp(chromaLight*0.92+brightLight*0.72,0.0,1.0);emissive*=1.0-whiteLike*0.18;
float materialMask=smoothstep(0.10,0.50,sat)*smoothstep(0.05,0.32,lum)*(1.0-smoothstep(0.58,0.88,lum))*0.38;
float neutralLum=clamp(lum*1.03,0.0,1.0);vec3 neutralLight=vec3(neutralLum*0.80,neutralLum*0.89,neutralLum);
float coverage=uCoverage[id];float border=boundaryBand(idf,vUv);
if(coverage>0.001){
 float primary=uPrimaryFrac[id];float secondary=uSecondaryFrac[id];float ownerHash=hash21(floor(vUv*vec2(86.0,49.0))+vec2(float(id)*3.1,float(id)*11.7));
 if(uContested[id]>0.5&&secondary>0.001){float flow=sin(vUv.x*24.0+vUv.y*17.0+uTime*1.8+ownerHash*6.0)*0.035;primary=clamp(primary+flow,0.05,0.95);}
 vec3 clanColor=uPrimaryColor[id];if(secondary>0.001&&ownerHash>primary){clanColor=uSecondaryColor[id];}
 float cluster=hashCluster(vUv,float(id));float captured=1.0-smoothstep(max(0.0,coverage-0.045),min(1.0,coverage+0.045),cluster);
 float networkStrength=clamp(0.38+coverage*0.56,0.38,0.94);float ownershipStrength=max(networkStrength,captured);
 vec3 pureClanLight=hueReplace(clanColor,clamp(lum*1.26+0.015,0.0,1.0));float lightStrength=emissive*ownershipStrength;
 vec3 lightRelit=mix(original,pureClanLight,lightStrength);
 vec3 clanMaterial=hueReplace(clanColor,clamp(lum*0.86,0.0,0.78));vec3 relit=mix(lightRelit,clanMaterial,materialMask*ownershipStrength);
 float seamKeep=1.0-border*0.82;c=mix(original,relit,seamKeep);
}else{c=mix(original,neutralLight,emissive*0.22);}
float age=uTime-uCaptureTime[id];if(age>=0.0&&age<1.65){float d=aspectDistance(vUv,uCenters[id]);float radius=age*0.43;float ring=1.0-smoothstep(0.0,0.018,abs(d-radius));float halo=1.0-smoothstep(0.0,0.060,abs(d-radius));vec3 pulseHue=hueReplace(uPrimaryColor[id],clamp(lum*1.35+0.25,0.32,1.0));float fade=1.0-age/1.65;c+=pulseHue*(ring*0.82+halo*0.20)*fade;}
if(id==uHovered){c+=vec3(0.18,0.74,0.92)*border*0.10;}
float selAge=uTime-uSelectAt;if(id==uSelected&&selAge>=0.0&&selAge<0.90){float d=aspectDistance(vUv,uCenters[id]);float radius=selAge*0.43;float ring=1.0-smoothstep(0.0,0.016,abs(d-radius));c+=vec3(1.0,0.76,0.10)*ring*(1.0-selAge/0.90)*0.68;}
fragColor=vec4(clamp(c,0.0,1.0),1.0);
}`;
