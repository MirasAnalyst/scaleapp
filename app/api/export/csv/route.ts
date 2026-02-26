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
    const body = await request.json();

    const response = await fetch(`${DWSIM_API_URL}/export/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Export error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const csvText = await response.text();
    return new NextResponse(csvText, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': response.headers.get('Content-Disposition') ?? 'attachment; filename="flowsheet.csv"',
      },
    });
  } catch (error) {
    console.error('CSV export proxy error', error);
    if (isConnectionError(error)) {
      return NextResponse.json({ error: BACKEND_OFFLINE_MSG }, { status: 502 });
    }
    return NextResponse.json(
      { error: 'Failed to reach simulation backend for export.' },
      { status: 502 }
    );
  }
}
