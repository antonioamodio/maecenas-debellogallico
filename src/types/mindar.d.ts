// src/types/mindar.d.ts
declare module 'mind-ar/dist/mindar-image-three.prod.js' {
    import type { Scene, Camera, WebGLRenderer, Group } from 'three';
  
    export interface MindARAnchor {
      group: Group;
      onTargetFound?: () => void;
      onTargetLost?: () => void;
    }
  
    export class MindARThree {
      constructor(options: {
        container: HTMLElement;
        imageTargetSrc: string;
        uiLoading?: boolean | string;
        uiError?: boolean | string;
        uiScanning?: boolean | string;
        filterMinCF?: number;
        filterBeta?: number;
        warmupTolerance?: number;
        missTolerance?: number;
        maxTrack?: number;
      });
  
      renderer: WebGLRenderer;
      scene: Scene;
      camera: Camera;
  
      start(): Promise<void>;
      stop(): Promise<void>;
      switchCamera(): Promise<void>;
      addAnchor(targetIndex: number): MindARAnchor;
    }
  }
  