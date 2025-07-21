// Centralized AI model providers for the application
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1 } from "@ai-sdk/provider";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: ".env" });

// Only require essential environment variables for basic functionality
const requiredEnvVars = ["ANTHROPIC_API_KEY"];

// Optional environment variables for enhanced functionality
const optionalEnvVars = [
	"OPENAI_API_KEY",
	"RUNPOD_GENERAL_ENDPOINT_ID",
	"RUNPOD_GENERAL_MODEL",
	"GOOGLE_GENERATIVE_AI_API_KEY",
];

const missingRequired = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingRequired.length > 0) {
	console.error(`❌ Missing required environment variables: ${missingRequired.join(", ")}`);
	console.error("Please configure these in your .env file for the server to function properly.");
	process.exit(1);
}

const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);
if (missingOptional.length > 0) {
	console.warn(`⚠️  Missing optional environment variables: ${missingOptional.join(", ")}`);
	console.warn("Some AI providers may not be available, but basic functionality will work");
}

// Always available (required)
export const sonnetCodeHigh = anthropic("claude-3-7-sonnet-latest");
export const sonnetCodeMedium = anthropic("claude-3-5-sonnet-latest");

// Optional providers (only available if configured)
export const geminiPro = process.env.GOOGLE_GENERATIVE_AI_API_KEY
	? google("gemini-2.5-pro-preview-03-25")
	: null;

export const general =
	process.env.RUNPOD_GENERAL_ENDPOINT_ID && process.env.RUNPOD_API_KEY
		? createOpenAI({
				baseURL: `https://api.runpod.ai/v2/${process.env.RUNPOD_GENERAL_ENDPOINT_ID}/openai/v1`,
				apiKey: process.env.RUNPOD_API_KEY,
				compatibility: "strict",
				name: "runpod",
			})
		: null;

export const runpodGeneral =
	general && process.env.RUNPOD_GENERAL_MODEL
		? general(process.env.RUNPOD_GENERAL_MODEL as string)
		: null;

export const getModel = (type: "code-high" | "code-medium" = "code-medium"): LanguageModelV1 => {
	return (type === "code-high" ? sonnetCodeHigh : sonnetCodeMedium) as LanguageModelV1;
};
