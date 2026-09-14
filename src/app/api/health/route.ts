import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/controllers/health.controller";

export async function GET() {
    const result = await checkDatabaseConnection();

    if(!result.success) {
        return NextResponse.json(result, {status: 500});
    }

    return NextResponse.json(result);
}