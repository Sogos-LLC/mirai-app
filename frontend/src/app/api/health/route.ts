import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Kubernetes probes.
 * This endpoint bypasses the auth middleware (middleware.ts skips /api routes).
 */
export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
