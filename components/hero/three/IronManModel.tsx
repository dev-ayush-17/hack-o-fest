"use client";

/**
 * The optimized Iron Man suit (public/models/iron_man-opt.glb).
 *
 * The source GLB is authored in a Z-up, centimetre-scale space and is NOT
 * centered. Rather than hard-code magic transforms, we measure its bounding box
 * at load time and normalize it into a clean, predictable world:
 *
 *    • centered on X/Y/Z (center of mass at the origin — so a fixed, eye-level
 *      front camera frames it dead-center like a movie shot)
 *    • exactly MODEL_HEIGHT world-units tall
 *    • standing upright, facing +Z (toward the camera)
 *
 * That makes heroBeats.ts able to speak in friendly numbers ("y = 0 is the
 * floor", "1.75 is chest height") regardless of how the asset was exported.
 *
 * ───────────────────────── TUNABLES ─────────────────────────
 * If the suit looks wrong in `pnpm dev`, adjust these two first:
 */
export const MODEL_HEIGHT = 3.4; // world units, feet→crown. Bigger = taller suit.
export const BASE_ROT_Y = 0; // radians. If it faces away, try Math.PI.
/** If the model imports lying down, flip this. Most Sketchfab Z-up rigs need -90°X. */
const STAND_UP_Y = -Math.PI / 2;
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/iron_man-opt.glb";
// Local Draco decoder copied into /public/draco — passed as the `useDraco`
// string arg so drei wires DRACOLoader to it with no CDN round-trip.
const DRACO_PATH = "/draco/";

export function IronManModel({
  groupRef,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);

  // Clone so HMR / multiple mounts never share mutated materials.
  const model = useMemo(() => {
    const root = scene.clone(true);

    // 1) stand the model upright in its own pivot, then measure.
    const inner = new THREE.Group();
    root.rotation.set(0, STAND_UP_Y, 0);
    inner.add(root);

    // bake the rotation into world space before measuring the box.
    inner.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // 2) scale so the tallest axis === MODEL_HEIGHT.
    const tallest = Math.max(size.y, 0.0001);
    const s = MODEL_HEIGHT / tallest;

    // 3) recenter on all axes so the center of mass sits at the origin. A fixed
    //    eye-level camera looking at the origin then frames the suit dead-center
    //    (a "movie screen" shot) rather than appearing to look up at it.
    const fit = new THREE.Group();
    fit.add(inner);
    fit.scale.setScalar(s);
    fit.position.set(-center.x * s, -center.y * s, -center.z * s);
    // Base facing lives HERE (on the model wrapper), not on the outer group —
    // the outer group's rotation.y is overwritten every frame by the scroll
    // choreography, so a base yaw set there would be lost. Y-rotation keeps the
    // (already X/Z-centred) feet on y = 0, so this is safe.
    fit.rotation.y = BASE_ROT_Y;

    // 4) material polish for a believable metal suit + crisp emissive reactor.
    fit.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) {
          mat.envMapIntensity = 1.15;
          if (mat.metalnessMap) mat.metalness = 1;
          if (mat.map) mat.map.anisotropy = 4;
          // make the arc-reactor / repulsors actually glow under bloom
          if (mat.emissive && mat.emissiveIntensity < 1) {
            mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.1);
          }
          // allow the per-frame vis fade-in (skill STEP 6)
          mat.transparent = true;
          mat.needsUpdate = true;
        }
      }
    });

    return fit;
  }, [scene]);

  // free GPU memory of the clone on unmount
  const builtRef = useRef(model);
  builtRef.current = model;
  useEffect(() => {
    return () => {
      builtRef.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose?.());
          else mat?.dispose?.();
        }
      });
    };
  }, []);

  // The outer group is driven purely by scroll choreography (position / yaw /
  // scale) in IronManStage. Base facing is baked into `model` above.
  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
