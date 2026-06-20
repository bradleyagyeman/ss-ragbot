import { GoogleGenAI } from "@google/genai";

import type { AppConfig } from "../types/index.js";

export interface AnswerProvider {
  generate(prompt: string): Promise<{ text: string; model: string }>;
}

class GoogleAnswerProvider implements AnswerProvider {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: AppConfig) {
    if (!config.answer.googleApiKey) {
      throw new Error("GOOGLE_API_KEY is required for the google answer provider");
    }

    this.client = new GoogleGenAI({
      apiKey: config.answer.googleApiKey,
    });
  }

  async generate(prompt: string): Promise<{ text: string; model: string }> {
    const response = await this.client.models.generateContent({
      model: this.config.answer.model,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    return {
      text: response.text ?? "",
      model: this.config.answer.model,
    };
  }
}

export function createAnswerProvider(config: AppConfig): AnswerProvider {
  if (config.answer.provider !== "google") {
    throw new Error(`Unsupported answer provider: ${config.answer.provider}`);
  }

  if (!config.answer.googleApiKey) {
    throw new Error("GOOGLE_API_KEY is required for the google answer provider");
  }

  return new GoogleAnswerProvider(config);
}
