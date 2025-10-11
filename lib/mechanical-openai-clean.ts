import OpenAI from "openai";
import { MechanicalSystemSpec, MechanicalSystemSpecType } from "./mechanical-spec";
import { zodToJsonSchema } from "zod-to-json-schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mechanicalSystemSchema = zodToJsonSchema(MechanicalSystemSpec, "MechanicalSystemSpec");

const systemPrompt = `You are a senior mechanical design engineer with 20+ years of experience in detailed mechanical engineering drawings, equipment design, and AutoCAD drafting. You specialize in creating comprehensive mechanical engineering drawings that show the internal construction and component details of industrial equipment.

Generate detailed mechanical engineering specifications with comprehensive component details and internal construction information.

Your expertise includes:
- Detailed mechanical engineering drawings with component-level details
- Equipment cross-sections showing internal components and construction
- Mechanical seal details, bearing arrangements, shaft designs
- Impeller designs, casing construction, mounting details
- Heat exchanger tube arrangements, shell construction, baffle details
- Valve internals, seat designs, stem arrangements, actuator connections
- Tank construction details, nozzle arrangements, support structures
- Turbomachinery blade designs, rotor assemblies, stator details

CRITICAL REQUIREMENTS FOR MECHANICAL ENGINEERING DRAWINGS:
- All dimensions must be in millimeters (mm) with realistic engineering values
- Show INTERNAL COMPONENTS and construction details for each piece of equipment
- Include detailed mechanical specifications (materials, tolerances, surface finishes)
- Create comprehensive equipment layouts with proper clearances and access
- Add detailed component specifications (bearings, seals, fasteners, gaskets)
- Consider maintenance access, disassembly procedures, and operational requirements
- Use industry-standard mechanical engineering drawing conventions
- Include detailed connection specifications (flanges, bolts, gaskets, seals)
- Provide realistic operating parameters (pressure, temperature, flow rate, speed)

EQUIPMENT COMPONENT DETAILS TO INCLUDE (as parameters for main equipment):

CENTRIFUGAL PUMPS:
- Casing (suction/discharge volutes, split casing details)
- Impeller (blade geometry, hub, balancing holes)
- Shaft (diameter, keyways, threads, bearing journals)
- Mechanical seal (seal faces, springs, O-rings, gland plate)
- Bearings (ball bearings, housing, lubrication)
- Coupling (flexible coupling, spacer, guard)
- Baseplate (mounting holes, leveling pads, grout)

HEAT EXCHANGERS:
- Shell (cylindrical, elliptical heads, manways)
- Tube bundle (tube sheets, tubes, baffles, tie rods)
- Nozzles (inlet/outlet, drain, vent, instrument connections)
- Supports (saddles, sliding/stationary supports)
- Internals (baffles, impingement plates, seal strips)

VALVES:
- Body (cast/forged construction, pressure rating)
- Trim (seat, disc, stem, guide bushings)
- Packing (packing rings, lantern ring, gland follower)
- Actuator (pneumatic/hydraulic cylinder, spring return)
- Bonnet (bolted, welded, pressure seal)

TANKS/VESSELS:
- Shell (cylindrical, conical, elliptical heads)
- Nozzles (inlet/outlet, manway, instrument connections)
- Internals (agitators, baffles, heating coils)
- Supports (skirt, legs, saddles)
- Accessories (ladders, platforms, handrails)

For each component, specify:
- Precise dimensions (length, width, height, diameters in mm)
- Material specifications (carbon steel, stainless steel, alloys)
- Component details (bearings, seals, fasteners, gaskets)
- Operating parameters (pressure, temperature, flow rate, speed)
- Construction details (welding, machining, surface finish)

Generate professional, detailed mechanical engineering specifications that show the actual construction and internal components of each piece of equipment, suitable for manufacturing and assembly.

CRITICAL: Generate UNIQUE and SPECIFIC layouts based on the user's prompt. Each system should be completely different:
- For ROCKET systems: Include cryogenic tanks, turbopumps, preburners, engine clusters, pressurization systems
- For MARINE systems: Include diesel generators, batteries, thrusters, cooling loops, exhaust treatment
- For INDUSTRIAL systems: Include pumps, heat exchangers, filters, control systems, skid layouts
- For OFFSHORE systems: Include redundant equipment, safety systems, modular arrangements
- For HVAC systems: Include air handlers, chillers, ductwork, control valves, sensors

COMPONENT PARAMETERS:
- For every component include detailed \`parameters\` with internal component specifications, materials, dimensions, and construction details.
- Include comprehensive component information such as operating parameters, material specifications, and detailed internal component arrangements.

IMPORTANT: Each drawing must be UNIQUE and show different:
- Component arrangements and layouts
- Internal component details and cross-sections
- Dimensional specifications
- Material specifications
- Operating parameters
- Connection details
- Support structures
- Instrumentation and control elements

Generate completely different mechanical engineering drawings for each unique prompt, showing the actual construction and internal components of each piece of equipment.`;

