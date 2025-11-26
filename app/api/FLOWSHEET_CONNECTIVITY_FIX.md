# Flowsheet Connectivity Fix - Isolated Equipment Resolution

## Problem
The AI was generating flowsheets with isolated equipment (especially heat exchangers like "hx-cooler-1") that had no connections to the main process flow. This caused validation errors: "Isolated equipment found after retry: hx-cooler-1. All equipment must be connected to the main process flow."

## Root Cause
The AI prompt, while comprehensive, needed:
1. More explicit and forceful connectivity requirements
2. Concrete examples showing exactly how to connect heat exchangers
3. Mandatory pre-return validation checks
4. Stronger retry prompts with specific guidance for isolated equipment

## Fixes Applied

### 1. Enhanced Heat Exchanger Connectivity Section
**Location**: `app/api/flowsheet/route.ts`, lines 262-268

**Changes**:
- Added explicit requirement that heat exchangers MUST have edges created in the same response
- Added concrete JSON examples showing exact edge structure
- Added mandatory rule: For every heat exchanger in nodes[], there MUST be at least one edge in edges[] that has that heat exchanger as source OR target
- Added instruction to NOT create heat exchangers if they cannot be logically connected

### 2. Strengthened Absolute Rule Section
**Location**: `app/api/flowsheet/route.ts`, lines 254-260

**Changes**:
- Added mandatory check: Every node.id in nodes[] must appear in at least one edge in edges[]
- Added verification requirement: Count nodes vs. unique node IDs in edges - these must match

### 3. Enhanced Validation Checklist
**Location**: `app/api/flowsheet/route.ts`, lines 290-310

**Changes**:
- Converted to numbered checklist (21 items) for easier verification
- Added mandatory connectivity check (#16)
- Added mandatory heat exchanger check (#17)
- Added final connectivity verification section with step-by-step instructions

### 4. Improved Retry Prompt for Isolated Equipment
**Location**: `app/api/flowsheet/route.ts`, lines 704-721

**Changes**:
- More detailed error messages with specific equipment IDs and types
- Concrete JSON examples for fixing isolated heat exchangers
- Clear instructions: either add edges OR remove the node
- Verification step: Check that equipment appears in edges after fixing

### 5. Enhanced Retry Prompt Guidance
**Location**: `app/api/flowsheet/route.ts`, lines 724-791

**Changes**:
- More forceful language ("CRITICAL ERROR", "MANDATORY FIX REQUIRED")
- Specific examples using actual isolated equipment IDs from the error
- Step-by-step instructions for adding edges
- Clear alternative: Remove equipment if it cannot be connected
- Mandatory pre-return checklist with node counting verification

### 6. Added Pre-Return Verification Section
**Location**: `app/api/flowsheet/route.ts`, after line 288

**Changes**:
- Added mandatory connectivity verification section before "Create meaningful connections"
- Step-by-step instructions for checking connectivity
- Clear options: Add edges OR remove nodes
- Explicit warning that isolated equipment will cause failure

### 7. Improved Error Response
**Location**: `app/api/flowsheet/route.ts`, lines 685-689

**Changes**:
- More detailed error response with equipment details
- Includes type and label information for isolated equipment
- Provides diagnostic information (total nodes, edges, connected nodes)

## Key Improvements

1. **Explicit Examples**: The prompt now includes concrete JSON examples showing exactly how to connect heat exchangers
2. **Mandatory Checks**: Added multiple mandatory verification steps the AI must perform before returning JSON
3. **Clear Alternatives**: The AI is explicitly told it can either connect equipment OR remove it
4. **Stronger Language**: Used more forceful language ("MANDATORY", "CRITICAL", "MUST") to emphasize importance
5. **Step-by-Step Instructions**: Added numbered checklists and verification steps
6. **Better Error Messages**: Error responses now include detailed diagnostic information

## Expected Behavior After Fixes

1. **Initial Generation**: The AI will be more careful about connectivity from the start
2. **Validation**: If isolated equipment is detected, the retry prompt will be much more specific
3. **Retry Success**: The enhanced retry prompt should successfully guide the AI to either connect or remove isolated equipment
4. **Error Messages**: If retry still fails, error messages will provide detailed diagnostic information

## Testing

To verify the fixes work:

1. Generate a flowsheet that includes a heat exchanger (e.g., "Create a process with a cooler")
2. Check that the heat exchanger is connected via edges
3. If isolated equipment error occurs, verify the retry prompt includes specific guidance
4. Verify the final flowsheet has all equipment connected

## Notes

- The fixes are backward-compatible - existing valid flowsheets will continue to work
- The enhanced prompts may result in slightly longer generation times due to additional validation checks
- The AI may be more conservative (removing equipment it cannot connect) rather than creating isolated units

