// Auto-generated handle registry derived from HYSYSFlowsheetEditor.tsx
// Do not edit manually; update generation script if node handles change.

export interface NodeHandleSpec {
  sources: readonly string[];
  targets: readonly string[];
  hasAnonymousSource: boolean;
  hasAnonymousTarget: boolean;
}

export const NODE_HANDLE_REGISTRY: Record<string, NodeHandleSpec> = {
  "distillationColumn": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "packedColumn": {
    "sources": [
      "out"
    ],
    "targets": [
      "in"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "flashDrum": {
    "sources": [
      "liquid",
      "vapor"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "separator": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "separator3p": {
    "sources": [
      "gas-top",
      "oil-right",
      "water-bottom"
    ],
    "targets": [
      "feed-left"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "tank": {
    "sources": [
      "out"
    ],
    "targets": [
      "in"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "heaterCooler": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "shellTubeHX": {
    "sources": [
      "shellOut",
      "tubeOut"
    ],
    "targets": [
      "shellIn",
      "tubeIn"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "kettleReboiler": {
    "sources": [
      "shellOut",
      "vaporOut"
    ],
    "targets": [
      "reboilDuty",
      "shellIn"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "plateHX": {
    "sources": [
      "secOut"
    ],
    "targets": [
      "secIn"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "doublePipeHX": {
    "sources": [
      "annulusOut"
    ],
    "targets": [
      "annulusIn"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "firedHeater": {
    "sources": [
      "flue"
    ],
    "targets": [
      "fuel"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "pump": {
    "sources": [
      "discharge-right"
    ],
    "targets": [
      "suction-left"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "compressor": {
    "sources": [
      "discharge-right"
    ],
    "targets": [
      "suction-left"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "mixer": {
    "sources": [
      "out"
    ],
    "targets": [
      "in1",
      "in2"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "splitter": {
    "sources": [
      "out1",
      "out2"
    ],
    "targets": [
      "in"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "tee": {
    "sources": [
      "branch",
      "out"
    ],
    "targets": [
      "in"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "boiler": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "condenser": {
    "sources": [
      "Qout"
    ],
    "targets": [],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "heat_exchanger": {
    "sources": [
      "shellOut",
      "tubeOut"
    ],
    "targets": [
      "shellIn",
      "tubeIn"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "storage_tank": {
    "sources": [
      "out"
    ],
    "targets": [
      "in"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "flash_drum": {
    "sources": [
      "liquid",
      "vapor"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "phase_separator": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "gas_liquid_separator": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "liquid_liquid_separator": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "solid_liquid_separator": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "cooler": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "heater": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "preheater": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "intercooler": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "aftercooler": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "economizer": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "superheater": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "desuperheater": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "reboiler": {
    "sources": [
      "shellOut",
      "vaporOut"
    ],
    "targets": [
      "reboilDuty",
      "shellIn"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "fan": {
    "sources": [
      "discharge-right"
    ],
    "targets": [
      "suction-left"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "blower": {
    "sources": [
      "discharge-right"
    ],
    "targets": [
      "suction-left"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "dryer": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "evaporator": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "extractor": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "decanter": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "settler": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "thickener": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "clarifier": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "centrifuge": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "extraction": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "distillation": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "rectification": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "regeneration": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "precipitation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "coagulation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "flocculation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "sedimentation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "centrifugation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "drying": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "evaporation": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "concentration": {
    "sources": [],
    "targets": [
      "Qin"
    ],
    "hasAnonymousSource": true,
    "hasAnonymousTarget": true
  },
  "purification": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "separation": {
    "sources": [
      "gas",
      "liquid"
    ],
    "targets": [
      "feed"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "fractionation": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "absorber": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  },
  "stripper": {
    "sources": [
      "bottoms-bottom",
      "overhead-top"
    ],
    "targets": [
      "feed-left",
      "feed-stage-10",
      "feed-stage-12",
      "feed-stage-18",
      "feed-stage-6",
      "feed-stage-8",
      "in-left",
      "reflux-top"
    ],
    "hasAnonymousSource": false,
    "hasAnonymousTarget": false
  }
} as const;

export function getHandlesForType(type: string): NodeHandleSpec | undefined {
  return NODE_HANDLE_REGISTRY[type];
}
