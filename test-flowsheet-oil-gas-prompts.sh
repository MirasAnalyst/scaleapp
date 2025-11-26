#!/bin/bash
# Test script for flowsheet generation with various oil and gas prompts
# Requires: Next.js dev server running on http://localhost:3000
# Usage: ./test-flowsheet-oil-gas-prompts.sh

BASE_URL="http://localhost:3000/api/flowsheet"
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing Flowsheet Generation with Oil & Gas Prompts"
echo "======================================================"
echo ""

# Function to test a prompt
test_prompt() {
    local name="$1"
    local prompt="$2"
    TEST_COUNT=$((TEST_COUNT + 1))
    
    echo "${YELLOW}Test $TEST_COUNT: $name${NC}"
    echo "Prompt: $prompt"
    echo ""
    
    # Make API call
    response=$(curl -s -X POST "$BASE_URL" \
        -H "Content-Type: application/json" \
        -d "{\"prompt\": \"$prompt\"}" \
        -w "\n%{http_code}")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        # Check for isolated equipment
        if echo "$body" | grep -q "error"; then
            echo "${RED}✗ FAILED: Error in response${NC}"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        else
            # Parse JSON and check connectivity
            nodes=$(echo "$body" | jq '.nodes | length' 2>/dev/null)
            edges=$(echo "$body" | jq '.edges | length' 2>/dev/null)
            
            # Check if all nodes are connected
            node_ids=$(echo "$body" | jq -r '.nodes[].id' 2>/dev/null)
            edge_sources=$(echo "$body" | jq -r '.edges[].source' 2>/dev/null)
            edge_targets=$(echo "$body" | jq -r '.edges[].target' 2>/dev/null)
            
            isolated_nodes=""
            for node_id in $node_ids; do
                if ! echo "$edge_sources $edge_targets" | grep -q "$node_id"; then
                    isolated_nodes="$isolated_nodes $node_id"
                fi
            done
            
            if [ -n "$isolated_nodes" ]; then
                echo "${RED}✗ FAILED: Isolated equipment detected:$isolated_nodes${NC}"
                FAIL_COUNT=$((FAIL_COUNT + 1))
            else
                echo "${GREEN}✓ PASSED: All equipment connected${NC}"
                echo "  Nodes: $nodes, Edges: $edges"
                PASS_COUNT=$((PASS_COUNT + 1))
            fi
        fi
    else
        echo "${RED}✗ FAILED: HTTP $http_code${NC}"
        echo "$body"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    echo ""
    echo "---"
    echo ""
}

# Check if server is running
if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo "${RED}Error: Cannot connect to $BASE_URL${NC}"
    echo "Please make sure the Next.js dev server is running:"
    echo "  npm run dev"
    exit 1
fi

# Test prompts
test_prompt "Three-Phase Separation" \
    "Create a three-phase separator process for oil, gas, and water separation. Include pumps for each phase and a cooler for the gas stream."

test_prompt "Crude Oil Distillation" \
    "Design a crude oil distillation unit with a preheater, atmospheric distillation column, and product coolers for overhead and bottoms streams."

test_prompt "Gas Processing with Dehydration" \
    "Create a natural gas processing flowsheet with a separator, gas compressor, cooler, and dehydration column."

test_prompt "Oil Refining with Heat Integration" \
    "Design an oil refining process with a feed preheater, flash drum, distillation column, overhead condenser, and product coolers."

test_prompt "LPG Recovery" \
    "Create an LPG recovery process with a feed cooler, separator, compressor, and distillation column for propane and butane separation."

test_prompt "Gas Sweetening" \
    "Design a gas sweetening process with a feed separator, amine absorber column, regenerator column, and heat exchangers for amine circulation."

test_prompt "Crude Stabilization" \
    "Create a crude oil stabilization process with a feed heater, flash drum, compressor, and product cooler."

test_prompt "Fractionation Train" \
    "Design a fractionation train with multiple distillation columns, inter-column heat exchangers, and product coolers."

# Summary
echo "======================================================"
echo "Test Summary"
echo "======================================================"
echo "Total Tests: $TEST_COUNT"
echo "${GREEN}Passed: $PASS_COUNT${NC}"
echo "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo "${RED}❌ Some tests failed${NC}"
    exit 1
fi

