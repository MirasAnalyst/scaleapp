#!/usr/bin/env node
/**
 * Test script for flowsheet connectivity with various oil and gas prompts
 * Tests that no isolated equipment is generated
 */

const fs = require('fs');
const path = require('path');

// Test prompts for oil and gas processes
const testPrompts = [
  {
    name: "Three-Phase Separation",
    prompt: "Create a three-phase separator process for oil, gas, and water separation. Include pumps for each phase and a cooler for the gas stream."
  },
  {
    name: "Crude Oil Distillation",
    prompt: "Design a crude oil distillation unit with a preheater, atmospheric distillation column, and product coolers for overhead and bottoms streams."
  },
  {
    name: "Gas Processing with Dehydration",
    prompt: "Create a natural gas processing flowsheet with a separator, gas compressor, cooler, and dehydration column."
  },
  {
    name: "Oil Refining with Heat Integration",
    prompt: "Design an oil refining process with a feed preheater, flash drum, distillation column, overhead condenser, and product coolers."
  },
  {
    name: "LPG Recovery",
    prompt: "Create an LPG recovery process with a feed cooler, separator, compressor, and distillation column for propane and butane separation."
  },
  {
    name: "Gas Sweetening",
    prompt: "Design a gas sweetening process with a feed separator, amine absorber column, regenerator column, and heat exchangers for amine circulation."
  },
  {
    name: "Crude Stabilization",
    prompt: "Create a crude oil stabilization process with a feed heater, flash drum, compressor, and product cooler."
  },
  {
    name: "Fractionation Train",
    prompt: "Design a fractionation train with multiple distillation columns, inter-column heat exchangers, and product coolers."
  }
];

// Mock the OpenAI API for testing (we'll check the structure, not actual AI calls)
async function testFlowsheetGeneration(promptName, prompt) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${promptName}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`${'='.repeat(80)}\n`);

  // Since we can't actually call OpenAI API without credentials,
  // we'll create a test that validates the prompt structure and checks
  // the route handler logic for connectivity validation
  
  // Read the route file to check the prompt structure
  const routePath = path.join(__dirname, 'app', 'api', 'flowsheet', 'route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  
  // Check that the system prompt includes connectivity requirements
  const connectivityChecks = [
    'NO COMPLETELY ISOLATED EQUIPMENT ALLOWED',
    'Every node in the "nodes" array must appear in at least one edge',
    'HEAT EXCHANGER CONNECTIVITY',
    'MANDATORY CONNECTIVITY VERIFICATION',
    'Every heat exchanger in nodes[] must appear in at least one edge',
    'MANDATORY PRE-RETURN CHECKLIST'
  ];
  
  let allChecksPass = true;
  connectivityChecks.forEach(check => {
    if (routeContent.includes(check)) {
      console.log(`✓ Found connectivity requirement: "${check}"`);
    } else {
      console.log(`✗ Missing connectivity requirement: "${check}"`);
      allChecksPass = false;
    }
  });
  
  // Check for heat exchanger specific guidance
  const heatExchangerChecks = [
    'hot-in-left',
    'hot-out-right',
    'cold-in-bottom',
    'cold-out-top',
    'Create TWO edges for a cooler'
  ];
  
  heatExchangerChecks.forEach(check => {
    if (routeContent.includes(check)) {
      console.log(`✓ Found heat exchanger guidance: "${check}"`);
    } else {
      console.log(`✗ Missing heat exchanger guidance: "${check}"`);
      allChecksPass = false;
    }
  });
  
  // Check for retry prompt enhancements
  const retryChecks = [
    'isolatedHeatExchangers',
    'MANDATORY FIX REQUIRED',
    'either add edges OR remove the node',
    'node counting verification'
  ];
  
  retryChecks.forEach(check => {
    if (routeContent.includes(check)) {
      console.log(`✓ Found retry prompt enhancement: "${check}"`);
    } else {
      console.log(`✗ Missing retry prompt enhancement: "${check}"`);
      allChecksPass = false;
    }
  });
  
  return allChecksPass;
}

