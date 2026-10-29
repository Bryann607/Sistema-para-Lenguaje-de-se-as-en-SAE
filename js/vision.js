// Cámara + detección de cuerpo y manos con MediaPipe (todo corre en el navegador).
// MediaPipe se importa de forma dinámica para que la interfaz cargue aunque no haya internet.

import { MP_MODULE, MP_WASM, POSE_MODEL, HAND_MODEL, SAMPLE_MS } from './config.js';
import { extractFeatures } from './features.js';

export class Vision {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.ready = false;
    this.onSample = null;   // (features, info) cada SAMPLE_MS
    this.onFrame = null;    // (info, fps) en cada fotograma procesado
    this._lastT = -1;
    this._lastSample = 0;
    this._fpsCount = 0;
    this._fpsT = performance.now();
    this._loop = this._loop.bind(this);
  }

  async init() {
    if (this.ready) return;
    this.mp = await import(MP_MODULE);
    const { FilesetResolver, PoseLandmarker, HandLandmarker, DrawingUtils } = this.mp;
    const fileset = await FilesetResolver.forVisionTasks(MP_WASM);
    const make = async (delegate) => {
      const pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1,
      });
      const hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
      });
      return { pose, hand };
    };
    try { ({ pose: this.pose, hand: this.hand } = await make('GPU')); this.delegate = 'GPU'; }
    catch (e) { console.warn('GPU no disponible, usando CPU', e); ({ pose: this.pose, hand: this.hand } = await make('CPU')); this.delegate = 'CPU'; }
    this.du = new DrawingUtils(this.ctx);
    this.ready = true;
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara. Abre la página desde https:// o desde localhost.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.running = true;
    this._lastT = -1;
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this._lastT) {
      this._lastT = v.currentTime;
      const now = performance.now();
      let pr, hr;
      try {
        pr = this.pose.detectForVideo(v, now);
        hr = this.hand.detectForVideo(v, now);
      } catch (e) { console.error(e); requestAnimationFrame(this._loop); return; }
      this._draw(pr, hr);
      const { features, info } = extractFeatures(pr.landmarks?.[0], hr.landmarks, v.videoWidth / v.videoHeight);
      this._fpsCount++;
      if (now - this._fpsT >= 1000) {
        this.fps = this._fpsCount; this._fpsCount = 0; this._fpsT = now;
      }
      this.onFrame?.(info, this.fps || 0);
      if (now - this._lastSample >= SAMPLE_MS) {
        this._lastSample = now;
        this.onSample?.(features, info);
      }
    }
    requestAnimationFrame(this._loop);
  }

  _draw(pr, hr) {
    const { PoseLandmarker, HandLandmarker } = this.mp;
    const ctx = this.ctx, du = this.du;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const upper = PoseLandmarker.POSE_CONNECTIONS.filter((c) => c.start >= 11 && c.end <= 22);
    for (const lm of pr.landmarks || []) {
      du.drawConnectors(lm, upper, { color: 'rgba(255,255,255,0.7)', lineWidth: 3 });
      du.drawLandmarks(lm.slice(11, 23), { color: 'rgba(255,255,255,0.9)', fillColor: '#ffffff', radius: 3 });
    }
    for (const h of hr.landmarks || []) {
      du.drawConnectors(h, HandLandmarker.HAND_CONNECTIONS, { color: '#ff0340', lineWidth: 5 });
      du.drawLandmarks(h, { color: '#ffffff', fillColor: '#ff0340', radius: 4, lineWidth: 1 });
    }
  }
}
