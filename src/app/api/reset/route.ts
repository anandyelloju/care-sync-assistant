import { NextResponse } from "next/server";
import { resetSchedule } from "../../../data/mockSchedule";

export async function POST() {
  try {
    resetSchedule();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset mock schedule.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
