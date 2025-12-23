import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { AssetsService } from './assets.js';
import { AnnotationService } from './annotations.js';
import { AnnotationAiAnalysisRunsService } from './annotation-ai-analysis-runs.js';
import { getConfig } from '../utils/config.js';
import { ProjectSettingsService } from './project-settings.js';

const MODEL_CACHE = new Map();
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

function safeStringify(value) {
  try {
    return JSON.stringify(
      value,
      (k, v) => {
        if (typeof v === 'bigint') return String(v);
        if (v instanceof Date) return v.toISOString();
        return v;
      },
      2
    );
  } catch {
    try {
      return JSON.stringify(String(value));
    } catch {
      return '"<unserializable>"';
    }
  }
}

function buildExifContextForAi(asset) {
  const raw = asset?.exifData;
  const rawIsObject = raw && typeof raw === 'object' && !Array.isArray(raw);
  const hasRaw = rawIsObject && Object.keys(raw).length > 0;

  const summary = {
    captureTimestamp: asset?.captureTimestamp || null,
    latitude: asset?.latitude ?? null,
    longitude: asset?.longitude ?? null,
    altitude: asset?.altitude ?? null,
    orientation: asset?.orientation ?? null,
    cameraMake: asset?.cameraMake || null,
    cameraModel: asset?.cameraModel || null,
    lens: asset?.lens || null,
    iso: asset?.iso ?? null,
    aperture: asset?.aperture ?? null,
    shutterSpeed: asset?.shutterSpeed ?? null,
    focalLength: asset?.focalLength ?? null,
    focalLength35mm: asset?.focalLength35mm ?? null,
    flash: asset?.flash ?? null,
    flashMode: asset?.flashMode || null,
    software: asset?.software || null,
    artist: asset?.artist || null,
    copyright: asset?.copyright || null,
  };

  // Keep the raw payload bounded; send a curated subset of common EXIF keys.
  const rawPicked = {};
  if (hasRaw) {
    const allowed = new Set(
      [
        'datetimeoriginal',
        'createdate',
        'modifydate',
        'make',
        'model',
        'lensmodel',
        'lens',
        'orientation',
        'gpslatitude',
        'gpslongitude',
        'gpsaltitude',
        'iso',
        'isospeedratings',
        'fnumber',
        'exposuretime',
        'shutterspeedvalue',
        'focallength',
        'focallengthin35mmformat',
        'software',
        'artist',
        'copyright',
      ]
    );

    for (const [key, value] of Object.entries(raw)) {
      const lower = String(key).toLowerCase();
      if (!allowed.has(lower) && !lower.startsWith('gps') && !lower.includes('date') && !lower.includes('time')) {
        continue;
      }

      // Only include JSON-friendly, reasonably small values.
      if (value == null) {
        rawPicked[key] = null;
        continue;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        rawPicked[key] = value;
        continue;
      }
      if (value instanceof Date) {
        rawPicked[key] = value.toISOString();
        continue;
      }
      if (Array.isArray(value) && value.length <= 32) {
        rawPicked[key] = value;
        continue;
      }
      if (typeof value === 'object') {
        // Allow simple nested objects; avoid massive blobs.
        const keys = Object.keys(value);
        if (keys.length <= 32) rawPicked[key] = value;
      }
    }
  }

  const payload = {
    summary,
    exif: Object.keys(rawPicked).length > 0 ? rawPicked : null,
  };

  // If nothing useful, skip.
  const summaryHasAny = Object.values(summary).some((v) => v !== null && v !== undefined && v !== '');
  const hasAny = summaryHasAny || payload.exif;
  if (!hasAny) return null;

  const text = safeStringify(payload);

  // Safety cap: avoid huge prompts.
  const maxChars = 6000;
  const capped = text.length > maxChars ? `${text.slice(0, maxChars)}\n...<truncated>` : text;
  return (
    'EXIF metadata (use as optional context; it may be missing or inaccurate):\n' +
    '```json\n' +
    capped +
    '\n```'
  );
}