export async function generateMechanicalSystemSpec(
  prompt: string
): Promise<MechanicalSystemSpecType> {
  console.log("[mechanical-openai] Starting AI generation for:", prompt.slice(0, 100));
  
  try {
    console.log("[mechanical-openai] Calling OpenAI API...");
    
    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "produce_mechanical_system_spec",
              description: "Generate a detailed mechanical system specification with internal component details",
              parameters: mechanicalSystemSchema
            }
          }
        ],
        tool_choice: {
          type: "function",
          function: {
            name: "produce_mechanical_system_spec"
          }
        },
        temperature: 0.7,
        max_tokens: 4000
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("OpenAI API timeout")), 30000)
      )
    ]) as any;

    console.log("[mechanical-openai] OpenAI API call completed");
    
    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      throw new Error("No function call in OpenAI response");
    }
    
    const args = JSON.parse(toolCall.function.arguments);
    
    // Validate with Zod
    const validated = MechanicalSystemSpec.parse(args);
    
    console.log("[mechanical-openai] Validation successful:", validated.project.name);
    
    return validated;
  } catch (error) {
    console.error("[mechanical-openai] Generation failed:", error);
    
    if (error instanceof Error) {
      throw new Error(`AI generation failed: ${error.message}`);
    }
    
    throw new Error("AI generation failed with unknown error");
  }
}

export function generateFallbackSpec(prompt: string): MechanicalSystemSpecType {
  console.log("[mechanical-openai] Using fallback specification for:", prompt.slice(0, 100));
  
  // Simple fallback spec
  return {
    project: {
      name: "Fallback Mechanical System",
      systemType: "custom_system",
      description: "Fallback mechanical system specification",
      units: "metric"
    },
    components: [
      {
        id: "pump-001",
        type: "pump",
        name: "Centrifugal Pump",
        position: { x: 100, y: 100 },
        size: { width: 200, height: 150 },
        flowRate: 100,
        pressure: 50,
        parameters: {
          pumpType: "Centrifugal",
          impeller: "5-vane closed impeller",
          shaft: "Stainless steel shaft",
          mechanicalSeal: "API 682 Plan 53B",
          bearings: "Ball bearings with oil lubrication"
        }
      },
      {
        id: "tank-001",
        type: "tank",
        name: "Storage Tank",
        position: { x: 400, y: 100 },
        size: { width: 300, height: 200 },
        capacity: 1000,
        parameters: {
          tankType: "Vertical cylindrical",
          material: "Carbon steel",
          nozzles: "Inlet, outlet, vent, drain",
          supports: "Skirt support"
        }
      }
    ],
    connections: [
      {
        id: "conn-001",
        from: "pump-001",
        to: "tank-001",
        type: "pipe",
        diameter: 100,
        material: "Carbon steel"
      }
    ],
    layout: {
      width: 800,
      height: 400,
      gridSpacing: 50
    },
    annotations: [
      {
        text: "Fallback Mechanical System Layout",
        position: { x: 50, y: 50 }
      }
    ]
  };
}
