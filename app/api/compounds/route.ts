import { NextRequest, NextResponse } from 'next/server';

const DWSIM_API_URL = process.env.DWSIM_API_URL ?? 'http://localhost:8081';

const BACKEND_OFFLINE_MSG =
  'Python simulation backend is not running. Start it with: cd services/dwsim_api && uvicorn app.main:app --host 0.0.0.0 --port 8081';

function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'fetch failed') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const limit = searchParams.get('limit') ?? '20';

    const url = `${DWSIM_API_URL}/compounds?query=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Compounds proxy error', error);
    if (isConnectionError(error)) {
      return NextResponse.json({ error: BACKEND_OFFLINE_MSG }, { status: 502 });
    }
    return NextResponse.json(
      { error: 'Failed to reach simulation backend.' },
      { status: 502 }
    );
  }
}
