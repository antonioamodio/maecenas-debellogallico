"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ARPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [unmuted, setUnmuted] = useState(false);

  // -- Helpers ---------------------------------------------------------------
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
    el.style.setProperty("z-index", isVideo ? "0" : "1", "important"); // <-- niente negativi
  };
  

  useEffect(() => {
    // Precarica i video per evitare ritardi
    const v1 = document.createElement("video");
    v1.src = "/videos/video1.mp4";
    v1.preload = "auto";
    v1.loop = true;
    v1.muted = true;
    v1.playsInline = true;
    (v1 as any).crossOrigin = "anonymous";

    const v2 = document.createElement("video");
    v2.src = "/videos/video2.mp4";
    v2.preload = "auto";
    v2.loop = true;
    v2.muted = true;
    v2.playsInline = true;
    (v2 as any).crossOrigin = "anonymous";

    const v3 = document.createElement("video");
     v3.src = "/videos/video3.mp4";
     v3.preload = "auto";
     v3.loop = true;
     v3.muted = true;
     v3.playsInline = true;
     (v3 as any).crossOrigin = "anonymous";

    if (containerRef.current) {
      v1.style.display = "none";
      v2.style.display = "none";
      v3.style.display = "none";
      containerRef.current.appendChild(v1);
      containerRef.current.appendChild(v2);
      containerRef.current.appendChild(v3);
    }

    setReady(true);

    return () => {
      v1.pause();
      v2.pause();
      v3.pause();
      v1.remove();
      v2.remove();
      v3.remove();
    };
  }, []);

  const startAR = async () => {
    if (!containerRef.current) return;

    const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: "/targets/targets.mind",
      maxTrack: 1,
      filterMinCF: 0.0001,
      filterBeta: 0.001,
      uiLoading: "yes",
      uiScanning: "yes",
    } as any);

    const { renderer, scene, camera } = mindarThree;

    // Aggancia i video già nel DOM
    const videos = Array.from(
      containerRef.current.querySelectorAll("video")
      ) as HTMLVideoElement[];
      const [video1, video2, video3] = videos;
    

    // util: crea un piano video con aspect corretto
    function makeVideoPlane(video: HTMLVideoElement) {
      const tex = new THREE.VideoTexture(video);
      // Three r150+: tex.colorSpace = THREE.SRGBColorSpace;
      // Pre-r150: usa encoding
      (tex as any).encoding = (THREE as any).sRGBEncoding;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      // Geometria base 1x1, poi la ridimensioniamo appena sappiamo l'aspect reale
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
        const aspect = vw / vh; // larghezza / altezza del video
        // vogliamo larghezza=1 unit e altezza=1/aspect per non stirare
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

    anchor0.onTargetFound = () => { console.log("target 0 found"); video1.play().catch(() => {}); };
    anchor0.onTargetLost = () => video1.pause();
    anchor1.onTargetFound = () => { console.log("target 1 found"); video2.play().catch(() => {}); };
    anchor1.onTargetLost = () => video2.pause();
    anchor2.onTargetFound = () => { console.log("target 2 found"); video3.play().catch(() => {}); };
    anchor2.onTargetLost = () => video3.pause();

    // Helper per full screen + cover
    const fitToScreen = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);

      if ((camera as any).isPerspectiveCamera) {
        (camera as any).aspect = w / h;
        (camera as any).updateProjectionMatrix();
      }

      // Prendi TUTTI i video/canvas nel container (alcune build di MindAR
      // non aggiungono le classi .mindar-video/.mindar-canvas)
      const roots = Array.from(containerRef.current?.querySelectorAll("video, canvas") || []);
      roots.forEach((el) => styleFullCover(el as HTMLElement));
    };

    await mindarThree.start();

    // Applica subito e lega al resize
    fitToScreen();
    const onResize = () => fitToScreen();
    window.addEventListener("resize", onResize);

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    setStarted(true);

    // Sblocco audio dopo primo tap
    const enableAudio = () => {
            if (!unmuted) {
              [video1, video2, video3].forEach((v) => {
          v.muted = false;
          v.play().catch(() => {});
        });
        setUnmuted(true);
      }
      window.removeEventListener("touchend", enableAudio);
      window.removeEventListener("click", enableAudio);
    };
    window.addEventListener("touchend", enableAudio, { once: true });
    window.addEventListener("click", enableAudio, { once: true });

    // cleanup
    (mindarThree as any)._stopResizeListener = () => window.removeEventListener("resize", onResize);
  };

  useEffect(() => {
    return () => {
      // rimuovi eventuale listener registrato in startAR
      const stop = (window as any)?._stopResizeListener;
      if (typeof stop === "function") stop();
    };
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-black text-white main-box">
      <div
        ref={containerRef}
        data-mindar-container
        className="w-full h-[100svh] relative overflow-hidden container"
        style={{
          touchAction: "manipulation",
        }}
      >
        {!started && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 to-black/40 backdrop-blur-sm info-box">
            <h1 className="text-2xl font-semibold">AR-OVERLAY</h1>
            <p className="text-center opacity-80 px-6 max-w-md">
              inquadra una foto. <br/> al riconoscimento, partirà il video corrispondente.
            </p>
            <button
              onClick={startAR}
              disabled={!ready}
              className="px-6 py-3 rounded-2xl bg-white text-black font-medium disabled:opacity-50 shadow"
            >
              {ready ? "open" : "Inizializzo..."}
            </button>
            <br/>
            <p className="text-center opacity-80 px-6 max-w-md link">
              powered by<a href="https://antonioamodio.vercel.app/" about="_blank"> antonioamodio.it </a>
            </p>
          </div>
        )}
      </div>

      {/* Stili globali per il layer MindAR (fallback) */}
      <style jsx global>{`
        /* Il canvas deve stare sopra al video */
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
