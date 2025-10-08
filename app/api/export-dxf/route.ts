// Temporarily disabled - using new building design system
// This endpoint is replaced by /api/generate

export async function POST() {
  return new Response(JSON.stringify({ 
    error: "This endpoint is deprecated. Use /api/generate instead." 
  }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}