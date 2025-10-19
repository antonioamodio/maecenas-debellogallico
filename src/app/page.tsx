"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type {
  MindARAnchor,
  MindARThree,
} from "mind-ar/dist/mindar-image-three.prod.js";

type TrackingPhase = "preparing" | "ready" | "scanning" | "tracking" | "recovering";

type VideoPlane = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.VideoTexture;
  baseScale: THREE.Vector3;
  refresh: () => void;
  dispose: () => void;
};

type TrackingEntry = {
  anchor: MindARAnchor;
  video: HTMLVideoElement;
  plane: VideoPlane;
  active: boolean;
  targetIndex: number;
  resetPending: boolean;
};

const VIDEO_SOURCES = [
  { src: "/videos/video1.mp4", label: "I" },
  { src: "/videos/video2.mp4", label: "II" },
  { src: "/videos/video3.mp4", label: "III" },
] as const;

const PHASE_LABEL: Record<TrackingPhase, string> = {
  preparing: "Preparazione",
  ready: "Pronto",
  scanning: "Ricerca target",
  tracking: "Tracking stabile",
  recovering: "Riposizionamento",
};

const PHASE_MESSAGE: Record<TrackingPhase, string> = {
  preparing: "Sto caricando i contenuti in alta qualità…",
  ready: "Tocca “Avvia esperienza” e concedi l’accesso alla fotocamera.",
  scanning: "Allinea il target nel riquadro centrale mantenendo il dispositivo stabile.",
  tracking: "Target agganciato! Muoviti con gesti fluidi per mantenere il tracking.",
  recovering: "Target perso: riallinea lentamente l’immagine di riferimento.",
};

async function ensureVideoPlays(video: HTMLVideoElement, label: string) {
  try {
    await video.play();
  } catch (error) {
    console.warn(`Riproduzione ${label} bloccata, ritento in muto`, error);
    if (!video.muted) {
      video.muted = true;
    }
    try {
      await video.play();
    } catch (err) {
      console.error(`Riproduzione ${label} fallita definitivamente`, err);
    }
  }
}

declare global {
  interface Window {
    _stopResizeListener?: () => void;
  }
}

