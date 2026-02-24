import { NextResponse } from 'next/server';

const DWSIM_API_URL = process.env.DWSIM_API_URL ?? 'http://localhost:8081';

export async function GET() {
  try {
    const response = await fetch(`${DWSIM_API_URL}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json({ status: 'error', message: 'Backend returned non-OK status' }, { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json({ status: 'ok', backend: data });
  } catch {
    return NextResponse.json(
      { status: 'offline', message: 'Python backend is not reachable' },
      { status: 502 }
    );
  }
}
