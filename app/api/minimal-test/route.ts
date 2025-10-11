import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'Minimal test works', timestamp: new Date().toISOString() });
}

export async function GET() {
  return NextResponse.json({ message: 'Minimal test GET works' });
}
