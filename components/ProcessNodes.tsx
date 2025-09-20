'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// React Flow node types
export const nodeTypes = {
  reactor: ReactorNode,
  separator: SeparatorNode,
  heat_exchanger: HeatExchangerNode,
  pump: PumpNode,
  compressor: CompressorNode,
  valve: ValveNode,
  mixer: MixerNode,
  splitter: SplitterNode,
  distillation_column: DistillationColumnNode,
  storage_tank: StorageTankNode,
  cooler: CoolerNode,
  heater: HeaterNode,
  flash_drum: FlashDrumNode,
  absorber: AbsorberNode,
  stripper: StripperNode,
  expander: ExpanderNode,
  turbine: TurbineNode,
  filter: FilterNode,
  crystallizer: CrystallizerNode,
  dryer: DryerNode,
  evaporator: EvaporatorNode,
  condenser: CondenserNode,
  reboiler: ReboilerNode,
  preheater: PreheaterNode,
  intercooler: IntercoolerNode,
  aftercooler: AftercoolerNode,
  economizer: EconomizerNode,
  superheater: SuperheaterNode,
  desuperheater: DesuperheaterNode,
  knockout_drum: KnockoutDrumNode,
  surge_drum: SurgeDrumNode,
  reflux_drum: RefluxDrumNode,
  accumulator: AccumulatorNode,
  phase_separator: PhaseSeparatorNode,
  liquid_liquid_separator: LiquidLiquidSeparatorNode,
  gas_liquid_separator: GasLiquidSeparatorNode,
  solid_liquid_separator: SolidLiquidSeparatorNode,
  cyclone: CycloneNode,
  scrubber: ScrubberNode,
  extractor: ExtractorNode,
  decanter: DecanterNode,
  settler: SettlerNode,
  thickener: ThickenerNode,
  clarifier: ClarifierNode,
  centrifuge: CentrifugeNode,
  filter_press: FilterPressNode,
  belt_filter: BeltFilterNode,
  vacuum_filter: VacuumFilterNode,
  rotary_filter: RotaryFilterNode,
  pressure_filter: PressureFilterNode,
  gravity_filter: GravityFilterNode,
  magnetic_filter: MagneticFilterNode,
  electrostatic_filter: ElectrostaticFilterNode,
  ion_exchange: IonExchangeNode,
  adsorption: AdsorptionNode,
  absorption: AbsorptionNode,
  stripping: StrippingNode,
  extraction: ExtractionNode,
  distillation: DistillationNode,
  rectification: RectificationNode,
  crystallization: CrystallizationNode,
  precipitation: PrecipitationNode,
  coagulation: CoagulationNode,
  flocculation: FlocculationNode,
  sedimentation: SedimentationNode,
  filtration: FiltrationNode,
  centrifugation: CentrifugationNode,
  drying: DryingNode,
  evaporation: EvaporationNode,
  concentration: ConcentrationNode,
  purification: PurificationNode,
  separation: SeparationNode,
  fractionation: FractionationNode,
};

