import { NextResponse } from 'next/server';

import { getEmptyState, hasPostgresConfig, readLayout, writeLayout } from '@/lib/layout-store';
import { AppState } from '@/lib/layout-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasPostgresConfig()) {
    return NextResponse.json(getEmptyState());
  }

  try {
    const state = await readLayout();
    return NextResponse.json(state);
  } catch (error) {
    console.error(error);
    return NextResponse.json(getEmptyState(), { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!hasPostgresConfig()) {
    return NextResponse.json({ message: 'Postgres is not configured.' }, { status: 500 });
  }

  try {
    const nextState = (await request.json()) as AppState;
    const saved = await writeLayout(nextState);
    return NextResponse.json(saved);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to save layout.' }, { status: 500 });
  }
}
