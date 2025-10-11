# Rocket Mechanical Drafting Rules

These rules are the authoritative reference for the RocketSpec schema and are used by the LLM prompt as well as the CAD worker. Keep this document concise so it can be embedded directly into prompts.

## Units and General Conventions
- All linear dimensions, clearances, and tolerances are in **millimetres (mm)**. Convert any imperial inputs before generating specs.
- Minimum structural wall thickness is **2 mm**; sheet gauge must not drop below **1 mm**.
- Fastener edge distance must be **≥ 2 × fastener diameter**; preferred pitch is ≥ 3 × diameter.
- Provide datum references (A, B, C) for any machined interface and include applicable GD&T callouts.
- Record mass properties for each part: mass, CG from base, and principal inertias.

## Structural Checks
- Tanks use hoop stress formula σ<sub>hoop</sub> = (P × r) / t and must satisfy the stage design factor of safety (≥ 1.25).
- Verify stage separation and access clearances; recommended minimum is **25 mm**.
- Capture thermal environment for each part: use provided temperature range to validate materials.

## Drafting Standards
- Layers: `A-OUTLINE`, `A-HIDDEN`, `A-CENTER`, `A-DIM`, `A-ANNOT`, `A-TITLE`, `A-HATCH`, `A-BOM`.
- Lineweights/linetypes follow ASME Y14.100/Y14.5M so AutoCAD renders correctly.
- Dimension style “A-DIM”: 3.0 mm arrows, 3.5 mm text height, 1.5 mm extension gaps.
- Include title block metadata (project, revision, customer) on TechDraw sheets.

## Materials and Treatments
- Materials must reference AMS/ASTM or NASA standards (e.g., AMS-QQ-A-250/4). Record density, yield, ultimate strength, and max service temperature.
- Note surface treatments for corrosion/thermal control (anodize, passivation, TBC, etc.).
- Driving dimensions only; GD&T text frames allowed. Hole/thread callouts follow NAS/MS specs.

## Deliverables
- Generate **STEP** assembly, **DXF** layout, and **TechDraw PDF/DXF** with title block and views.
- Populate BOM/annotation layers for downstream CAD editing.
- Provide sanity-check results for thickness, edge distance, hoop stress, clearance, CG, and pressure.
