#!/bin/bash

# Test script for DWSIM API
# Usage: ./test_dwsim_api.sh [api_url]
# Example: ./test_dwsim_api.sh http://192.168.1.100:8081

API_URL="${1:-http://20.14.73.190:8081}"

echo "Testing DWSIM API at: $API_URL"
echo ""

# Test 1: Health check
echo "=== Test 1: Health Check ==="
curl -s "$API_URL/healthz" | jq '.' || echo "Health check failed"
echo ""

# Test 2: Simple separator flowsheet
echo "=== Test 2: Simple Separator Flowsheet ==="
echo "Payload: test_dwsim_payload.json"
curl -s -X POST "$API_URL/simulate" \
  -H "Content-Type: application/json" \
  -d @test_dwsim_payload.json | jq '.' || echo "Test 2 failed"
echo ""

# Test 3: Pump flowsheet
echo "=== Test 3: Pump Flowsheet ==="
echo "Payload: test_dwsim_payload_pump.json"
curl -s -X POST "$API_URL/simulate" \
  -H "Content-Type: application/json" \
  -d @test_dwsim_payload_pump.json | jq '.' || echo "Test 3 failed"
echo ""

echo "=== Testing Complete ==="

