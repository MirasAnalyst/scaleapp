import OpenAI from "openai";
import { BuildingSpec, BuildingSpecType } from "./spec";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPrompt = `You are a building design assistant that converts building briefs into strict JSON matching the provided JSON schema. 

Your task is to:
1. Parse the user's building description
2. Extract all relevant parameters
3. Convert them into the exact JSON structure required
4. Don't invent fields that aren't provided
5. Use reasonable defaults for missing information
6. Ensure all numeric values are positive and logical

Always return valid JSON that matches the BuildingSpec schema exactly.`;

export async function generateBuildingSpec(prompt: string): Promise<BuildingSpecType> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "produce_building_spec",
            description: "Generate a building specification from a natural language description",
            parameters: {
              type: "object",
              properties: {
                project: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Project name"
                    },
                    units: {
                      type: "string",
                      enum: ["meters", "feet"],
                      description: "Measurement units"
                    },
                    site: {
                      type: "object",
                      properties: {
                        width: {
                          type: "number",
                          description: "Site width"
                        },
                        depth: {
                          type: "number",
                          description: "Site depth"
                        },
                        setbacks: {
                          type: "object",
                          properties: {
                            front: { type: "number", description: "Front setback" },
                            side: { type: "number", description: "Side setback" },
                            rear: { type: "number", description: "Rear setback" }
                          },
                          required: ["front", "side", "rear"]
                        }
                      },
                      required: ["width", "depth", "setbacks"]
                    },
                    grid: {
                      type: "object",
                      properties: {
                        bayX: { type: "number", description: "Grid bay width" },
                        bayY: { type: "number", description: "Grid bay depth" }
                      },
                      required: ["bayX", "bayY"]
                    },
                    tower: {
                      type: "object",
                      properties: {
                        floors: { type: "integer", description: "Number of floors" },
                        typicalFloorHeight: { type: "number", description: "Typical floor height" },
                        footprint: { type: "string", enum: ["rectangle"], description: "Footprint shape" },
                        footprintDims: {
                          type: "object",
                          properties: {
                            x: { type: "number", description: "Footprint width" },
                            y: { type: "number", description: "Footprint depth" }
                          },
                          required: ["x", "y"]
                        },
                        setbacksEvery: { type: "integer", description: "Setback frequency (floors)" },
                        setbackDepth: { type: "number", description: "Setback depth" }
                      },
                      required: ["floors", "typicalFloorHeight", "footprint", "footprintDims", "setbacksEvery", "setbackDepth"]
                    },
                    cores: {
                      type: "object",
                      properties: {
                        stairs: { type: "integer", description: "Number of stairs" },
                        elevators: { type: "integer", description: "Number of elevators" },
                        coreWidth: { type: "number", description: "Core width" },
                        coreDepth: { type: "number", description: "Core depth" }
                      },
                      required: ["stairs", "elevators", "coreWidth", "coreDepth"]
                    },
                    outputs: {
                      type: "object",
                      properties: {
                        plans: { type: "boolean", description: "Generate plans" },
                        elevations: { type: "boolean", description: "Generate elevations" },
                        sections: { type: "boolean", description: "Generate sections" },
                        dxf: { type: "boolean", description: "Generate DXF" },
                        ifc: { type: "boolean", description: "Generate IFC" }
                      },
                      required: ["plans", "elevations", "sections", "dxf", "ifc"]
                    }
                  },
                  required: ["name", "units", "site", "grid", "tower", "cores", "outputs"]
                }
              },
              required: ["project"]
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "produce_building_spec" } },
      temperature: 0.1,
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "produce_building_spec") {
      throw new Error("No valid tool call returned from OpenAI");
    }

    const args = JSON.parse(toolCall.function.arguments);
    return BuildingSpec.parse(args);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
    throw new Error("Unknown error occurred during OpenAI generation");
  }
}
