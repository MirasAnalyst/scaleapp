'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { nodeTypes as hysysNodeTypes } from './HYSYSFlowsheetEditor';

// Equipment type mapping to HYSYS node types
const equipmentTypeMap: Record<string, string> = {
  // Reactors
  reactor: 'cstr',
  reactor_cstr: 'cstr',
  reactor_pfr: 'pfr',
  reactor_conversion: 'cstr',
  reactor_equilibrium: 'cstr',
  reactor_gibbs: 'cstr',
  
  // Separators
  separator: 'separator',
  separator_2phase: 'separator',
  separator_3phase: 'separator3p',
  flash_drum: 'flashDrum',
  knockout_drum: 'flashDrum',
  surge_drum: 'tank',
  reflux_drum: 'tank',
  accumulator: 'tank',
  phase_separator: 'separator',
  liquid_liquid_separator: 'separator3p',
  gas_liquid_separator: 'separator',
  solid_liquid_separator: 'separator',
  
  // Heat Exchangers
  heat_exchanger: 'shellTubeHX',
  cooler: 'heaterCooler',
  heater: 'heaterCooler',
  condenser: 'condenser',
  reboiler: 'boiler',
  preheater: 'heaterCooler',
  intercooler: 'heaterCooler',
  aftercooler: 'heaterCooler',
  economizer: 'heaterCooler',
  superheater: 'heaterCooler',
  desuperheater: 'heaterCooler',
  air_cooler: 'airCooler',
  fired_heater: 'heaterCooler',
  lng_exchanger: 'shellTubeHX',
  
  // Pumps and Compressors
  pump: 'pump',
  compressor: 'compressor',
  expander: 'turbine',
  turbine: 'turbine',
  
  // Valves
  valve: 'valve',
  relief_valve: 'valve',
  
  // Mixers and Splitters
  mixer: 'mixer',
  splitter: 'splitter',
  tee: 'splitter',
  
  // Columns
  distillation_column: 'distillationColumn',
  absorber: 'distillationColumn',
  stripper: 'distillationColumn',
  column_absorber: 'distillationColumn',
  column_distillation: 'distillationColumn',
  column_reboiled_absorber: 'distillationColumn',
  column_refluxed_absorber: 'distillationColumn',
  column_three_phase_distillation: 'distillationColumn',
  column_vacuum_resid_tower: 'distillationColumn',
  column_fccu_main_fractionator: 'distillationColumn',
  shortcut_column: 'distillationColumn',
  refining_shortcut_column: 'distillationColumn',
  
  // Storage
  storage_tank: 'tank',
  tank: 'tank',
  
  // Filters - map to closest HYSYS equivalent
  filter: 'separator',
  filter_press: 'separator',
  belt_filter: 'separator',
  vacuum_filter: 'separator',
  rotary_filter: 'separator',
  pressure_filter: 'separator',
  gravity_filter: 'separator',
  magnetic_filter: 'separator',
  electrostatic_filter: 'separator',
  baghouse_filter: 'separator',
  
  // Cyclones and Separators
  cyclone: 'separator',
  hydrocyclone: 'separator',
  scrubber: 'separator',
  
  // Extractors
  extractor: 'separator3p',
  extractor_liquid_liquid: 'separator3p',
  decanter: 'separator3p',
  settler: 'separator3p',
  
  // Crystallizers
  crystallizer: 'tank',
  electrolyte_crystallizer: 'tank',
  
  // Other Equipment
  dryer: 'tank',
  evaporator: 'tank',
  thickener: 'tank',
  clarifier: 'tank',
  centrifuge: 'tank',
  ion_exchange: 'tank',
  adsorption: 'tank',
  absorption: 'distillationColumn',
  stripping: 'distillationColumn',
  extraction: 'separator3p',
  distillation: 'distillationColumn',
  rectification: 'distillationColumn',
  crystallization: 'tank',
  precipitation: 'tank',
  coagulation: 'tank',
  flocculation: 'tank',
  sedimentation: 'tank',
  filtration: 'separator',
  centrifugation: 'tank',
  drying: 'tank',
  evaporation: 'tank',
  concentration: 'tank',
  purification: 'tank',
  separation: 'separator',
  fractionation: 'distillationColumn',
  
  // Special Operations - map to closest equivalents
  component_splitter: 'splitter',
  user_defined_unit_op: 'tank',
  parametric_unit_operation: 'tank',
  subflowsheet_standard: 'tank',
  subflowsheet_column: 'distillationColumn',
  subflowsheet_aspen_hydraulics: 'tank',
  
  // Utilities
  delumper: 'tank',
  lumper: 'tank',
  pipe_segment: 'valve',
  pipeline_hydraulics_extension: 'valve',
  pipesim: 'valve',
  pipesim_link: 'valve',
  pipesim_enhanced_link: 'valve',
  material_stream: 'valve',
  energy_stream: 'valve',
  recycle: 'valve',
  stream_cutter: 'valve',
  external_data_linker: 'valve',
  spreadsheet: 'tank',
};

