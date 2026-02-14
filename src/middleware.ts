import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const match = pathname.match(/^\/(google[a-zA-Z0-9_-]+\.html)$/);
  if (match) {
    const filename = match[1];
    const content = `google-site-verification: ${filename}`;
    return new NextResponse(content, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.next();
}
