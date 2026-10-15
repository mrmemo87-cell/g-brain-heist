import type { EchoPose } from './echoModel';
import type { CompanionPalette } from './companionModel';
export interface Echo3DRenderer {
 setPose(pose: EchoPose): void;
 setPalette(palette: CompanionPalette): void;
 setReduced(value: boolean): void;
 setVisible(value: boolean): void;
 dispose(): void;
}
export function createEcho3DRenderer(canvas: HTMLCanvasElement, buffer: ArrayBuffer, options?: { palette?: CompanionPalette; reduced?: boolean; onError?: () => void; onReady?: () => void }): Echo3DRenderer;
