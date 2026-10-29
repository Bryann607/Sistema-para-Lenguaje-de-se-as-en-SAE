// Constantes compartidas por toda la aplicación.
// IMPORTANTE: si cambias SEQ_LEN, SAMPLE_MS o FEATURE_DIM, los datasets y modelos
// anteriores dejan de ser compatibles y hay que volver a entrenar.

export const SEQ_LEN = 30;          // fotogramas por seña (~2 s a 15 Hz)
export const SAMPLE_MS = 66;        // intervalo de muestreo (~15 Hz)
export const POSE_POINTS = 25;      // puntos del cuerpo usados (0..24: cabeza, torso y brazos)
export const HAND_POINTS = 21;      // puntos por mano
export const FEATURE_DIM = POSE_POINTS * 3 + HAND_POINTS * 3 * 2; // 201
export const LEFT_OFFSET = POSE_POINTS * 3;
export const RIGHT_OFFSET = LEFT_OFFSET + HAND_POINTS * 3;

export const REPOSO = '__reposo__'; // clase "sin seña" (manos quietas / en reposo)
export const META_MUESTRAS = 40;    // meta de muestras por seña

export const MODEL_URL = 'model/modelo-lsp.json';
export const LABELS_URL = 'model/etiquetas.json';
export const MODEL_IDB = 'indexeddb://lsp-upsjb';
export const DATASET_MANIFEST = 'data/dataset/manifest.json';

export const MP_VERSION = '0.10.14';
export const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/+esm`;
export const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
export const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
