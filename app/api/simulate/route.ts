import { NextRequest, NextResponse } from 'next/server';

const DWSIM_API_URL = process.env.DWSIM_API_URL ?? 'http://localhost:8081';

const BACKEND_OFFLINE_MSG =
  'Simulation backend is not reachable. It may be starting up — please wait a moment and try again.';

function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'fetch failed') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|abort/i.test(msg);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const response = await fetch(`${DWSIM_API_URL}/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Simulation service error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Simulation proxy error', error);
    if (isConnectionError(error)) {
      return NextResponse.json({ error: BACKEND_OFFLINE_MSG }, { status: 502 });
    }
    return NextResponse.json(
      { error: 'Failed to proxy simulation request' },
      { status: 500 }
    );
  }
}
