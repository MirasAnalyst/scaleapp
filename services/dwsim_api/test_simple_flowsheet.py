#!/usr/bin/env python3
"""Test script to create and run a simple flowsheet using the JSON-to-DWSIM mapping."""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.schemas import FlowsheetPayload, UnitSpec, StreamSpec, ThermoConfig
from app.dwsim_client import DWSIMClient
from loguru import logger

# Set up logging
logger.remove()
logger.add(sys.stderr, level="DEBUG")

def test_simple_flowsheet():
    """Test with a simple flowsheet: Feed -> Pump -> Product"""
    
    # Create a simple test payload
    payload = FlowsheetPayload(
        name="simple-test",
        units=[
            UnitSpec(
                id="pump-1",
                type="pump",
                name="Feed Pump",
                parameters={
                    "x": 300,
                    "y": 200,
                    "pressure_rise": 100,  # kPa
                    "efficiency": 0.75
                }
            )
        ],
        streams=[
            StreamSpec(
                id="feed-1",
                name="Feed Stream",
                source=None,  # Feed stream has no source
                target="pump-1",
                properties={
                    "temperature": 25,  # Celsius
                    "pressure": 101.3,  # kPa
                    "flow_rate": 1000,  # kg/h
                    "composition": {
                        "Water": 1.0
                    }
                }
            ),
            StreamSpec(
                id="product-1",
                name="Product Stream",
                source="pump-1",
                target=None,  # Product stream has no target
                properties={}
            )
        ],
        thermo=ThermoConfig(
            package="Peng-Robinson",
            components=["Water"]
        )
    )
    
    logger.info("Testing simple flowsheet creation...")
    logger.info(f"Units: {len(payload.units)}")
    logger.info(f"Streams: {len(payload.streams)}")
    logger.info(f"Components: {payload.thermo.components}")
    
    try:
        client = DWSIMClient()
        result = client.simulate_flowsheet(payload)
        
        logger.info("\n=== Simulation Results ===")
        logger.info(f"Status: {result.status}")
        logger.info(f"Flowsheet name: {result.flowsheet_name}")
        logger.info(f"Streams: {len(result.streams)}")
        logger.info(f"Units: {len(result.units)}")
        logger.info(f"Warnings: {len(result.warnings)}")
        
        if result.warnings:
            logger.info("\nWarnings:")
            for warning in result.warnings:
                logger.info(f"  - {warning}")
        
        if result.streams:
            logger.info("\nStream Results:")
            for stream in result.streams:
                logger.info(f"  {stream.id}:")
                logger.info(f"    Temperature: {stream.temperature_c}°C")
                logger.info(f"    Pressure: {stream.pressure_kpa} kPa")
                logger.info(f"    Mass flow: {stream.mass_flow_kg_per_h} kg/h")
        
        if result.units:
            logger.info("\nUnit Results:")
            for unit in result.units:
                logger.info(f"  {unit.id}:")
                logger.info(f"    Duty: {unit.duty_kw} kW")
                logger.info(f"    Status: {unit.status}")
        
        logger.info(f"\nDiagnostics: {result.diagnostics}")
        
        return result
        
    except Exception as e:
        logger.exception(f"Error testing flowsheet: {e}")
        return None

if __name__ == "__main__":
    test_simple_flowsheet()

