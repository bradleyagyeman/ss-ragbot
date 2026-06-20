import { env, pipeline } from "@xenova/transformers";
import type { FeatureExtractionPipeline } from "@xenova/transformers";

import type { AppConfig } from "../types/index.js";

export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

class LocalEmbeddingsProvider implements EmbeddingsProvider {
  private extractorPromise?: Promise<FeatureExtractionPipeline>;

  constructor(private readonly config: AppConfig) {}

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const embeddings: number[][] = [];

    for (const text of texts) {
      const result = await extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      embeddings.push(Array.from(result.data as Float32Array));
    }

    return embeddings;
  }

  async embedOne(text: string): Promise<number[]> {
    const [result] = await this.embed([text]);
    if (!result) {
      throw new Error("Embedding provider returned no vector");
    }
    return result;
  }

  private async getExtractor() {
    if (!this.extractorPromise) {
      (env.cacheDir as unknown) = this.config.embedding.cacheDir;
      env.allowLocalModels = true as boolean;
      this.extractorPromise = pipeline("feature-extraction", this.config.embedding.model) as Promise<FeatureExtractionPipeline>;
    }

    return this.extractorPromise;
  }
}

export function createEmbeddingsProvider(config: AppConfig): EmbeddingsProvider {
  if (config.embedding.provider !== "local") {
    throw new Error(`Unsupported embedding provider: ${config.embedding.provider}`);
  }

  return new LocalEmbeddingsProvider(config);
}
