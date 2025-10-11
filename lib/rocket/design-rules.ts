export const rocketDesignRules = `
Rocket Design Rules (Mechanical Drafting) — reference docs/rocket-design-rules.md
- Use millimeters for all linear dimensions; convert any user-supplied imperial values.
- Minimum wall thickness is 2 mm; minimum gauge thickness is 1 mm unless otherwise specified.
- Fastener edge distance must be at least 2× diameter; pitch ≥ 3× diameter unless part geometry forbids it.
- Tanks use hoop stress check σ_hoop = (P × r) / t with factor of safety ≥ 1.25.
- Provide datum references (A, B, C) for every machined interface and note GD&T callouts.
- Apply layer naming per drafting config: A-OUTLINE (solids), A-HIDDEN, A-CENTER, A-DIM, A-ANNOT, A-TITLE, A-HATCH, A-BOM.
- Reference standards: structural NASA-STD-5001B, drafting ASME Y14.5M & ASME Y14.100, materials NASA-HDBK-5/MMPDS.
- Annotate materials with AMS/ASTM references and include surface treatments (anodize, passivation, etc.).
- Provide clearances for stage separation events and avionics access (≥ 25 mm recommended).
- Always specify mass properties (mass, CG from base, principal inertias) for each part.
`.trim();