function createVideoElement(src: string) {
  const element = document.createElement("video");
  element.src = src;
  element.preload = "auto";
  element.loop = true;
  element.muted = true;
  element.playsInline = true;
  element.setAttribute("playsinline", "");
  element.crossOrigin = "anonymous";
  element.setAttribute("data-ar-video", src);

  Object.assign(element.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    width: "1px",
    height: "1px",
    left: "-9999px",
    top: "0",
  });

  const ready = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener("canplay", handleReady);
      element.removeEventListener("loadedmetadata", handleReady);
      element.removeEventListener("error", handleError);
    };

    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Impossibile caricare il video ${src}`));
    };

    if (element.readyState >= 2) {
      resolve();
    } else {
      element.addEventListener("canplay", handleReady, { once: true });
      element.addEventListener("loadedmetadata", handleReady, { once: true });
      element.addEventListener("error", handleError, { once: true });
      element.load();
    }
  });

  return { element, ready };
}

function makeVideoPlane(
  video: HTMLVideoElement,
  renderer: THREE.WebGLRenderer,
): VideoPlane {
  const COVER_SCALE = 1.1;
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const typedRenderer = renderer as THREE.WebGLRenderer & Partial<{
    outputColorSpace: THREE.ColorSpace;
  }>;

  if (typedRenderer.outputColorSpace !== undefined) {
    typedRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;

  const baseScale = new THREE.Vector3(1, 1, 1);
  mesh.scale.copy(baseScale);

  const applyAspect = () => {
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const aspect = vw / vh;
    baseScale.set(COVER_SCALE, COVER_SCALE / aspect, 1);
    mesh.scale.copy(baseScale);
  };

  if (video.readyState >= 1) {
    applyAspect();
  } else {
    video.addEventListener("loadedmetadata", applyAspect, { once: true });
  }

  return {
    mesh,
    texture,
    baseScale,
    refresh: () => {
      texture.needsUpdate = true;
    },
    dispose: () => {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

const TARGET_MESSAGES = [
  "Target I agganciato",
  "Target II agganciato",
  "Target III agganciato",
];

export default function ARPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videosRef = useRef<HTMLVideoElement[]>([]);
  const trackedEntriesRef = useRef<TrackingEntry[]>([]);
  const mindarRuntimeRef = useRef<{
    mindarThree: MindARThree;
    renderer: THREE.WebGLRenderer;
    cleanup: () => Promise<void> | void;
  } | null>(null);
  const recoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioGestureHandlerRef = useRef<((event: Event) => void) | null>(null);
  const enableAudioRef = useRef<() => Promise<void> | void>(() => undefined);
  const unmutedRef = useRef(false);

  const [phase, setPhase] = useState<TrackingPhase>("preparing");
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [unmuted, setUnmuted] = useState(false);
  const [activeTarget, setActiveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoadingProgress(0);
    setReady(false);
    setPhase("preparing");

    const preparations = VIDEO_SOURCES.map(({ src }) => {
      const prep = createVideoElement(src);
      prep.ready
        .then(() => setLoadingProgress((count) => count + 1))
        .catch((err) => {
          console.error(err);
          setError("Impossibile preparare i contenuti video richiesti.");
        });
      container.appendChild(prep.element);
      return prep;
    });

    videosRef.current = preparations.map((prep) => prep.element);

    Promise.all(preparations.map((prep) => prep.ready))
      .then(async () => {
        // Prime playback so the first frame è pronto quando il target viene agganciato.
        for (const video of videosRef.current) {
          try {
            video.muted = true;
            const playPromise = video.play();
            if (playPromise) {
              await playPromise;
            }
            video.pause();
            video.currentTime = 0;
          } catch (primeError) {
            console.warn("Impossibile inizializzare la riproduzione del video", primeError);
          }
        }
        setPhase("ready");
        setReady(true);
      })
      .catch(() => {
        setPhase("ready");
      });

    return () => {
      videosRef.current.forEach((video) => {
        video.pause();
        video.src = "";
        video.remove();
      });
      videosRef.current = [];
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recoverTimeoutRef.current) {
        clearTimeout(recoverTimeoutRef.current);
        recoverTimeoutRef.current = null;
      }
      window._stopResizeListener?.();
      if (audioGestureHandlerRef.current) {
        window.removeEventListener("touchend", audioGestureHandlerRef.current);
        window.removeEventListener("click", audioGestureHandlerRef.current);
        audioGestureHandlerRef.current = null;
      }
      const runtime = mindarRuntimeRef.current;
      mindarRuntimeRef.current = null;
      if (runtime) {
        runtime.cleanup().catch((cleanupError) => {
          console.warn("Errore in fase di cleanup MindAR", cleanupError);
        });
      }
    };
  }, []);

  const scheduleRecovery = () => {
    if (recoverTimeoutRef.current) {
      clearTimeout(recoverTimeoutRef.current);
    }
    if (trackedEntriesRef.current.some((entry) => entry.active)) {
      return;
    }

    setPhase("recovering");
    recoverTimeoutRef.current = setTimeout(() => {
      recoverTimeoutRef.current = null;
      if (!trackedEntriesRef.current.some((entry) => entry.active)) {
        setPhase("scanning");
      }
    }, 900);
  };

  const clearRecovery = () => {
    if (recoverTimeoutRef.current) {
      clearTimeout(recoverTimeoutRef.current);
      recoverTimeoutRef.current = null;
    }
  };

  const startAR = async () => {
    if (!containerRef.current || starting || !ready) return;

    setStarting(true);
    setError(null);
    setActiveTarget(null);
    setPhase("scanning");
    unmutedRef.current = false;
    setUnmuted(false);

    let mindarThree: MindARThree | null = null;
    let scene: THREE.Scene | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      const mindarModule = await import("mind-ar/dist/mindar-image-three.prod.js");
      mindarThree = new mindarModule.MindARThree({
        container: containerRef.current,
        imageTargetSrc: "/targets/targets.mind",
        maxTrack: 1,
        filterMinCF: 0.002,
        filterBeta: 0.02,
        warmupTolerance: 6,
        missTolerance: 3,
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
      });

      const { renderer: activeRenderer, scene: activeScene, camera } = mindarThree;
      renderer = activeRenderer;
      scene = activeScene;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(new THREE.Color(0x000000), 0);

      const entries: TrackingEntry[] = videosRef.current.map((video, index) => {
        const plane = makeVideoPlane(video, renderer!);
        plane.mesh.visible = false;
        plane.mesh.position.set(0, 0, 0);
        plane.mesh.rotation.set(0, 0, 0);
        plane.mesh.scale.copy(plane.baseScale);

        const anchor = mindarThree!.addAnchor(index);
        anchor.group.add(plane.mesh);

        const entry: TrackingEntry = {
          anchor,
          video,
          plane,
          active: false,
          targetIndex: index,
          resetPending: false,
        };

        anchor.onTargetFound = async () => {
          clearRecovery();
          entry.active = true;
          if (entry.resetPending) {
            try {
              video.currentTime = 0;
            } catch (setTimeError) {
              console.warn("Reset video non riuscito", setTimeError);
            }
            entry.resetPending = false;
          }
          plane.refresh();
          plane.mesh.visible = true;
          setActiveTarget(index);
          setPhase("tracking");
          await ensureVideoPlays(video, `target ${index + 1}`);
        };

        anchor.onTargetLost = () => {
          entry.active = false;
          plane.mesh.visible = false;
          video.pause();
          try {
            video.currentTime = 0;
          } catch (setTimeError) {
            console.warn("Reset video non riuscito", setTimeError);
          }
          plane.refresh();
          entry.resetPending = true;
          if (!trackedEntriesRef.current.some((item) => item.active)) {
            setActiveTarget(null);
            scheduleRecovery();
          }
        };

        return entry;
      });

      trackedEntriesRef.current = entries;

      const fitToScreen = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer!.setSize(width, height, false);
        if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
          const perspective = camera as THREE.PerspectiveCamera;
          perspective.aspect = width / height;
          perspective.updateProjectionMatrix();
        }
      };

      await mindarThree.start();
      setStarted(true);
      setStarting(false);
      setPhase("scanning");

      fitToScreen();
      const handleResize = () => fitToScreen();
      window.addEventListener("resize", handleResize);
      window.addEventListener("orientationchange", handleResize);
      window._stopResizeListener = () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("orientationchange", handleResize);
      };

      renderer!.setAnimationLoop(() => {
        renderer!.render(scene!, camera);
      });

      const enableAudio = async () => {
        if (unmutedRef.current) return;
        videosRef.current.forEach((video) => {
          video.muted = false;
        });
        for (const video of videosRef.current) {
          try {
            await video.play();
          } catch {
            // Alcuni browser bloccano la riproduzione dei video fuori dallo schermo.
          }
        }
        unmutedRef.current = true;
        setUnmuted(true);
        if (audioGestureHandlerRef.current) {
          window.removeEventListener("touchend", audioGestureHandlerRef.current);
          window.removeEventListener("click", audioGestureHandlerRef.current);
          audioGestureHandlerRef.current = null;
        }
      };

      enableAudioRef.current = enableAudio;
      const gestureHandler = () => {
        void enableAudio();
      };
      audioGestureHandlerRef.current = gestureHandler;
      window.addEventListener("touchend", gestureHandler, { once: true });
      window.addEventListener("click", gestureHandler, { once: true });

      mindarRuntimeRef.current = {
        mindarThree,
        renderer: renderer!,
        cleanup: async () => {
          renderer!.setAnimationLoop(null);
          clearRecovery();
          window._stopResizeListener?.();
          trackedEntriesRef.current.forEach((entry) => {
            entry.plane.mesh.visible = false;
            entry.anchor.group.remove(entry.plane.mesh);
            entry.plane.dispose();
          });
          trackedEntriesRef.current = [];
          try {
            await mindarThree.stop();
          } catch (stopError) {
            console.warn("Errore arrestando MindAR", stopError);
          }
        },
      };
    } catch (err) {
      if (mindarThree) {
        try {
          await mindarThree.stop();
        } catch (stopError) {
          console.warn("MindAR stop fallito dopo errore", stopError);
        }
      }
      trackedEntriesRef.current.forEach((entry) => {
        entry.anchor.group.remove(entry.plane.mesh);
        entry.plane.dispose();
      });
      trackedEntriesRef.current = [];
      setStarting(false);
      setPhase("ready");
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile avviare l’esperienza AR. Riprova.",
      );
    }
  };

  const handleManualUnmute = () => {
    void enableAudioRef.current?.();
  };

  const phaseMessage =
    activeTarget !== null && phase === "tracking"
      ? TARGET_MESSAGES[activeTarget] ?? PHASE_MESSAGE.tracking
      : PHASE_MESSAGE[phase];

  const progressLabel =
    phase === "preparing"
      ? `${loadingProgress}/${VIDEO_SOURCES.length}`
      : undefined;

  return (
    <main className="ar-shell">
      <div
        ref={containerRef}
        className="ar-stage"
        data-mindar-container
        style={{ touchAction: "manipulation" }}
      >
        {!started && (
          <div className="start-overlay">
            <div className="start-card">
              <span className="brand-tag">Maecenas · AR Studio</span>
              <h1>Debello Gallico</h1>
              <p className="start-lead">
                Allinea la stampa ufficiale per sbloccare l&apos;esperienza immersiva.
              </p>
              <ul className="start-steps">
                <li>Luce diffusa, niente riflessi diretti sul target.</li>
                <li>
                  Avvicinati lentamente finché l&apos;opera occupa il riquadro centrale.
                </li>
                <li>Un tap dopo l&apos;avvio attiverà anche l&apos;audio.</li>
              </ul>
              <button
                type="button"
                className="cta-button"
                onClick={startAR}
                disabled={!ready || starting}
              >
                {starting
                  ? "Avvio in corso…"
                  : ready
                    ? "Avvia esperienza"
                    : `Preparazione ${progressLabel}`}
              </button>
              <p className="start-footnote">
                Consiglio: usa una stampa A4 e mantieni il dispositivo parallelo all&apos;opera.
              </p>
              {error && <p className="start-error">{error}</p>}
            </div>
            <div className="start-footer">Tecnologia AR ottimizzata per mobile.</div>
          </div>
        )}

        {started && (
          <div className="hud">
            <div className="hud-row top">
              <span className="brand-chip">Maecenas · Debello Gallico</span>
              <span className={`status-chip status-${phase}`}>
                <span className="status-dot" />
                {PHASE_LABEL[phase]}
              </span>
            </div>
            <div className="hud-row bottom">
              <div className="status-message">{phaseMessage}</div>
              {!unmuted && (
                <button type="button" className="hud-button" onClick={handleManualUnmute}>
                  Attiva audio
                </button>
              )}
            </div>
          </div>
        )}

        {error && started && <div className="error-toast">{error}</div>}
      </div>
    </main>
  );
}
