# Process Flowsheet Builder

A Next.js 14 application that converts natural language process descriptions into interactive process flowsheets using React Flow and generates Aspen HYSYS simulation instructions.

## Features

- **Natural Language Processing**: Convert text descriptions into process flowsheets
- **Interactive Flow Diagrams**: Built with React Flow for drag-and-drop functionality
- **Custom SVG Nodes**: 50+ process equipment types with visual representations
- **Aspen HYSYS Integration**: Generates step-by-step simulation instructions
- **History Management**: Saves flowsheet history to localStorage
- **Export Functionality**: Download flowsheets and instructions as JSON/text files
- **Dark Mode Support**: Full theme switching capability

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env.local` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```
   
   Get your OpenAI API key from: https://platform.openai.com/api-keys

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Access the Builder**
   Navigate to `http://localhost:3000/builder`

## Usage

1. **Enter Process Description**: Describe your chemical process in natural language
2. **Generate Flowsheet**: Click "Generate Flowsheet" to create the interactive diagram
3. **View Aspen Instructions**: Check the sidebar for detailed HYSYS setup instructions
4. **Save History**: All flowsheets are automatically saved to localStorage
5. **Export Data**: Download flowsheets and instructions for external use

## Example Prompts

- "Create a distillation column to separate ethanol from water with a reboiler and condenser"
- "Design a heat exchanger network for crude oil preheating with multiple heat exchangers"
- "Build a reactor system with feed preheating, reaction, and product separation"
- "Create a gas absorption column with stripper and regenerator"

## Equipment Types Supported

The builder supports 50+ equipment types including:
- Reactors, Separators, Heat Exchangers
- Pumps, Compressors, Valves
- Distillation Columns, Storage Tanks
- Mixers, Splitters, Filters
- And many more specialized equipment

## API Endpoints

- `POST /api/flowsheet` - Generate flowsheet from natural language prompt

## Technologies Used

- Next.js 14 (App Router)
- React Flow (@xyflow/react)
- OpenAI GPT-4o
- Tailwind CSS
- Next Themes
- TypeScript
- Lucide React Icons

## File Structure

```
app/
├── api/flowsheet/route.ts    # OpenAI API integration
├── builder/page.tsx          # Main builder interface
└── layout.tsx               # Root layout with theme provider

components/
├── ProcessNodes.tsx         # Custom React Flow nodes
└── Header.tsx              # Navigation with builder link
```

## Security Notes

- API routes are protected and validate input
- OpenAI API key is server-side only
- No sensitive data is stored in localStorage
- All API responses are validated before use
