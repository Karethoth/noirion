import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { AssetsService } from './assets.js';
import { AnnotationService } from './annotations.js';
import { AnnotationAiAnalysisRunsService } from './annotation-ai-analysis-runs.js';
import { getConfig } from '../utils/config.js';

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
  }

  async #ensureConfig() {
    if (this.baseUrl && this.timeoutMs && (this.defaultModel || this.defaultModel === null)) return;
    const cfg = await getConfig();
    this.baseUrl = (this.baseUrl || cfg.lmStudio.baseUrl).replace(/\/$/, '');
    this.defaultModel = this.defaultModel || cfg.lmStudio.model || null;
    this.timeoutMs = Number(this.timeoutMs || cfg.lmStudio.timeoutMs || 60000);
  }

  async analyzeImageByAssetId(assetId, { model = null, persist = true, userId = null } = {}) {
    await this.#ensureConfig();
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

    const analysis = await this.#callLmStudioVision({
      model: selectedModel,
      imageBuffer: prepared.buffer,
      mimeType: prepared.mimeType,
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

    const analysis = await this.#callLmStudioVisionForAnnotation({
      model: selectedModel,
      imageBuffer: prepared.buffer,
      mimeType: prepared.mimeType,
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

  async #cropBox(buffer, crop) {
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width || 0;
    const imgH = meta.height || 0;
    if (!imgW || !imgH) return buffer;

    const left = Math.min(Math.max(0, crop.left), imgW - 1);
    const top = Math.min(Math.max(0, crop.top), imgH - 1);
    const width = Math.min(crop.width, imgW - left);
    const height = Math.min(crop.height, imgH - top);

    if (width < 1 || height < 1) return buffer;
    return await sharp(buffer)
      .extract({ left, top, width, height })
      .toBuffer();
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

  async #callLmStudioVision({ model, imageBuffer, mimeType }) {
    const imageBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const systemPrompt =
      'You are a vision assistant for investigative image triage. ' +
      'Return ONLY valid JSON with keys: caption (string), licensePlates (string[]). ' +
      'caption must be a short, factual description (<= 20 words). ' +
      'licensePlates should include only clearly visible plate numbers; if none, return an empty array.';

    const userText =
      'Analyze the image. Extract any clearly readable vehicle license plate numbers. ' +
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

  async #callLmStudioVisionForAnnotation({ model, imageBuffer, mimeType }) {
    const imageBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const systemPrompt =
      'You are a vision assistant for annotation support. ' +
      'Return ONLY valid JSON with keys: caption (string), tags (string[]), licensePlates (string[]). ' +
      'caption must describe what is inside the selected region (<= 20 words). ' +
      'tags must be short and machine-friendly (lowercase, use underscores or hyphens), without leading #. ' +
      'licensePlates should include only clearly visible plate numbers; if none, return an empty array.';

    const userText =
      'Analyze this cropped region of an image. ' +
      '1) Provide a short caption of what is visible in the region. ' +
      '2) Provide a small list of suggested tags for the region content. ' +
      '3) Extract any clearly readable vehicle license plate numbers.';

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