function isLikelyVisionModelId(id) {
  const s = String(id || '').toLowerCase();
  if (!s) return false;

  // Prefer explicit markers.
  if (s.includes('vision')) return true;
  if (s.includes('multimodal')) return true;

  // Common open-source vision model families / suffixes.
  const tokens = [
    'llava',
    'qwen2-vl',
    'qwen-vl',
    'minicpm-v',
    'phi-3.5-vision',
    'phi-4-vision',
    'pixtral',
    'idefics',
    'instructvl',
    '-vl',
    '_vl',
  ];

  return tokens.some((t) => s.includes(t));
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function extractFirstJsonObject(text) {
  if (!text || typeof text !== 'string') return null;

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;

  // Naive brace matching to find the first JSON object.
  let depth = 0;
  for (let i = firstBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      return text.slice(firstBrace, i + 1).trim();
    }
  }

  return null;
}

function normalizeLicensePlates(value) {
  if (!value) return [];

  const normalizeOne = (plate) => {
    if (typeof plate !== 'string') return null;
    let s = plate.trim();
    if (!s) return null;

    // Normalize: uppercase, strip whitespace, keep only letters/digits/hyphen.
    s = s.toUpperCase().replace(/\s+/g, '');
    s = s.replace(/[^A-Z0-9-]/g, '');

    // Heuristic: models often include the EU/country code from the blue strip.
    // Example: FINABC-123 -> ABC-123
    // Only strip when the remaining looks like a plausible plate.
    const maybeStripPrefix = (prefix) => {
      if (!s.startsWith(prefix)) return s;
      const rest = s.slice(prefix.length);
      if (!rest) return s;
      const looksLikePlate = /[0-9]/.test(rest) && /[A-Z]/.test(rest) && rest.length >= 4;
      return looksLikePlate ? rest : s;
    };

    // Common EU strip / country codes seen on plates.
    for (const prefix of ['FIN', 'SF', 'SWE', 'EST', 'EU']) {
      s = maybeStripPrefix(prefix);
    }

    return s || null;
  };

  if (Array.isArray(value)) {
    return value
      .map(normalizeOne)
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map(normalizeOne)
      .filter(Boolean);
  }
  return [];
}

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((x) => (typeof x === 'string' ? x.trim() : null))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeBoxCoordinates(coords) {
  if (!coords || typeof coords !== 'object') return null;
  const x = Number(coords.x);
  const y = Number(coords.y);
  const width = Number(coords.width);
  const height = Number(coords.height);

  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;

  let left = x;
  let top = y;
  let w = width;
  let h = height;

  if (w < 0) {
    left = x + w;
    w = Math.abs(w);
  }
  if (h < 0) {
    top = y + h;
    h = Math.abs(h);
  }

  // Convert to integer pixel crop.
  return {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}

export class ImageAnalysisService {
  constructor(dbPool, { baseUrl, defaultModel, timeoutMs } = {}) {
    this.dbPool = dbPool;
    this.baseUrl = baseUrl || null;
    this.defaultModel = defaultModel || null;
    this.timeoutMs = timeoutMs || null;
    this.aiEnabled = true;
    this.aiSendExif = false;
  }

  async #ensureConfig() {
    const cfg = await getConfig();

    let project = null;
    try {
      const projectSvc = new ProjectSettingsService(this.dbPool);
      project = await projectSvc.getProjectSettings({ recomputeIfAutoUpdate: false });
    } catch {
      project = null;
    }

    this.aiEnabled = project?.aiEnabled !== false;
    this.aiSendExif = project?.aiSendExif === true;

    const baseUrlFromProject = project?.lmStudioBaseUrl ? String(project.lmStudioBaseUrl) : null;
    const modelFromProject = project?.lmStudioModel ? String(project.lmStudioModel) : null;

    this.baseUrl = (this.baseUrl || baseUrlFromProject || cfg.lmStudio.baseUrl).replace(/\/$/, '');
    this.defaultModel = this.defaultModel || modelFromProject || cfg.lmStudio.model || null;
    this.timeoutMs = Number(this.timeoutMs || cfg.lmStudio.timeoutMs || 60000);
  }

  async listLmStudioModels({ visionOnly = true } = {}) {
    await this.#ensureConfig();
    // Allow listing models even if AI features are disabled,
    // so Settings can be prepared ahead of enabling.

    const cacheKey = `${this.baseUrl}::visionOnly=${visionOnly}`;
    const cached = MODEL_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.value;

    const models = await this.#fetchLmStudioModels();
    const enriched = (models || [])
      .map((m) => {
        const id = String(m?.id || '').trim();
        if (!id) return null;
        const caps = m?.capabilities;
        const isVision =
          (caps && typeof caps === 'object' && caps.vision === true) ||
          isLikelyVisionModelId(id);
        return { id, isVision };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const result = visionOnly ? enriched.filter((m) => m.isVision) : enriched;

    MODEL_CACHE.set(cacheKey, { at: Date.now(), value: result });
    return result;
  }

  async testLmStudioVisionModel({ model }) {
    await this.#ensureConfig();

    const selectedModel = String(model || this.defaultModel || '').trim();
    if (!selectedModel) {
      return { ok: false, isVision: false, message: 'No model selected' };
    }

    // Use a real uploaded asset for the vision test.
    // This avoids false positives and ensures the system is actually able to read an image from disk.
    let testImage;
    try {
      const { rows } = await this.dbPool.query(
        `
          SELECT storage_path
          FROM assets
          WHERE deleted_at IS NULL
          ORDER BY uploaded_at DESC, created_at DESC
          LIMIT 1
        `
      );
      const storagePath = rows?.[0]?.storage_path;
      if (!storagePath) {
        return {
          ok: false,
          isVision: false,
          message: 'No assets found. Upload at least one image before running a vision test.',
        };
      }

      const absolute = this.#resolveUploadPath(storagePath);
      const buffer = await fs.readFile(absolute);
      testImage = await this.#prepareImageForVision(buffer);
    } catch (err) {
      return {
        ok: false,
        isVision: false,
        message: err?.message || 'Failed to load an uploaded image for vision test',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const imageBase64 = testImage.buffer.toString('base64');
    const imageUrl = `data:${testImage.mimeType};base64,${imageBase64}`;
    const body = {
      model: selectedModel,
      temperature: 0,
      max_tokens: 16,
      messages: [
        {
          role: 'system',
          content: 'You are a vision capability test. If you can see the image, reply with OK. If not, say NO_IMAGE.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Reply with OK if you can process the attached image.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    };

    try {
      const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await resp.text().catch(() => '');
      if (!resp.ok) {
        const msg = text || resp.statusText || 'Request failed';
        const lowered = String(msg).toLowerCase();
        const looksLikeNoVision =
          lowered.includes('image') &&
          (lowered.includes('not supported') || lowered.includes('unsupported') || lowered.includes('cannot') || lowered.includes("can't"));
        return {
          ok: false,
          isVision: looksLikeNoVision ? false : false,
          message: looksLikeNoVision ? msg : `Request failed (${resp.status}): ${msg}`,
        };
      }

      const parsed = safeJsonParse(text);
      const content = parsed.ok ? parsed.value?.choices?.[0]?.message?.content : null;
      const contentText = typeof content === 'string' ? content : String(text || '').trim();
      const c = contentText.toLowerCase();

      if (c.includes('no_image') || (c.includes("can't") && c.includes('image')) || (c.includes('cannot') && c.includes('image'))) {
        return { ok: true, isVision: false, message: contentText || 'Model indicates no image support' };
      }
      return { ok: true, isVision: true, message: contentText || 'Vision request succeeded' };
    } catch (err) {
      return { ok: false, isVision: false, message: err?.message || String(err) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async #fetchLmStudioModels() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, this.timeoutMs || 60000));
    try {
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`LM Studio models request failed (${resp.status}): ${text || resp.statusText}`);
      }
      const parsed = safeJsonParse(text);
      const list = parsed.ok ? parsed.value : null;
      const data = Array.isArray(list?.data) ? list.data : [];
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }


  async analyzeImageByAssetId(assetId, { model = null, persist = true, userId = null } = {}) {
    await this.#ensureConfig();
    if (!this.aiEnabled) throw new Error('AI features are disabled in Settings');
    const assetsService = new AssetsService(this.dbPool);
    const asset = await assetsService.getAssetById(assetId);
    if (!asset) throw new Error('Image not found');

    const absolutePath = this.#resolveUploadPath(asset.filePath);
    const originalBuffer = await fs.readFile(absolutePath);

    const orientedBuffer = await this.#normalizeOrientation(originalBuffer);
    const prepared = await this.#prepareImageForVision(orientedBuffer);

    const selectedModel = model || this.defaultModel;
    if (!selectedModel) {
      throw new Error('LM Studio model not configured. Set LM_STUDIO_MODEL or pass model argument.');
    }

    const exifContext = this.aiSendExif ? buildExifContextForAi(asset) : null;

    const analysis = await this.#callLmStudioVision({
      model: selectedModel,
      imageBuffer: prepared.buffer,
      mimeType: prepared.mimeType,
      exifContext,
    });

    const result = {
      caption: analysis.caption || null,
      licensePlates: analysis.licensePlates || [],
      model: selectedModel,
      createdAt: new Date().toISOString(),
      raw: analysis.raw || null,
    };

    if (persist) {
      await assetsService.setAssetAiAnalysis(assetId, result);
    }

    await logger.info({
      dbPool: this.dbPool,
      userId,
      eventType: 'image_ai_analysis',
      message: 'Image analyzed via LM Studio',
      details: {
        assetId,
        model: selectedModel,
        persist,
      },
    });

    return result;
  }

  async analyzeAnnotationById(
    annotationId,
    { regionId = null, model = null, persist = true, userId = null } = {}
  ) {
    await this.#ensureConfig();
    if (!this.aiEnabled) throw new Error('AI features are disabled in Settings');
    const annotationService = new AnnotationService(this.dbPool);
    const assetsService = new AssetsService(this.dbPool);

    const annotation = await annotationService.getAnnotationById(annotationId);
    if (!annotation) throw new Error('Annotation not found');

    const regions = await annotationService.getRegionsByAnnotationId(annotationId);
    const selectedRegion = regionId
      ? regions.find((r) => String(r.id) === String(regionId))
      : regions[0];

    const asset = await assetsService.getAssetById(annotation.assetId);
    if (!asset) throw new Error('Image not found');

    const absolutePath = this.#resolveUploadPath(asset.filePath);
    const originalBuffer = await fs.readFile(absolutePath);

    const orientedBuffer = await this.#normalizeOrientation(originalBuffer);
    let bufferForVision = orientedBuffer;
    let cropDebug = null;

    if (selectedRegion?.shapeType === 'BOX') {
      const crop = normalizeBoxCoordinates(selectedRegion.coordinates);
      if (crop) {
        const cropped = await this.#cropBoxWithDebug(orientedBuffer, crop);
        bufferForVision = cropped.buffer;
        cropDebug = cropped.debug;
      }
    }

    const prepared = await this.#prepareImageForVision(bufferForVision);

    const selectedModel = model || this.defaultModel;
    if (!selectedModel) {
      throw new Error('LM Studio model not configured. Set LM_STUDIO_MODEL or pass model argument.');
    }

    const exifContext = this.aiSendExif ? buildExifContextForAi(asset) : null;

    const analysis = await this.#callLmStudioVisionForAnnotation({
      model: selectedModel,
      imageBuffer: prepared.buffer,
      mimeType: prepared.mimeType,
      exifContext,
    });

    // Persist a run record for debugging/history (including the exact image bytes sent to the model).
    let runId = null;
    let cropUrl = null;
    try {
      const runs = new AnnotationAiAnalysisRunsService(this.dbPool);
      const run = await runs.createRun({
        annotationId,
        assetId: annotation.assetId,
        regionId: selectedRegion?.id || null,
        createdBy: userId,
        model: selectedModel,
        analysis: {
          caption: analysis.caption || null,
          tags: analysis.tags || [],
          licensePlates: analysis.licensePlates || [],
          raw: analysis.raw || null,
        },
        cropBuffer: prepared.buffer,
        cropMimeType: prepared.mimeType,
        cropDebug,
      });
      runId = run?.id || null;
      cropUrl = run?.cropPath || null;
    } catch (err) {
      await logger.warn({
        dbPool: this.dbPool,
        userId,
        eventType: 'annotation_ai_analysis_run_persist_failed',
        message: 'Failed to persist annotation AI analysis run',
        details: {
          annotationId,
          regionId: selectedRegion?.id || null,
          error: err?.message || String(err),
        },
      });
    }

    const result = {
      caption: analysis.caption || null,
      tags: analysis.tags || [],
      licensePlates: analysis.licensePlates || [],
      model: selectedModel,
      createdAt: new Date().toISOString(),
      raw: analysis.raw || null,
      runId,
      cropUrl,
      cropDebug,
    };

    if (persist) {
      await annotationService.setAnnotationAiAnalysis(annotationId, result);
    }

    await logger.info({
      dbPool: this.dbPool,
      userId,
      eventType: 'annotation_ai_analysis',
      message: 'Annotation analyzed via LM Studio',
      details: {
        annotationId,
        regionId: selectedRegion?.id || null,
        assetId: annotation.assetId,
        model: selectedModel,
        persist,
      },
    });

    return result;
  }

  async analyzeAnnotationDraft(
    assetId,
    { shapeType = 'BOX', coordinates = null, model = null, userId = null } = {}
  ) {
    await this.#ensureConfig();
    if (!this.aiEnabled) throw new Error('AI features are disabled in Settings');
    const assetsService = new AssetsService(this.dbPool);

    const asset = await assetsService.getAssetById(assetId);
    if (!asset) throw new Error('Image not found');

    const absolutePath = this.#resolveUploadPath(asset.filePath);
    const originalBuffer = await fs.readFile(absolutePath);

    const orientedBuffer = await this.#normalizeOrientation(originalBuffer);
    let bufferForVision = orientedBuffer;
    let cropDebug = null;
    if (shapeType === 'BOX') {
      const crop = normalizeBoxCoordinates(coordinates);
      if (crop) {
        const cropped = await this.#cropBoxWithDebug(orientedBuffer, crop);
        bufferForVision = cropped.buffer;
        cropDebug = cropped.debug;
      }
    }

    const prepared = await this.#prepareImageForVision(bufferForVision);

    const selectedModel = model || this.defaultModel;
    if (!selectedModel) {
      throw new Error('LM Studio model not configured. Set LM_STUDIO_MODEL or pass model argument.');
    }

    const analysis = await this.#callLmStudioVisionForAnnotation({
      model: selectedModel,
      imageBuffer: prepared.buffer,
      mimeType: prepared.mimeType,
    });

    const result = {
      caption: analysis.caption || null,
      tags: analysis.tags || [],
      licensePlates: analysis.licensePlates || [],
      model: selectedModel,
      createdAt: new Date().toISOString(),
      raw: analysis.raw || null,
      cropDataUrl: `data:${prepared.mimeType};base64,${prepared.buffer.toString('base64')}`,
      cropDebug,
    };

    await logger.info({
      dbPool: this.dbPool,
      userId,
      eventType: 'annotation_ai_analysis_draft',
      message: 'Draft annotation analyzed via LM Studio',
      details: {
        assetId,
        shapeType,
        model: selectedModel,
      },
    });

    return result;
  }

  #resolveUploadPath(storagePath) {
    if (!storagePath || typeof storagePath !== 'string') {
      throw new Error('Invalid storage path');
    }

    // Expected: /uploads/<filename>
    const normalized = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;

    // Prevent path traversal.
    if (!normalized.startsWith('uploads/')) {
      throw new Error('Unsupported storage path (expected uploads)');
    }

    const absolute = path.join(process.cwd(), normalized);
    return absolute;
  }

  async #prepareImageForVision(buffer) {
    try {
      // Ensure EXIF orientation is applied before resizing/encoding.
      const meta = await sharp(buffer).rotate().metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;

      // Keep detail for plates but avoid huge payloads.
      const maxDim = 1600;
      const shouldResize = (width && width > maxDim) || (height && height > maxDim);

      const pipeline = sharp(buffer)
        .rotate()
        .resize(
          shouldResize
            ? { width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true }
            : undefined
        )
        .jpeg({ quality: 85 });

      const out = await pipeline.toBuffer();
      return { buffer: out, mimeType: 'image/jpeg' };
    } catch {
      // If sharp fails, fall back to sending the original as jpeg-ish.
      return { buffer, mimeType: 'image/jpeg' };
    }
  }

  async #cropBoxWithDebug(buffer, crop) {
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width || 0;
    const imgH = meta.height || 0;
    if (!imgW || !imgH) return { buffer, debug: null };

    const left = Math.min(Math.max(0, crop.left), imgW - 1);
    const top = Math.min(Math.max(0, crop.top), imgH - 1);
    const width = Math.min(crop.width, imgW - left);
    const height = Math.min(crop.height, imgH - top);

    if (width < 1 || height < 1) {
      return { buffer, debug: { imgW, imgH, left, top, width, height, note: 'invalid_crop_used_full_image' } };
    }

    const out = await sharp(buffer)
      .extract({ left, top, width, height })
      .toBuffer();

    return {
      buffer: out,
      debug: { imgW, imgH, left, top, width, height },
    };
  }

  async #normalizeOrientation(buffer) {
    try {
      // Auto-rotate based on EXIF orientation and strip the orientation flag.
      return await sharp(buffer).rotate().toBuffer();
    } catch {
      return buffer;
    }
  }

  async #callLmStudioVision({ model, imageBuffer, mimeType, exifContext = null }) {
    const imageBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const systemPrompt =
      'You are a vision assistant for investigative image triage. ' +
      'Return ONLY valid JSON with keys: caption (string), licensePlates (string[]). ' +
      'caption must be a short, factual description (<= 20 words). ' +
      'licensePlates should include only clearly visible plate numbers; if none, return an empty array. ' +
      'IMPORTANT: Ignore any country code / EU strip text (e.g., FIN, SF, SWE, EU) printed in the blue band; do NOT include it in the plate number.';

    const userText =
      'Analyze the image. Extract any clearly readable vehicle license plate numbers. ' +
      'If you see a country code on the blue strip (e.g., FIN), ignore it and return only the actual plate identifier (e.g., AVC-123). ' +
      'Also produce a short caption of what the image contains.';

    const body = {
      model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            ...(exifContext ? [{ type: 'text', text: exifContext }] : []),
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`LM Studio request failed (${resp.status}): ${text || resp.statusText}`);
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      const contentText = typeof content === 'string' ? content : JSON.stringify(content);

      const jsonCandidate = extractFirstJsonObject(contentText) || contentText;
      const parsed = safeJsonParse(jsonCandidate);

      if (!parsed.ok) {
        return {
          caption: contentText?.trim() || null,
          licensePlates: [],
          raw: { text: contentText },
        };
      }

      const caption = typeof parsed.value.caption === 'string' ? parsed.value.caption.trim() : null;
      const licensePlates = normalizeLicensePlates(parsed.value.licensePlates);

      return {
        caption,
        licensePlates,
        raw: parsed.value,
      };
    } catch (err) {
      await logger.error({
        dbPool: this.dbPool,
        eventType: 'image_ai_analysis_error',
        message: 'LM Studio vision call failed',
        details: {
          baseUrl: this.baseUrl,
          model,
          error: err?.message || String(err),
        },
      });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #callLmStudioVisionForAnnotation({ model, imageBuffer, mimeType, exifContext = null }) {
    const imageBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const systemPrompt =
      'You are a vision assistant for annotation support. ' +
      'Return ONLY valid JSON with keys: caption (string), tags (string[]), licensePlates (string[]). ' +
      'caption must describe what is inside the selected region (<= 20 words). ' +
      'tags must be short and machine-friendly (lowercase, use underscores or hyphens), without leading #. ' +
      'licensePlates should include only clearly visible plate numbers; if none, return an empty array. ' +
      'IMPORTANT: Ignore any country code / EU strip text (e.g., FIN, SF, SWE, EU) printed in the blue band; do NOT include it in the plate number.';

    const userText =
      'Analyze this cropped region of an image. ' +
      '1) Provide a short caption of what is visible in the region. ' +
      '2) Provide a small list of suggested tags for the region content. ' +
      '3) Extract any clearly readable vehicle license plate numbers (ignore country code text on the blue strip, e.g., FIN; return only the plate identifier like ABC-123).';

    const body = {
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            ...(exifContext ? [{ type: 'text', text: exifContext }] : []),
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`LM Studio request failed (${resp.status}): ${text || resp.statusText}`);
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      const contentText = typeof content === 'string' ? content : JSON.stringify(content);

      const jsonCandidate = extractFirstJsonObject(contentText) || contentText;
      const parsed = safeJsonParse(jsonCandidate);

      if (!parsed.ok) {
        return {
          caption: contentText?.trim() || null,
          tags: [],
          licensePlates: [],
          raw: { text: contentText },
        };
      }

      const caption = typeof parsed.value.caption === 'string' ? parsed.value.caption.trim() : null;
      const tags = normalizeTags(parsed.value.tags);
      const licensePlates = normalizeLicensePlates(parsed.value.licensePlates);

      return {
        caption,
        tags,
        licensePlates,
        raw: parsed.value,
      };
    } catch (err) {
      await logger.error({
        dbPool: this.dbPool,
        eventType: 'annotation_ai_analysis_error',
        message: 'LM Studio vision call failed (annotation)',
        details: {
          baseUrl: this.baseUrl,
          model,
          error: err?.message || String(err),
        },
      });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
