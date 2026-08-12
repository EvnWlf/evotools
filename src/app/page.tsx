'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  UploadCloud,
  Download,
  Box,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Cpu,
  Sun,
  Moon,
  Compass,
  ShieldCheck,
} from 'lucide-react';

declare global {
  interface Window {
    occtimportjs?: (options?: any) => Promise<any>;
  }
}

type ThemeMode = 'light' | 'dark';

export default function CADConverterPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const currentMeshRef = useRef<THREE.Object3D | null>(null);
  const occtInstanceRef = useRef<any>(null);

  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [glbBlob, setGlbBlob] = useState<Blob | null>(null);
  const [wireframe, setWireframe] = useState<boolean>(false);

  // Detect and listen to OS color scheme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  // Initialize Three.js Viewport
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(100, 100, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(80, 120, 80);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fillLight.position.set(-80, -60, -80);
    scene.add(fillLight);

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Dynamically update viewport colors on theme change
  useEffect(() => {
    if (!sceneRef.current) return;

    const isDark = theme === 'dark';

    sceneRef.current.background = new THREE.Color(isDark ? 0x090d16 : 0xf8fafc);

    if (gridHelperRef.current) {
      sceneRef.current.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
    }

    const newGrid = new THREE.GridHelper(
      300,
      30,
      isDark ? 0x334155 : 0x94a3b8,
      isDark ? 0x1e293b : 0xe2e8f0
    );
    newGrid.position.y = -0.05;
    gridHelperRef.current = newGrid;
    sceneRef.current.add(newGrid);
  }, [theme]);

  const fitCameraToObject = useCallback((object: THREE.Object3D) => {
    if (!sceneRef.current) return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 50 / (maxDim || 1);
    object.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(object);
    scaledBox.getCenter(center);
    object.position.sub(center);
  }, []);

  const handleManualDownload = () => {
    if (!glbBlob || !fileName) return;
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || 'converted_model';
    const finalName = `${baseName}.glb`;
    const url = URL.createObjectURL(glbBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getOcctEngine = async () => {
    if (occtInstanceRef.current) return occtInstanceRef.current;

    setStatusDetail('Initializing WebAssembly B-Rep engine...');

    if (!window.occtimportjs) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/occt-import-js@0.0.22/dist/occt-import-js.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load WebAssembly CAD runtime.'));
        document.head.appendChild(script);
      });
    }

    if (typeof window.occtimportjs !== 'function') {
      throw new Error('OCCT WASM initializer is unavailable.');
    }

    occtInstanceRef.current = await window.occtimportjs({
      locateFile: (name: string) => `https://unpkg.com/occt-import-js@0.0.22/dist/${name}`,
    });

    return occtInstanceRef.current;
  };

  const process3DFile = async (file: File) => {
    if (!file) return;

    setStatus('processing');
    setStatusDetail('Buffering file payload...');
    setErrorMessage('');
    setGlbBlob(null);
    setFileName(file.name);
    setFileSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const arrayBuffer = await file.arrayBuffer();

    try {
      if (!sceneRef.current) throw new Error('3D Viewport is not initialized.');

      if (currentMeshRef.current) {
        sceneRef.current.remove(currentMeshRef.current);
        currentMeshRef.current = null;
      }

      let loadedObject: THREE.Object3D;
      const defaultMaterial = new THREE.MeshStandardMaterial({
        color: theme === 'dark' ? 0x94a3b8 : 0x64748b,
        metalness: 0.25,
        roughness: 0.35,
        wireframe,
      });

      if (['step', 'stp', 'iges', 'igs', 'brep'].includes(ext)) {
        const occt = await getOcctEngine();
        setStatusDetail('Tessellating CAD analytical surfaces...');
        const uint8Buffer = new Uint8Array(arrayBuffer);

        let result;
        if (ext === 'step' || ext === 'stp') {
          result = occt.ReadStepFile(uint8Buffer, null);
        } else if (ext === 'iges' || ext === 'igs') {
          result = occt.ReadIgesFile(uint8Buffer, null);
        } else {
          result = occt.ReadBrepFile(uint8Buffer, null);
        }

        if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
          throw new Error('CAD interpretation failed. Please verify that the file geometry is valid.');
        }

        const cadGroup = new THREE.Group();
        for (const meshData of result.meshes) {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3)
          );

          if (meshData.attributes.normal) {
            geom.setAttribute(
              'normal',
              new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3)
            );
          } else {
            geom.computeVertexNormals();
          }

          if (meshData.index) {
            geom.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.index.array), 1));
          }

          let meshMat = defaultMaterial;
          if (meshData.color) {
            meshMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2]),
              metalness: 0.25,
              roughness: 0.35,
              wireframe,
            });
          }

          const mesh = new THREE.Mesh(geom, meshMat);
          cadGroup.add(mesh);
        }
        loadedObject = cadGroup;
      } else if (ext === 'stl') {
        const loader = new STLLoader();
        const geometry = loader.parse(arrayBuffer);
        loadedObject = new THREE.Mesh(geometry, defaultMaterial);
      } else if (ext === 'obj') {
        const loader = new OBJLoader();
        const text = new TextDecoder().decode(arrayBuffer);
        loadedObject = loader.parse(text);
      } else if (ext === 'ply') {
        const loader = new PLYLoader();
        const geometry = loader.parse(arrayBuffer);
        loadedObject = new THREE.Mesh(geometry, defaultMaterial);
      } else if (ext === '3mf') {
        const loader = new ThreeMFLoader();
        loadedObject = loader.parse(arrayBuffer);
      } else if (ext === 'fbx') {
        const loader = new FBXLoader();
        loadedObject = loader.parse(arrayBuffer, '');
      } else if (ext === 'gltf' || ext === 'glb') {
        const loader = new GLTFLoader();
        const gltf = await loader.parseAsync(arrayBuffer, '');
        loadedObject = gltf.scene;
      } else {
        throw new Error(`Unsupported extension: ".${ext}".`);
      }

      sceneRef.current.add(loadedObject);
      currentMeshRef.current = loadedObject;
      fitCameraToObject(loadedObject);

      setStatusDetail('Packaging binary glTF (.glb)...');
      const exporter = new GLTFExporter();
      exporter.parse(
        loadedObject,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
          setGlbBlob(blob);
          setStatus('done');
          setStatusDetail('Ready for download');
        },
        (err) => {
          console.error(err);
          setErrorMessage('Error generating binary GLB asset.');
          setStatus('error');
        },
        { binary: true }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during processing.';
      setErrorMessage(msg);
      setStatus('error');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      process3DFile(files[0]);
    }
  };

  const toggleWireframe = () => {
    setWireframe((prev) => {
      const next = !prev;
      if (currentMeshRef.current) {
        currentMeshRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.material && 'wireframe' in mesh.material) {
              (mesh.material as THREE.MeshStandardMaterial).wireframe = next;
            }
          }
        });
      }
      return next;
    });
  };

  const toggleManualTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isDark = theme === 'dark';

  return (
    <main
      className={`relative flex h-screen w-screen overflow-hidden select-none font-sans transition-colors duration-300 ${
        isDark ? 'bg-[#090d16] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div
          className={`absolute inset-0 z-50 backdrop-blur-md border-4 border-dashed flex flex-col items-center justify-center pointer-events-none transition-all ${
            isDark
              ? 'bg-slate-950/80 border-sky-500/80 text-white'
              : 'bg-white/80 border-sky-600/80 text-slate-900'
          }`}
        >
          <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 mb-4 animate-bounce">
            <UploadCloud className="w-12 h-12 text-sky-500" />
          </div>
          <p className="text-xl font-semibold tracking-tight">Drop your CAD file here</p>
          <p className="text-xs opacity-75 mt-1">Direct client-side conversion to .GLB</p>
        </div>
      )}

      {/* 3D WebGL Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      </div>

      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 w-88 flex flex-col gap-3 pointer-events-auto">
        <div
          className={`backdrop-blur-xl border rounded-2xl p-5 shadow-2xl transition-all duration-200 ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 shadow-black/40'
              : 'bg-white/90 border-slate-200/80 shadow-slate-300/40'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/10 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500">
                <Box className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xs font-bold uppercase tracking-wider">EvoTools CAD</h1>
                <p className="text-[10px] opacity-60">Universal Web Engine</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-mono flex items-center gap-1 border ${
                  isDark
                    ? 'bg-slate-800/80 text-sky-400 border-sky-500/20'
                    : 'bg-slate-100 text-sky-700 border-sky-600/20'
                }`}
              >
                <Cpu className="w-3 h-3" /> WASM
              </span>
              <button
                onClick={toggleManualTheme}
                title={`Current Theme: ${theme.toUpperCase()} (Click to toggle)`}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              </button>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs opacity-75 mt-3 leading-relaxed">
            Drag and drop CAD assets (<strong className="font-semibold">STEP, STP, IGES, STL, OBJ, FBX, PLY</strong>) for in-browser inspection and export to <strong className="text-sky-500 font-semibold">.GLB</strong>.
          </p>

          {/* Upload Dropzone */}
          <label
            className={`mt-3.5 border border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
              isDark
                ? 'border-slate-700/80 bg-slate-950/40 hover:border-sky-500/60 hover:bg-slate-950/80'
                : 'border-slate-300 bg-slate-50/70 hover:border-sky-600/60 hover:bg-slate-100/80'
            }`}
          >
            <UploadCloud className="w-5 h-5 text-sky-500" />
            <div className="text-center">
              <span className="text-xs font-semibold block">Browse or Drop File</span>
              <span className="text-[10px] opacity-60 font-mono">B-Rep Solids / Polygon Meshes</span>
            </div>
            <input
              type="file"
              accept=".step,.stp,.iges,.igs,.brep,.stl,.obj,.ply,.fbx,.3mf,.gltf,.glb"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && process3DFile(e.target.files[0])}
            />
          </label>

          {/* File Status & Manual Download */}
          {fileName && (
            <div
              className={`mt-3 p-3 rounded-xl border flex flex-col gap-2 text-xs transition-all ${
                isDark
                  ? 'bg-slate-950/70 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-sky-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{fileName}</p>
                  <p className="text-[10px] opacity-60 font-mono">{fileSize}</p>
                </div>
              </div>

              {status === 'processing' && (
                <div className="flex items-center gap-2 text-amber-500 text-[11px] pt-1">
                  <RotateCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">{statusDetail}</span>
                </div>
              )}

              {status === 'done' && (
                <div className="flex items-center gap-1.5 text-emerald-500 text-[11px] font-semibold pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Processing complete</span>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-start gap-1.5 text-rose-500 text-[11px] pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Manual Download Button */}
          {status === 'done' && glbBlob && (
            <button
              onClick={handleManualDownload}
              className="mt-3 w-full bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-sky-600/20"
            >
              <Download className="w-3.5 h-3.5" />
              Download .GLB
            </button>
          )}

          {/* Wireframe Viewport Toggle */}
          <div className="mt-3 pt-3 border-t border-slate-200/10 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] opacity-70 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              Wireframe
            </span>
            <button
              onClick={toggleWireframe}
              disabled={!currentMeshRef.current}
              className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border transition-all disabled:opacity-40 cursor-pointer ${
                wireframe
                  ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                  : isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {wireframe ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Security & Privacy Callout */}
        <div
          className={`px-3.5 py-2 rounded-xl border text-[10px] flex items-center gap-2 ${
            isDark
              ? 'bg-slate-900/60 border-slate-800/80 text-slate-400'
              : 'bg-white/60 border-slate-200/80 text-slate-600'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Zero Server Uploads. Processed 100% in local memory.</span>
        </div>
      </div>

      {/* Viewport Camera Navigation Legend */}
      <div
        className={`absolute bottom-4 left-4 backdrop-blur-md border px-3.5 py-2 rounded-xl text-[10px] pointer-events-none flex items-center gap-4 shadow-lg transition-all ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-400'
            : 'bg-white/80 border-slate-200 text-slate-600'
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium">
          <Compass className="w-3.5 h-3.5 text-sky-500" />
          <span>Navigation</span>
        </div>
        <span className="opacity-40">|</span>
        <span>Left Click: Rotate</span>
        <span>Right Click: Pan</span>
        <span>Scroll: Zoom</span>
      </div>
    </main>
  );
}