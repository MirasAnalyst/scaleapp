# AI Building Design System

## Overview

This system generates AutoCAD DXF files from natural language descriptions of buildings using OpenAI's GPT-4 with function calling. The system converts building briefs into structured JSON specifications and then generates professional DXF files with proper layers, geometry, and annotations.

## Features

- **Natural Language Processing**: Convert building descriptions into structured specifications
- **OpenAI Function Calling**: Use GPT-4 to parse and validate building parameters
- **DXF Generation**: Create AutoCAD-compatible DXF files with proper layers
- **Professional Layers**: A-WALL-FULL, A-CORE, A-GRID, A-ANNO-TEXT
- **Validation**: Core clearance validation and parameter checking
- **Multiple Units**: Support for both meters and feet
- **Web Interface**: User-friendly UI for prompt input and file download

## System Architecture

### Core Components

1. **Zod Schema** (`lib/spec.ts`)
   - Strict validation for building specifications
   - Type-safe TypeScript interfaces
   - Comprehensive parameter validation

2. **OpenAI Integration** (`lib/openai.ts`)
   - Function calling with structured output
   - Error handling and validation
   - Temperature control for consistent results

3. **DXF Generator** (`lib/dxf.ts`)
   - Manual DXF file generation
   - Proper layer management
   - Professional geometry creation

4. **API Endpoint** (`app/api/generate/route.ts`)
   - RESTful API for DXF generation
   - File download with proper headers
   - Error handling and validation

5. **User Interface** (`app/autocad/civil/page.tsx`)
   - React-based input form
   - Sample prompts and examples
   - Real-time feedback and error handling

## Installation & Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key

### Installation

1. **Install Dependencies**
   ```bash
   npm install zod openai
   ```

2. **Environment Setup**
   Create `.env.local` file:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Navigate to `http://localhost:3000/autocad/civil`
   - Or use the API directly at `http://localhost:3000/api/generate`

## Usage

### Web Interface

1. Navigate to `/autocad/civil`
2. Enter a building description in the text area
3. Click "Generate DXF" to create and download the file
4. Open the DXF file in AutoCAD

### API Usage

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "50-story office tower called SkyOne on a 60×80 m site, setbacks 6/3/6 m, rectangle tower 42×30 m, grid 8.4×8.4 m, 4 stairs, 8 elevators, cores 14×22 m, typical floor 3.6 m"
  }' \
  -o building_plan.dxf
```

### Sample Prompts

**High-rise Office Building:**
```
50-story office/residential tower called SkyOne on a 60×80 m site, setbacks 6/3/6 m, rectangle tower 42×30 m, grid 8.4×8.4 m, 4 stairs, 8 elevators, cores 14×22 m, typical floor 3.6 m, setbacks every 10 floors by 2 m. Output plans + dxf only.
```

**Residential Building:**
```
30-story residential building called GreenTower on a 40×60 ft site, setbacks 5/3/5 ft, rectangle tower 30×20 ft, grid 6×6 ft, 2 stairs, 4 elevators, cores 12×18 ft, typical floor 10 ft.
```

**Office Complex:**
```
20-story office building called TechHub on a 50×70 m site, setbacks 8/4/8 m, rectangle tower 35×25 m, grid 7×7 m, 3 stairs, 6 elevators, cores 15×20 m, typical floor 3.5 m.
```

## Building Specification Schema

The system accepts the following parameters:

### Project Information
- **name**: Building name (string)
- **units**: "meters" or "feet"

### Site Details
- **width**: Site width (positive number)
- **depth**: Site depth (positive number)
- **setbacks**: Front, side, and rear setbacks (non-negative numbers)

### Grid System
- **bayX**: Grid bay width (positive number)
- **bayY**: Grid bay depth (positive number)

### Tower Configuration
- **floors**: Number of floors (positive integer)
- **typicalFloorHeight**: Floor height (positive number)
- **footprint**: Shape type ("rectangle")
- **footprintDims**: Width and depth (positive numbers)
- **setbacksEvery**: Setback frequency in floors (non-negative integer)
- **setbackDepth**: Setback depth (non-negative number)

### Core Layout
- **stairs**: Number of stairs (minimum 2)
- **elevators**: Number of elevators (minimum 2)
- **coreWidth**: Core width (positive number)
- **coreDepth**: Core depth (positive number)

### Output Options
- **plans**: Generate plans (boolean)
- **elevations**: Generate elevations (boolean)
- **sections**: Generate sections (boolean)
- **dxf**: Generate DXF (boolean)
- **ifc**: Generate IFC (boolean)

## Generated DXF Structure

### Layers
- **A-WALL-FULL**: Building footprint (white, continuous)
- **A-CORE**: Core layout (red, continuous)
- **A-GRID**: Structural grid (green, dashed)
- **A-ANNO-TEXT**: Annotations (blue, continuous)

### Geometry
- **Building Footprint**: Closed polyline representing the tower outline
- **Core Layout**: Closed polyline for stairs and elevators
- **Grid Lines**: Structural grid at specified spacing
- **Text Annotations**: Project information and dimensions

### Validation
- Core must fit within footprint with 1-unit clearance
- All dimensions must be positive
- Required parameters must be provided

## Error Handling

The system includes comprehensive error handling:

- **Validation Errors**: Zod schema validation with detailed error messages
- **OpenAI Errors**: API failures and parsing errors
- **DXF Generation Errors**: Geometry and layer creation issues
- **User Input Errors**: Missing or invalid prompts

## Testing

### Manual Testing
1. Use the web interface with sample prompts
2. Verify DXF files open correctly in AutoCAD
3. Check layer structure and geometry accuracy

### API Testing
```bash
# Test with valid prompt
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test building"}' \
  -v

# Test with invalid prompt
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": ""}' \
  -v
```

## File Structure

```
├── app/
│   ├── api/generate/route.ts          # API endpoint
│   └── autocad/civil/page.tsx         # UI page
├── lib/
│   ├── spec.ts                        # Zod schema and types
│   ├── openai.ts                      # OpenAI integration
│   └── dxf.ts                         # DXF generator
└── middleware.ts                      # Authentication middleware
```

## Dependencies

- **zod**: Schema validation
- **openai**: OpenAI API integration
- **next**: React framework
- **typescript**: Type safety

## Future Enhancements

- **3D Preview**: Three.js integration for building visualization
- **Additional Shapes**: Support for L-shaped and other footprint types
- **Advanced Validation**: More sophisticated clearance and code checking
- **Batch Processing**: Multiple building generation
- **Template System**: Predefined building types
- **IFC Export**: Building Information Modeling support

## Troubleshooting

### Common Issues

1. **OpenAI API Key Missing**
   - Ensure `OPENAI_API_KEY` is set in `.env.local`
   - Verify the API key is valid and has sufficient credits

2. **Authentication Errors**
   - Check middleware configuration
   - Ensure `/api/generate` is in public routes

3. **DXF File Issues**
   - Verify DXF content is properly formatted
   - Check AutoCAD version compatibility
   - Ensure layers are created correctly

4. **Build Errors**
   - Run `npm run build` to check for TypeScript errors
   - Verify all dependencies are installed
   - Check for missing imports or type errors

## Support

For issues or questions:
1. Check the error messages in the browser console
2. Verify API responses with curl commands
3. Test with sample prompts provided
4. Check the generated DXF file structure

## License

This system is part of the ScaleApp project and follows the same licensing terms.
