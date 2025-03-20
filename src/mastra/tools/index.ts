import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Re-export tools from files
export * from "./file-system-tools.js";
export * from "./repository-repair-tool.js";
export * from "./docker-validation-tool.js";

// Example weather tool
export const weatherTool = createTool({
  id: "getWeather",
  inputSchema: z.object({
    location: z
      .string()
      .describe("The location to get weather for. Example: New York, London"),
  }),
  description: "Get the current weather for a location",
  execute: async ({ context }) => {
    try {
      // This is just a mock implementation
      const randomTemp = Math.floor(Math.random() * 30) + 10; // 10-40C
      const conditions = [
        "Sunny",
        "Cloudy",
        "Partly Cloudy",
        "Rainy",
        "Thunderstorms",
        "Snowy",
        "Foggy",
      ];
      const randomCondition =
        conditions[Math.floor(Math.random() * conditions.length)];

      return {
        temperature: randomTemp,
        condition: randomCondition,
        location: context.location,
        humidity: Math.floor(Math.random() * 60) + 30, // 30-90%
        wind: Math.floor(Math.random() * 30), // 0-30 mph
        forecast: "Similar conditions expected for the next 24 hours.",
      };
    } catch (error) {
      return {
        error: `Failed to get weather: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  },
});
