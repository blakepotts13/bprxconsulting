import { clerkMiddleware } from "@clerk/nextjs/server";

// Include extensions: the reference's scripts, WASM and data require authentication too.
export default clerkMiddleware();

export const config = { matcher: ["/tools/:path*"] };