// Generic HYSYS Node Component that maps equipment types to HYSYS node types
function HYSYSNode({ data, nodeType }: { data: any; nodeType: string }) {
  const hysysNodeType = equipmentTypeMap[nodeType] || 'tank';
  const HYSYSComponent = hysysNodeTypes[hysysNodeType];
  
  if (!HYSYSComponent) {
    // Fallback to tank if HYSYS component not found
    const TankComponent = hysysNodeTypes.tank;
    return <TankComponent id={data.id || 'fallback'} data={data} />;
  }
  
  return <HYSYSComponent id={data.id || 'node'} data={data} />;
}

// React Flow node types - all use HYSYS components
export const nodeTypes = {
  reactor: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="reactor" />,
  separator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="separator" />,
  heat_exchanger: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="heat_exchanger" />,
  pump: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="pump" />,
  compressor: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="compressor" />,
  valve: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="valve" />,
  mixer: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="mixer" />,
  splitter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="splitter" />,
  distillation_column: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="distillation_column" />,
  storage_tank: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="storage_tank" />,
  cooler: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="cooler" />,
  heater: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="heater" />,
  flash_drum: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="flash_drum" />,
  absorber: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="absorber" />,
  stripper: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="stripper" />,
  expander: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="expander" />,
  turbine: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="turbine" />,
  filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="filter" />,
  crystallizer: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="crystallizer" />,
  dryer: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="dryer" />,
  evaporator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="evaporator" />,
  condenser: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="condenser" />,
  reboiler: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="reboiler" />,
  preheater: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="preheater" />,
  intercooler: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="intercooler" />,
  aftercooler: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="aftercooler" />,
  economizer: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="economizer" />,
  superheater: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="superheater" />,
  desuperheater: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="desuperheater" />,
  knockout_drum: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="knockout_drum" />,
  surge_drum: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="surge_drum" />,
  reflux_drum: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="reflux_drum" />,
  accumulator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="accumulator" />,
  phase_separator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="phase_separator" />,
  liquid_liquid_separator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="liquid_liquid_separator" />,
  gas_liquid_separator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="gas_liquid_separator" />,
  solid_liquid_separator: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="solid_liquid_separator" />,
  cyclone: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="cyclone" />,
  scrubber: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="scrubber" />,
  extractor: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="extractor" />,
  decanter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="decanter" />,
  settler: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="settler" />,
  thickener: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="thickener" />,
  clarifier: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="clarifier" />,
  centrifuge: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="centrifuge" />,
  filter_press: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="filter_press" />,
  belt_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="belt_filter" />,
  vacuum_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="vacuum_filter" />,
  rotary_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="rotary_filter" />,
  pressure_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="pressure_filter" />,
  gravity_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="gravity_filter" />,
  magnetic_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="magnetic_filter" />,
  electrostatic_filter: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="electrostatic_filter" />,
  ion_exchange: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="ion_exchange" />,
  adsorption: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="adsorption" />,
  absorption: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="absorption" />,
  stripping: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="stripping" />,
  extraction: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="extraction" />,
  distillation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="distillation" />,
  rectification: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="rectification" />,
  crystallization: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="crystallization" />,
  precipitation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="precipitation" />,
  coagulation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="coagulation" />,
  flocculation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="flocculation" />,
  sedimentation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="sedimentation" />,
  filtration: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="filtration" />,
  centrifugation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="centrifugation" />,
  drying: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="drying" />,
  evaporation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="evaporation" />,
  concentration: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="concentration" />,
  purification: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="purification" />,
  separation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="separation" />,
  fractionation: (props: NodeProps) => <HYSYSNode data={props.data} nodeType="fractionation" />,
};

// All node components now use HYSYS-style components through the HYSYSNode wrapper