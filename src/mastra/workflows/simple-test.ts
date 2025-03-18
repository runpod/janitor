import { Step, Workflow } from "@mastra/core/workflows";
import { z } from "zod";

// Define a simple input schema
const inputSchema = z.object({
  message: z.string().describe("A test message"),
});

// Create a simple step
const echoStep = new Step({
  id: "echo",
  description: "Echoes back the input message",
  inputSchema,
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ context }) => {
    const message = context.triggerData.message;
    console.log(`Received message: ${message}`);
    return {
      result: `Echo: ${message}`,
    };
  },
});

// Define the workflow
export const simpleTestWorkflow = new Workflow({
  name: "simple-test",
  triggerSchema: inputSchema,
});

// Add step to the workflow
simpleTestWorkflow.step(echoStep);

// Commit the workflow
simpleTestWorkflow.commit();
