"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

declare global {
  interface Window {
    _stopResizeListener?: () => void;
  }
}

export default function ARPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [unmuted, setUnmuted] = useState(false);

  const styleFullCover = (el?: HTMLElement | null) => {
    if (!el) return;
    const isVideo = el.tagName.toLowerCase() === "video";
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("inset", "0", "important");
    el.style.setProperty("width", "100%", "important");
    el.style.setProperty("height", "100%", "important");
    el.style.setProperty("object-fit", "cover", "important");
    el.style.setProperty("object-position", "center center", "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("transform", "", "important");
    el.style.setProperty("z-index", isVideo ? "0" : "1", "important");
  };

  // Prepara un <video> e attende che sia pronto a riprodurre
  function createAndPrepVideo(src: string) {
    const v = document.createElement("video");
    v.src = src;
    v.preload = "auto";
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.crossOrigin = "anonymous";

    
    // Non usare display:none: lo teniamo fuori schermo
    v.style.visibility = "hidden";
    v.style.position = "absolute";
    v.style.left = "-9999px";
    v.style.top = "0";
    v.style.width = "1px";
    v.style.height = "1px";

    const ready = new Promise<void>((resolve) => {
      if (v.readyState >= 2) return resolve();
      const onReady = () => resolve();
      v.addEventListener("canplay", onReady, { once: true });
      v.addEventListener("loadedmetadata", onReady, { once: true });
      v.load();
    });

    return { v, ready };
  }

  useEffect(() => {
    if (!containerRef.current) return;

    // Crea e prepara i video
    const { v: v1, ready: r1 } = createAndPrepVideo("/videos/video1.mp4");
    const { v: v2, ready: r2 } = createAndPrepVideo("/videos/video2.mp4");
    const { v: v3, ready: r3 } = createAndPrepVideo("/videos/video3.mp4");

    containerRef.current.appendChild(v1);
    containerRef.current.appendChild(v2);
    containerRef.current.appendChild(v3);

    // Quando tutti i video sono caricabili, abilita lo start
    Promise.all([r1, r2, r3]).then(() => setReady(true));

    return () => {
      v1.pause(); v2.pause(); v3.pause();
      v1.remove(); v2.remove(); v3.remove();
    };
  }, []);

  const startAR = async () => {
    if (!containerRef.current) return;

    const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: "/targets/targets.mind", // assicurati che esista in /public/targets
      maxTrack: 1,
      filterMinCF: 0.0001,
      filterBeta: 0.001,
      uiLoading: "yes",
      uiScanning: "yes",
    });

    const { renderer, scene, camera } = mindarThree;

    // Aggancia i video già nel DOM
    const videos = Array.from(
      containerRef.current.querySelectorAll("video")
    ) as HTMLVideoElement[];
    const [video1, video2, video3] = videos;

    function makeVideoPlane(video: HTMLVideoElement) {
      const tex = new THREE.VideoTexture(video);
      (tex as THREE.VideoTexture).colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      // Three r150+:
      type RendererWithColorSpace = THREE.WebGLRenderer & Partial<{
        outputColorSpace: THREE.ColorSpace;
        outputEncoding: THREE.TextureEncoding;
      }>;

      const r = renderer as RendererWithColorSpace;
      if (r.outputColorSpace !== undefined) {
        r.outputColorSpace = THREE.SRGBColorSpace;
      } else if (r.outputEncoding !== undefined) {
        r.outputEncoding = THREE.sRGBEncoding;
      }


      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.DoubleSide,
        transparent: true,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const applyAspect = () => {
        const vw = video.videoWidth || 16;
        const vh = video.videoHeight || 9;
        const aspect = vw / vh;
        mesh.scale.set(1, 1 / aspect, 1);
      };

      if (video.readyState >= 1) applyAspect();
      else video.addEventListener("loadedmetadata", applyAspect, { once: true });

      return mesh;
    }

    const plane1 = makeVideoPlane(video1);
    const plane2 = makeVideoPlane(video2);
    const plane3 = makeVideoPlane(video3);

    // Ancore
    const anchor0 = mindarThree.addAnchor(0);
    anchor0.group.add(plane1);
    const anchor1 = mindarThree.addAnchor(1);
    anchor1.group.add(plane2);
    const anchor2 = mindarThree.addAnchor(2);
    anchor2.group.add(plane3);

    // Play sicuro con catch (se fallisce, log utile in prod)
    anchor0.onTargetFound = async () => {
      try { await video1.play(); } catch (e) { console.warn("v1 play failed", e); }
    };
    anchor0.onTargetLost = () => video1.pause();

    anchor1.onTargetFound = async () => {
      try { await video2.play(); } catch (e) { console.warn("v2 play failed", e); }
    };
    anchor1.onTargetLost = () => video2.pause();

    anchor2.onTargetFound = async () => {
      try { await video3.play(); } catch (e) { console.warn("v3 play failed", e); }
    };
    anchor2.onTargetLost = () => video3.pause();

    // Layout / resize
    const fitToScreen = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);

      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      const roots = Array.from(
        containerRef.current?.querySelectorAll("video, canvas") || []
      );
      roots.forEach((el) => styleFullCover(el as HTMLElement));
    };

    await mindarThree.start();

    fitToScreen();
    const onResize = () => fitToScreen();
    window.addEventListener("resize", onResize);
    window._stopResizeListener = () => window.removeEventListener("resize", onResize);

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    setStarted(true);

    // Sblocco audio dopo primo gesto
    const enableAudio = async () => {
      if (!unmuted) {
        [video1, video2, video3].forEach((v) => (v.muted = false));
        try { await video1.play(); } catch {}
        try { await video2.play(); } catch {}
        try { await video3.play(); } catch {}
        setUnmuted(true);
      }
      window.removeEventListener("touchend", enableAudio);
      window.removeEventListener("click", enableAudio);
    };
    window.addEventListener("touchend", enableAudio, { once: true });
    window.addEventListener("click", enableAudio, { once: true });
  };

  useEffect(() => {
    return () => {
      const stop = window._stopResizeListener;
      if (typeof stop === "function") stop();
    };
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-black text-white main-box">
      <div
        ref={containerRef}
        data-mindar-container
        className="w-full h-[100svh] relative overflow-hidden container"
        style={{ touchAction: "manipulation" }}
      >
        {!started && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 to-black/40 backdrop-blur-sm info-box">
            <h1 className="text-2xl font-semibold">AR-OVERLAY</h1>
            <p className="text-center opacity-80 px-6 max-w-md">
              Inquadra una foto. <br /> Al riconoscimento partirà il video corrispondente.
            </p>
            <button
              onClick={startAR}
              disabled={!ready}
              className="px-6 py-3 rounded-2xl bg-white text-black font-medium disabled:opacity-50 shadow"
            >
              {ready ? "open" : "Inizializzo..."}
            </button>

          </div>
        )}
      </div>

      {/* Stili globali per il layer MindAR (fallback) */}
      <style jsx global>{`
        [data-mindar-container] video {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          object-position: center center !important;
          max-width: none !important;
          max-height: none !important;
          background: black;
          z-index: 0 !important;
        }
        [data-mindar-container] canvas {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          object-position: center center !important;
          max-width: none !important;
          max-height: none !important;
          background: transparent;
          z-index: 1 !important;
        }
        video[playsinline] {
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
        }
      `}</style>
    </main>
  );
}
