// src/types/mindar.d.ts
import * as THREE from "three";

declare module "mind-ar/dist/mindar-image-three.prod.js" {
  interface MindARThreeOptions {
    container: HTMLElement;
    imageTargetSrc: string;
    maxTrack?: number;
    uiLoading?: boolean | string;
    uiScanning?: boolean | string;
    filterMinCF?: number;
    filterBeta?: number;
  }

  type Anchor = {
    group: THREE.Group;
    onTargetFound?: () => void;
    onTargetLost?: () => void;
  };

  class MindARThree {
    constructor(options: MindARThreeOptions);
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    start(): Promise<void>;
    stop(): Promise<void>;
    addAnchor(index: number): Anchor;
  }

  export { MindARThree, MindARThreeOptions, Anchor };
}
