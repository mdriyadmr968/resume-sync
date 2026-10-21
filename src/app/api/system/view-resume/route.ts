import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/core/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const resume = id
      ? await prisma.resume.findUnique({ where: { id } })
      : await prisma.resume.findFirst({ where: { isCurrent: true } });

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const pathToRead = fs.existsSync(resume.archivePath)
      ? resume.archivePath
      : resume.filePath;

    if (!fs.existsSync(pathToRead)) {
      return NextResponse.json(
        { error: "Resume file not found on disk" },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(pathToRead);
    const isPdf = resume.fileName.toLowerCase().endsWith(".pdf");

    return new Response(buffer, {
      headers: {
        "Content-Type": isPdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `inline; filename="${resume.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
