// Centralized AI model providers for the application
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "@ai-sdk/provider";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const requiredEnvVars = [
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"RUNPOD_GENERAL_ENDPOINT_ID",
	"RUNPOD_GENERAL_MODEL",
	// "RUNPOD_CODING_ENDPOINT_ID",
	// "RUNPOD_CODING_MODEL",
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
	console.warn(`Missing environment variables: ${missingEnvVars.join(", ")}`);
	console.warn("Some AI providers may not function correctly");
}

export const sonnetCoding = anthropic("claude-3-5-sonnet-latest");

export const general = createOpenAI({
	baseURL: `https://api.runpod.ai/v2/${process.env.RUNPOD_GENERAL_ENDPOINT_ID}/openai/v1`,
	apiKey: process.env.RUNPOD_API_KEY,
	compatibility: "strict",
	name: "runpod",
});

export const runpodGeneral = general(process.env.RUNPOD_GENERAL_MODEL as string);

export const getModel = (type: "coding" | "general" = "general"): LanguageModelV1 => {
	return (type === "coding" ? sonnetCoding : runpodGeneral) as LanguageModelV1;
};
