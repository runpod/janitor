// Centralized AI model providers for the application
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "@ai-sdk/provider";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env" });

// Check for required environment variables
const requiredEnvVars = [
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"RUNPOD_API_KEY",
	"RUNPOD_ENDPOINT_ID",
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
	console.warn(`Missing environment variables: ${missingEnvVars.join(", ")}`);
	console.warn("Some AI providers may not function correctly");
}

// Create Anthropic provider
export const anthropicProvider = anthropic("claude-3-5-sonnet-latest");

// Create regular OpenAI provider for non-RunPod usage
export const openaiProvider = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
	compatibility: "strict",
});

// Create RunPod provider
export const runpod = createOpenAI({
	baseURL: `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}/openai/v1`,
	apiKey: process.env.RUNPOD_API_KEY,
	compatibility: "strict",
	name: "runpod",
});

export const runpodDev = createOpenAI({
	baseURL: `https://k0guxrh3tzdbfx-8000.proxy.runpod.net/v1`,
	apiKey: process.env.RUNPOD_API_KEY,
	compatibility: "strict",
	name: "runpod",
});

export const runpodModel = runpodDev(process.env.RUNPOD_MODEL_NAME as string);

export const openaiModel = openaiProvider("gpt-4o")

// Function to get the appropriate model based on use case
export const getModel = (type: "coding" | "general" = "general"): LanguageModelV1 => {
	// Use Anthropic for coding tasks, RunPod for general tasks
	return (type === "coding" ? anthropicProvider : openaiModel) as LanguageModelV1;
};
