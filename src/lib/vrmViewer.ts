import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { GREEN_SCREEN } from "./constants";

/**
 * A small, framework-agnostic wrapper around a Three.js scene that loads and
 * displays a VRM avatar over a solid green background. It owns the renderer,
 * camera, lights and the render loop so React never has to hold Three objects
 * in state (we only keep a ref to an instance of this class).
 *
 * Avatar facing: after `VRMUtils.rotateVRM0`, both VRM 0.0 and 1.0 avatars face
 * the +Z direction (matching the official three-vrm examples). The camera sits
 * on the +Z side looking toward -Z, so we always see the avatar's face.
 */
export class VrmViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly loader: GLTFLoader;
  private vrm: VRM | null = null;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(GREEN_SCREEN);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.3, 1.3);
    this.camera.lookAt(0, 1.3, 0);

    // Lights. The avatar faces +Z, so the key light comes from the front-top.
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(0.6, 1.6, 1.5);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9099a5, 1.2));

    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));

    this.startLoop();
  }

  /** Load a VRM from an object URL, replacing any previously loaded avatar. */
  async loadVrm(url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM;

    // Perf: drop geometry/joints the avatar doesn't need.
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    // Normalize facing so VRM 0.0 and 1.0 both look toward -Z.
    VRMUtils.rotateVRM0(vrm);
    // Avatars can extend past the frustum during tracking; don't cull them.
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = vrm;
    this.scene.add(vrm.scene);
    this.frameOnHead(vrm);
  }

  /** Position the camera to frame the head and a little of the upper body. */
  private frameOnHead(vrm: VRM): void {
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    const headPos = new THREE.Vector3(0, 1.35, 0);
    head?.getWorldPosition(headPos);
    const targetY = headPos.y - 0.12; // aim slightly below the head to include shoulders
    this.camera.position.set(0, targetY + 0.05, 1.25);
    this.camera.lookAt(0, targetY, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Keep the drawing buffer matched to the canvas's display size (and DPR). */
  private resizeToDisplaySize(): void {
    const canvas = this.renderer.domElement;
    const pr = Math.min(window.devicePixelRatio, 2);
    const width = Math.floor(canvas.clientWidth * pr);
    const height = Math.floor(canvas.clientHeight * pr);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
      this.camera.updateProjectionMatrix();
    }
  }

  private startLoop(): void {
    const tick = (): void => {
      this.rafId = requestAnimationFrame(tick);
      this.resizeToDisplaySize();
      const delta = this.clock.getDelta();
      this.vrm?.update(delta); // spring bones, expressions, look-at
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.renderer.dispose();
  }
}