// Base node component with common styling
function BaseNode({ data, children, className = "" }: { data: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-2 min-w-[140px] min-h-[120px] flex flex-col items-center justify-center ${className}`}>
      <Handle type="target" position={Position.Top} className="w-4 h-4 bg-blue-500 border-2 border-white" />
      <Handle type="source" position={Position.Bottom} className="w-4 h-4 bg-green-500 border-2 border-white" />
      <Handle type="source" position={Position.Left} className="w-4 h-4 bg-green-500 border-2 border-white" />
      <Handle type="source" position={Position.Right} className="w-4 h-4 bg-green-500 border-2 border-white" />
      {children}
      <div className="text-xs text-center text-gray-700 dark:text-gray-300 mt-2 font-medium">
        {data.label}
      </div>
    </div>
  );
}

// Reactor Node - Professional CSTR shape
function ReactorNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-blue-600 dark:text-blue-400">
        {/* Main vessel */}
        <rect x="10" y="15" width="40" height="30" rx="5" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Agitator */}
        <circle cx="30" cy="30" r="8" fill="white" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 22 L30 38 M22 30 L38 30" stroke="currentColor" strokeWidth="1"/>
        {/* Inlet/outlet nozzles */}
        <path d="M5 25 L10 25 M50 25 L55 25" stroke="currentColor" strokeWidth="3"/>
        <path d="M5 35 L10 35 M50 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Top nozzle */}
        <path d="M30 5 L30 15" stroke="currentColor" strokeWidth="3"/>
        {/* Support legs */}
        <path d="M15 45 L15 50 M25 45 L25 50 M35 45 L35 50 M45 45 L45 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Separator Node - Professional horizontal separator
function SeparatorNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-green-600 dark:text-green-400">
        {/* Main vessel */}
        <ellipse cx="30" cy="30" rx="20" ry="12" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Inlet nozzle */}
        <path d="M5 30 L10 30" stroke="currentColor" strokeWidth="3"/>
        {/* Outlet nozzles */}
        <path d="M50 25 L55 25 M50 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Top nozzle */}
        <path d="M30 15 L30 18" stroke="currentColor" strokeWidth="3"/>
        {/* Internal baffle */}
        <path d="M20 25 L40 25 M20 35 L40 35" stroke="white" strokeWidth="1"/>
        {/* Support legs */}
        <path d="M20 42 L20 50 M40 42 L40 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Heat Exchanger Node - Professional shell and tube
function HeatExchangerNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-red-600 dark:text-red-400">
        {/* Main shell */}
        <rect x="10" y="20" width="40" height="20" rx="3" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Tube bundle */}
        <rect x="15" y="25" width="30" height="10" fill="white" stroke="currentColor" strokeWidth="1"/>
        {/* Tube passes */}
        <path d="M15 27 L45 27 M15 29 L45 29 M15 31 L45 31 M15 33 L45 33" stroke="currentColor" strokeWidth="0.5"/>
        {/* Inlet/outlet nozzles */}
        <path d="M5 25 L10 25 M50 25 L55 25" stroke="currentColor" strokeWidth="3"/>
        <path d="M5 35 L10 35 M50 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Shell side nozzles */}
        <path d="M30 10 L30 20 M30 40 L30 50" stroke="currentColor" strokeWidth="3"/>
        {/* Support saddles */}
        <path d="M15 45 L20 50 M40 45 L45 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Pump Node - Professional centrifugal pump
function PumpNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-purple-600 dark:text-purple-400">
        {/* Pump casing */}
        <circle cx="30" cy="30" r="15" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Impeller */}
        <circle cx="30" cy="30" r="8" fill="white" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 22 L30 38 M22 30 L38 30" stroke="currentColor" strokeWidth="1"/>
        {/* Inlet/outlet nozzles */}
        <path d="M5 30 L15 30" stroke="currentColor" strokeWidth="4"/>
        <path d="M45 30 L55 30" stroke="currentColor" strokeWidth="4"/>
        {/* Motor connection */}
        <rect x="25" y="5" width="10" height="15" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 20 L30 25" stroke="currentColor" strokeWidth="2"/>
        {/* Base plate */}
        <rect x="20" y="45" width="20" height="8" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
      </svg>
    </BaseNode>
  );
}

// Compressor Node - Professional centrifugal compressor
function CompressorNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-orange-600 dark:text-orange-400">
        {/* Compressor casing */}
        <rect x="15" y="20" width="30" height="20" rx="5" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Impeller */}
        <circle cx="30" cy="30" r="8" fill="white" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 22 L30 38 M22 30 L38 30" stroke="currentColor" strokeWidth="1"/>
        {/* Inlet/outlet nozzles */}
        <path d="M5 30 L15 30" stroke="currentColor" strokeWidth="4"/>
        <path d="M45 30 L55 30" stroke="currentColor" strokeWidth="4"/>
        {/* Motor connection */}
        <rect x="25" y="5" width="10" height="15" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 20 L30 25" stroke="currentColor" strokeWidth="2"/>
        {/* Cooling fins */}
        <path d="M20 25 L20 35 M25 25 L25 35 M35 25 L35 35 M40 25 L40 35" stroke="currentColor" strokeWidth="1"/>
        {/* Base plate */}
        <rect x="20" y="45" width="20" height="8" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
      </svg>
    </BaseNode>
  );
}

// Valve Node - Professional gate valve
function ValveNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-gray-600 dark:text-gray-400">
        {/* Valve body */}
        <rect x="20" y="25" width="20" height="10" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Inlet/outlet pipes */}
        <path d="M5 30 L20 30 M40 30 L55 30" stroke="currentColor" strokeWidth="4"/>
        {/* Valve stem */}
        <path d="M30 25 L30 15" stroke="currentColor" strokeWidth="3"/>
        {/* Handwheel */}
        <circle cx="30" cy="15" r="6" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        <path d="M24 15 L36 15 M30 9 L30 21" stroke="white" strokeWidth="1"/>
        {/* Gate */}
        <rect x="28" y="27" width="4" height="6" fill="white" stroke="currentColor" strokeWidth="1"/>
      </svg>
    </BaseNode>
  );
}

// Mixer Node - Professional static mixer
function MixerNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-cyan-600 dark:text-cyan-400">
        {/* Mixer body */}
        <rect x="20" y="20" width="20" height="20" rx="3" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Inlet nozzles */}
        <path d="M5 25 L20 25 M5 35 L20 35" stroke="currentColor" strokeWidth="3"/>
        {/* Outlet nozzle */}
        <path d="M40 30 L55 30" stroke="currentColor" strokeWidth="4"/>
        {/* Mixing elements */}
        <path d="M25 25 L35 25 M25 30 L35 30 M25 35 L35 35" stroke="white" strokeWidth="1"/>
        <path d="M22 27 L38 27 M22 33 L38 33" stroke="white" strokeWidth="1"/>
        {/* Support brackets */}
        <path d="M15 45 L20 50 M40 45 L45 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Splitter Node - Professional stream splitter
function SplitterNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-indigo-600 dark:text-indigo-400">
        {/* Splitter body */}
        <circle cx="30" cy="30" r="12" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Inlet nozzle */}
        <path d="M5 30 L18 30" stroke="currentColor" strokeWidth="4"/>
        {/* Outlet nozzles */}
        <path d="M42 20 L55 20 M42 30 L55 30 M42 40 L55 40" stroke="currentColor" strokeWidth="3"/>
        {/* Internal flow paths */}
        <path d="M18 30 L25 25 M18 30 L25 30 M18 30 L25 35" stroke="white" strokeWidth="2"/>
        {/* Support legs */}
        <path d="M25 45 L25 50 M35 45 L35 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Distillation Column Node - Professional tray column
function DistillationColumnNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-cyan-600 dark:text-cyan-400">
        {/* Column shell */}
        <rect x="25" y="10" width="10" height="40" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Feed nozzle */}
        <path d="M5 30 L25 30" stroke="currentColor" strokeWidth="3"/>
        {/* Distillate outlet */}
        <path d="M30 5 L30 10" stroke="currentColor" strokeWidth="3"/>
        {/* Bottoms outlet */}
        <path d="M30 50 L30 55" stroke="currentColor" strokeWidth="3"/>
        {/* Trays */}
        <path d="M20 15 L35 15 M20 20 L35 20 M20 25 L35 25 M20 30 L35 30 M20 35 L35 35 M20 40 L35 40" stroke="white" strokeWidth="1"/>
        {/* Reflux line */}
        <path d="M35 10 L50 10" stroke="currentColor" strokeWidth="2"/>
        {/* Reboiler connection */}
        <path d="M35 50 L50 50" stroke="currentColor" strokeWidth="2"/>
        {/* Support skirt */}
        <path d="M20 55 L40 55" stroke="currentColor" strokeWidth="3"/>
      </svg>
    </BaseNode>
  );
}

// Storage Tank Node - Professional atmospheric tank
function StorageTankNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-teal-600 dark:text-teal-400">
        {/* Tank shell */}
        <rect x="15" y="15" width="30" height="25" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Tank bottom */}
        <ellipse cx="30" cy="40" rx="15" ry="5" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Inlet nozzle */}
        <path d="M5 25 L15 25" stroke="currentColor" strokeWidth="3"/>
        {/* Outlet nozzle */}
        <path d="M45 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Vent nozzle */}
        <path d="M30 5 L30 15" stroke="currentColor" strokeWidth="3"/>
        {/* Manway */}
        <circle cx="35" cy="20" r="3" fill="white" stroke="currentColor" strokeWidth="1"/>
        {/* Support legs */}
        <path d="M20 45 L20 50 M30 45 L30 50 M40 45 L40 50" stroke="currentColor" strokeWidth="2"/>
      </svg>
    </BaseNode>
  );
}

// Cooler Node - Professional air cooler
function CoolerNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-blue-600 dark:text-blue-400">
        {/* Cooler body */}
        <rect x="10" y="20" width="40" height="20" rx="3" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Process inlet/outlet */}
        <path d="M5 25 L10 25 M50 25 L55 25" stroke="currentColor" strokeWidth="3"/>
        <path d="M5 35 L10 35 M50 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Cooling fins */}
        <path d="M15 15 L15 45 M20 15 L20 45 M25 15 L25 45 M30 15 L30 45 M35 15 L35 45 M40 15 L40 45 M45 15 L45 45" stroke="currentColor" strokeWidth="1"/>
        {/* Fan */}
        <circle cx="30" cy="10" r="8" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
        <path d="M30 2 L30 18 M22 10 L38 10" stroke="white" strokeWidth="1"/>
      </svg>
    </BaseNode>
  );
}

// Heater Node - Professional fired heater
function HeaterNode({ data }: NodeProps) {
  return (
    <BaseNode data={data}>
      <svg width="60" height="60" viewBox="0 0 60 60" className="text-red-600 dark:text-red-400">
        {/* Heater body */}
        <rect x="10" y="20" width="40" height="20" rx="3" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Process inlet/outlet */}
        <path d="M5 25 L10 25 M50 25 L55 25" stroke="currentColor" strokeWidth="3"/>
        <path d="M5 35 L10 35 M50 35 L55 35" stroke="currentColor" strokeWidth="3"/>
        {/* Fire box */}
        <rect x="15" y="45" width="30" height="10" fill="currentColor" stroke="currentColor" strokeWidth="2"/>
        {/* Flames */}
        <path d="M20 45 L20 40 M25 45 L25 40 M30 45 L30 40 M35 45 L35 40 M40 45 L40 40" stroke="currentColor" strokeWidth="2"/>
        {/* Stack */}
        <path d="M30 35 L30 45" stroke="currentColor" strokeWidth="3"/>
      </svg>
    </BaseNode>
  );
}

// Additional simplified nodes for other equipment types
function FlashDrumNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FLASH</div></BaseNode>;
}

function AbsorberNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">ABS</div></BaseNode>;
}

function StripperNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">STRIP</div></BaseNode>;
}

function ExpanderNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EXP</div></BaseNode>;
}

function TurbineNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">TURB</div></BaseNode>;
}

function FilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FILT</div></BaseNode>;
}

function CrystallizerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CRYST</div></BaseNode>;
}

function DryerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">DRY</div></BaseNode>;
}

function EvaporatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EVAP</div></BaseNode>;
}

function CondenserNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">COND</div></BaseNode>;
}

function ReboilerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">REB</div></BaseNode>;
}

function PreheaterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">PREH</div></BaseNode>;
}

function IntercoolerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">IC</div></BaseNode>;
}

function AftercoolerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">AC</div></BaseNode>;
}

function EconomizerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">ECON</div></BaseNode>;
}

function SuperheaterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SH</div></BaseNode>;
}

function DesuperheaterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">DSH</div></BaseNode>;
}

function KnockoutDrumNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">KOD</div></BaseNode>;
}

function SurgeDrumNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SURGE</div></BaseNode>;
}

function RefluxDrumNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">REFLUX</div></BaseNode>;
}

function AccumulatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">ACCUM</div></BaseNode>;
}

function PhaseSeparatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">PHASE</div></BaseNode>;
}

function LiquidLiquidSeparatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">LL</div></BaseNode>;
}

function GasLiquidSeparatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">GL</div></BaseNode>;
}

function SolidLiquidSeparatorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SL</div></BaseNode>;
}

function CycloneNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CYCL</div></BaseNode>;
}

function ScrubberNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SCRUB</div></BaseNode>;
}

function ExtractorNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EXT</div></BaseNode>;
}

function DecanterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">DEC</div></BaseNode>;
}

function SettlerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SET</div></BaseNode>;
}

function ThickenerNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">THICK</div></BaseNode>;
}

function ClarifierNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CLAR</div></BaseNode>;
}

function CentrifugeNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CENT</div></BaseNode>;
}

function FilterPressNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FP</div></BaseNode>;
}

function BeltFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">BF</div></BaseNode>;
}

function VacuumFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">VF</div></BaseNode>;
}

function RotaryFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">RF</div></BaseNode>;
}

function PressureFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">PF</div></BaseNode>;
}

function GravityFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">GF</div></BaseNode>;
}

function MagneticFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">MF</div></BaseNode>;
}

function ElectrostaticFilterNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EF</div></BaseNode>;
}

function IonExchangeNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">IE</div></BaseNode>;
}

function AdsorptionNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">ADS</div></BaseNode>;
}

function AbsorptionNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">ABS</div></BaseNode>;
}

function StrippingNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">STRIP</div></BaseNode>;
}

function ExtractionNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EXT</div></BaseNode>;
}

function DistillationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">DIST</div></BaseNode>;
}

function RectificationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">RECT</div></BaseNode>;
}

function CrystallizationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CRYST</div></BaseNode>;
}

function PrecipitationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">PREC</div></BaseNode>;
}

function CoagulationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">COAG</div></BaseNode>;
}

function FlocculationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FLOCC</div></BaseNode>;
}

function SedimentationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SED</div></BaseNode>;
}

function FiltrationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FILT</div></BaseNode>;
}

function CentrifugationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CENT</div></BaseNode>;
}

function DryingNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">DRY</div></BaseNode>;
}

function EvaporationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">EVAP</div></BaseNode>;
}

function ConcentrationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">CONC</div></BaseNode>;
}

function PurificationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">PUR</div></BaseNode>;
}

function SeparationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">SEP</div></BaseNode>;
}

function FractionationNode({ data }: NodeProps) {
  return <BaseNode data={data}><div className="text-xs">FRAC</div></BaseNode>;
}
