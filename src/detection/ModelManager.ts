/**
 * ModelManager.ts
 * Manages detector model versioning, selection, and hot-swapping.
 *
 * Responsibilities:
 *  - Store model registry (version, filename, classes, threshold)
 *  - Load the active model
 *  - Record which model version was used for each session
 *  - Support swapping to a new model without app restart
 *
 * Model files are stored in the app's assets directory:
 *   assets/models/<filename>.tflite
 *
 * The model registry is stored in the SQLite database (model_registry table).
 * A metadata JSON file at assets/models/model_metadata.json provides
 * bootstrap information for the first run.
 */

import {Logger} from '../utils/logger';

const TAG = 'ModelManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelRecord {
  version: string;
  filename: string;
  classes: string[];
  trainedAt?: number;
  importedAt: number;
  confThreshold: number;
  inputWidth: number;
  inputHeight: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// ModelManager
// ---------------------------------------------------------------------------

export class ModelManager {
  private models: ModelRecord[] = [];
  private activeModel: ModelRecord | null = null;

  constructor() {
    // Bootstrap with the default model from assets
    this._loadDefaultModel();
  }

  private _loadDefaultModel(): void {
    const defaultModel: ModelRecord = {
      version: 'mock-v1.0',
      filename: 'mock',
      classes: ['pasta_sachet'],
      trainedAt: undefined,
      importedAt: Date.now(),
      confThreshold: 0.4,
      inputWidth: 640,
      inputHeight: 640,
      isActive: true,
    };
    this.models.push(defaultModel);
    this.activeModel = defaultModel;
    Logger.info(TAG, 'Default model loaded', {version: defaultModel.version});
  }

  getActiveModel(): ModelRecord | null {
    return this.activeModel;
  }

  getActiveVersion(): string {
    return this.activeModel?.version ?? 'unknown';
  }

  getActiveClasses(): string[] {
    return this.activeModel?.classes ?? ['pasta_sachet'];
  }

  getAllModels(): ModelRecord[] {
    return [...this.models];
  }

  registerModel(record: ModelRecord): void {
    // Deactivate current
    for (const m of this.models) m.isActive = false;
    if (this.activeModel) this.activeModel.isActive = false;

    record.isActive = true;
    this.models.push(record);
    this.activeModel = record;

    Logger.info(TAG, `Model registered and activated`, {version: record.version});
  }

  setActiveModel(version: string): boolean {
    const model = this.models.find(m => m.version === version);
    if (!model) {
      Logger.error(TAG, `Model version not found: ${version}`);
      return false;
    }
    for (const m of this.models) m.isActive = false;
    model.isActive = true;
    this.activeModel = model;
    Logger.info(TAG, `Active model set to ${version}`);
    return true;
  }
}

// Singleton
export const modelManager = new ModelManager();