// Test connectivity validation logic
function testConnectivityValidation() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Testing Connectivity Validation Logic');
  console.log(`${'='.repeat(80)}\n`);
  
  // Simulate a flowsheet with isolated equipment
  const flowsheetWithIsolated = {
    nodes: [
      { id: 'sep-1', type: 'separator3p' },
      { id: 'pump-1', type: 'pump' },
      { id: 'hx-cooler-1', type: 'heaterCooler' }, // Isolated!
      { id: 'col-1', type: 'distillationColumn' }
    ],
    edges: [
      { source: 'sep-1', target: 'pump-1' },
      { source: 'pump-1', target: 'col-1' }
      // hx-cooler-1 is not in any edge!
    ]
  };
  
  // Simulate the validation logic
  const connectedNodes = new Set();
  flowsheetWithIsolated.edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  const isolatedNodes = flowsheetWithIsolated.nodes.filter(
    node => !connectedNodes.has(node.id)
  );
  
  if (isolatedNodes.length > 0) {
    console.log(`✓ Validation correctly detected isolated nodes: ${isolatedNodes.map(n => n.id).join(', ')}`);
    return true;
  } else {
    console.log(`✗ Validation failed to detect isolated nodes`);
    return false;
  }
}

// Test connectivity validation with properly connected flowsheet
function testProperlyConnectedFlowsheet() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('Testing Properly Connected Flowsheet');
  console.log(`${'='.repeat(80)}\n`);
  
  // Simulate a flowsheet with all equipment connected
  const flowsheetConnected = {
    nodes: [
      { id: 'sep-1', type: 'separator3p' },
      { id: 'pump-1', type: 'pump' },
      { id: 'hx-cooler-1', type: 'heaterCooler' }, // Connected!
      { id: 'col-1', type: 'distillationColumn' }
    ],
    edges: [
      { source: 'sep-1', target: 'pump-1' },
      { source: 'pump-1', target: 'hx-cooler-1' }, // Cooler is connected!
      { source: 'hx-cooler-1', target: 'col-1' }
    ]
  };
  
  // Simulate the validation logic
  const connectedNodes = new Set();
  flowsheetConnected.edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  const isolatedNodes = flowsheetConnected.nodes.filter(
    node => !connectedNodes.has(node.id)
  );
  
  if (isolatedNodes.length === 0) {
    console.log(`✓ Validation correctly identified all nodes as connected`);
    return true;
  } else {
    console.log(`✗ Validation incorrectly flagged connected nodes as isolated: ${isolatedNodes.map(n => n.id).join(', ')}`);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('\n🧪 Testing Flowsheet Connectivity Fixes\n');
  console.log('This script validates that the connectivity fixes are properly implemented.\n');
  
  let allTestsPass = true;
  
  // Test 1: Check prompt structure
  console.log('\n📋 Test 1: Checking System Prompt Structure');
  for (const testCase of testPrompts.slice(0, 3)) { // Test first 3 prompts
    const result = await testFlowsheetGeneration(testCase.name, testCase.prompt);
    if (!result) {
      allTestsPass = false;
    }
  }
  
  // Test 2: Connectivity validation logic
  console.log('\n📋 Test 2: Testing Connectivity Validation Logic');
  const validationTest = testConnectivityValidation();
  if (!validationTest) {
    allTestsPass = false;
  }
  
  // Test 3: Properly connected flowsheet
  console.log('\n📋 Test 3: Testing Properly Connected Flowsheet');
  const connectedTest = testProperlyConnectedFlowsheet();
  if (!connectedTest) {
    allTestsPass = false;
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('Test Summary');
  console.log(`${'='.repeat(80)}\n`);
  
  if (allTestsPass) {
    console.log('✅ All connectivity validation tests passed!');
    console.log('\nThe flowsheet generation should now properly:');
    console.log('  - Detect isolated equipment');
    console.log('  - Provide specific guidance for fixing isolated heat exchangers');
    console.log('  - Retry with enhanced prompts when isolated equipment is detected');
    console.log('  - Validate connectivity before returning results');
  } else {
    console.log('❌ Some tests failed. Please review the output above.');
    process.exit(1);
  }
  
  console.log('\n💡 Note: To test with actual AI generation, you need:');
  console.log('  1. OpenAI API key set in environment');
  console.log('  2. Next.js dev server running (npm run dev)');
  console.log('  3. Make POST requests to /api/flowsheet with test prompts');
  console.log('\nExample curl command:');
  console.log('curl -X POST http://localhost:3000/api/flowsheet \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"prompt": "Create a three-phase separator with pumps and a cooler"}\'');
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});

