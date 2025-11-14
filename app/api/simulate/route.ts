import { NextRequest, NextResponse } from 'next/server';

const DWSIM_API_URL = process.env.DWSIM_API_URL ?? 'http://localhost:8081';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const response = await fetch(`${DWSIM_API_URL}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `DWSIM service error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Simulation proxy error', error);
    return NextResponse.json({ error: 'Failed to proxy simulation request' }, { status: 500 });
  }
}
